mod chat;
mod error;
mod import;
mod keys;
mod memory;
mod models;
mod routes;

use std::{net::SocketAddr, sync::Arc};

use axum::{extract::DefaultBodyLimit, http::HeaderValue, routing::get, Router};
use sqlx::postgres::PgPoolOptions;
use tower_http::{
    cors::{AllowOrigin, Any, CorsLayer},
    trace::TraceLayer,
};
use tracing_subscriber::EnvFilter;

#[derive(Clone)]
pub struct AppState {
    pub db: sqlx::PgPool,
    pub openrouter: Arc<chat::OpenRouter>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();
    tracing_subscriber::fmt()
        .with_env_filter(
            EnvFilter::try_from_default_env().unwrap_or_else(|_| "orchid_api=info,tower_http=info".into()),
        )
        .init();

    let database_url = std::env::var("DATABASE_URL").map_err(|_| anyhow::anyhow!("DATABASE_URL is not set"))?;
    let db = PgPoolOptions::new().max_connections(10).connect(&database_url).await?;
    sqlx::migrate!("./migrations").run(&db).await?;

    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(String::as_str) {
        Some("import-keys") if args.len() == 3 => return import::import_keys(&db, &args[2]).await,
        Some("import-supabase") if args.len() == 4 => {
            return import::import_supabase(&db, &args[2], &args[3]).await;
        }
        Some(_) => {
            eprintln!("usage:\n  orchid-api                       run the server\n  orchid-api import-keys <file>    add OpenRouter keys from a CSV or text file\n  orchid-api import-supabase <url> <anon-key>");
            std::process::exit(2);
        }
        None => {}
    }

    // Keys in OPENROUTER_API_KEYS are added to the pool on startup.
    let env_keys: Vec<String> = std::env::var("OPENROUTER_API_KEYS")
        .or_else(|_| std::env::var("OPENROUTER_API_KEY"))
        .unwrap_or_default()
        .split(',')
        .map(String::from)
        .collect();
    keys::KeyPool::add_keys(&db, &env_keys).await?;
    let pool = keys::KeyPool::new(db.clone());
    match pool.active_count().await? {
        0 => tracing::warn!("no OpenRouter API keys in the pool; run `orchid-api import-keys <file>`"),
        n => tracing::info!("{n} OpenRouter API keys in the pool"),
    }
    let openrouter = Arc::new(chat::OpenRouter::new(pool));

    let state = AppState { db, openrouter };

    let app = Router::new()
        .route("/api/health", get(|| async { "ok" }))
        .merge(routes::router())
        .merge(chat::router())
        .with_state(state)
        // Chat requests can carry base64 images.
        .layer(DefaultBodyLimit::max(20 * 1024 * 1024))
        .layer(cors_layer())
        .layer(TraceLayer::new_for_http());

    let port: u16 = std::env::var("PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8787);
    let host: std::net::IpAddr = std::env::var("HOST")
        .ok()
        .and_then(|h| h.parse().ok())
        .unwrap_or([127, 0, 0, 1].into());
    let addr = SocketAddr::new(host, port);
    let listener = tokio::net::TcpListener::bind(addr)
        .await
        .map_err(|err| anyhow::anyhow!("cannot listen on {addr}: {err}"))?;
    tracing::info!("listening on http://{addr}");
    axum::serve(listener, app).await?;
    Ok(())
}

/// CORS_ORIGINS is a comma-separated list of allowed origins, or "*" for any.
fn cors_layer() -> CorsLayer {
    let origins = std::env::var("CORS_ORIGINS").unwrap_or_else(|_| "*".into());
    let layer = CorsLayer::new().allow_methods(Any).allow_headers(Any);
    if origins.trim() == "*" {
        return layer.allow_origin(Any);
    }
    let list: Vec<HeaderValue> = origins
        .split(',')
        .map(str::trim)
        .filter(|o| !o.is_empty())
        .filter_map(|o| o.parse().ok())
        .collect();
    layer.allow_origin(AllowOrigin::list(list))
}

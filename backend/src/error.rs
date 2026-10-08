use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

pub enum AppError {
    NotFound,
    BadRequest(String),
    Internal(anyhow::Error),
}

pub type AppResult<T> = Result<T, AppError>;

impl<E: Into<anyhow::Error>> From<E> for AppError {
    fn from(err: E) -> Self {
        AppError::Internal(err.into())
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            AppError::NotFound => (StatusCode::NOT_FOUND, "Not found".to_string()),
            AppError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg),
            AppError::Internal(err) => {
                tracing::error!("internal error: {err:#}");
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
            }
        };
        (status, Json(json!({ "error": message }))).into_response()
    }
}

/// Turns `Option<T>` from a query into a 404 when it is `None`.
pub trait OrNotFound<T> {
    fn or_not_found(self) -> AppResult<T>;
}

impl<T> OrNotFound<T> for Option<T> {
    fn or_not_found(self) -> AppResult<T> {
        self.ok_or(AppError::NotFound)
    }
}

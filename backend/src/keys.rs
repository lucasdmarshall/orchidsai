//! Pool of OpenRouter API keys stored in the `api_keys` table.
//!
//! Each chat request leases a random active key. A key is never handed to
//! two in-flight requests at once while another key is free, and the same key
//! is not picked twice in a row. Keys that are rate-limited cool down for a
//! while; keys OpenRouter rejects as invalid are deactivated.

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use rand::seq::IndexedRandom;
use sqlx::PgPool;
use uuid::Uuid;

pub struct KeyPool {
    db: PgPool,
    state: Mutex<PoolState>,
}

#[derive(Default)]
struct PoolState {
    in_flight: HashMap<Uuid, usize>,
    cooling_until: HashMap<Uuid, Instant>,
    last: Option<Uuid>,
}

/// A key checked out for one request; released when dropped.
pub struct KeyLease {
    pool: Arc<KeyPool>,
    pub id: Uuid,
    pub key: String,
}

impl Drop for KeyLease {
    fn drop(&mut self) {
        let mut state = self.pool.state.lock().unwrap();
        if let Some(count) = state.in_flight.get_mut(&self.id) {
            *count = count.saturating_sub(1);
            if *count == 0 {
                state.in_flight.remove(&self.id);
            }
        }
    }
}

impl KeyPool {
    pub fn new(db: PgPool) -> Arc<Self> {
        Arc::new(Self { db, state: Mutex::new(PoolState::default()) })
    }

    /// Adds keys to the pool, skipping ones already in it. Returns how many were new.
    pub async fn add_keys(db: &PgPool, keys: &[String]) -> anyhow::Result<u64> {
        let mut added = 0;
        for key in keys.iter().map(|k| k.trim()).filter(|k| !k.is_empty()) {
            added += sqlx::query("INSERT INTO api_keys (key) VALUES ($1) ON CONFLICT (key) DO NOTHING")
                .bind(key)
                .execute(db)
                .await?
                .rows_affected();
        }
        Ok(added)
    }

    pub async fn active_count(&self) -> anyhow::Result<i64> {
        Ok(sqlx::query_scalar("SELECT count(*) FROM api_keys WHERE is_active AND provider = 'openrouter'")
            .fetch_one(&self.db)
            .await?)
    }

    /// Leases a random usable key, skipping `exclude` (keys that already
    /// failed for this request). Returns `None` when no key is usable.
    pub async fn acquire(self: &Arc<Self>, exclude: &[Uuid]) -> anyhow::Result<Option<KeyLease>> {
        let rows: Vec<(Uuid, String)> =
            sqlx::query_as("SELECT id, key FROM api_keys WHERE is_active AND provider = 'openrouter'")
                .fetch_all(&self.db)
                .await?;

        let chosen = {
            let mut state = self.state.lock().unwrap();
            let now = Instant::now();
            state.cooling_until.retain(|_, until| *until > now);

            let usable: Vec<&(Uuid, String)> = rows
                .iter()
                .filter(|(id, _)| !exclude.contains(id) && !state.cooling_until.contains_key(id))
                .collect();
            let not_last: Vec<&(Uuid, String)> =
                usable.iter().copied().filter(|(id, _)| Some(*id) != state.last).collect();
            let candidates = if not_last.is_empty() { usable } else { not_last };

            // Prefer keys nobody is using right now; otherwise the least busy ones.
            let min_busy = candidates.iter().map(|(id, _)| state.in_flight.get(id).copied().unwrap_or(0)).min();
            let least_busy: Vec<&(Uuid, String)> = candidates
                .into_iter()
                .filter(|(id, _)| Some(state.in_flight.get(id).copied().unwrap_or(0)) == min_busy)
                .collect();

            let picked = least_busy.choose(&mut rand::rng()).map(|(id, key)| (*id, key.clone()));
            if let Some((id, _)) = &picked {
                *state.in_flight.entry(*id).or_default() += 1;
                state.last = Some(*id);
            }
            picked
        };

        let Some((id, key)) = chosen else { return Ok(None) };
        sqlx::query("UPDATE api_keys SET usage_count = usage_count + 1, last_used_at = now() WHERE id = $1")
            .bind(id)
            .execute(&self.db)
            .await?;
        Ok(Some(KeyLease { pool: Arc::clone(self), id, key }))
    }

    /// Records an OpenRouter error for a key: invalid keys are switched off,
    /// rate-limited or out-of-credit keys rest for a while.
    pub async fn report_failure(&self, id: Uuid, status: u16, detail: &str) -> anyhow::Result<()> {
        let rest = match status {
            401 => None,
            402 => Some(Duration::from_secs(60 * 60)),
            _ => Some(Duration::from_secs(60)),
        };
        match rest {
            Some(rest) => {
                self.state.lock().unwrap().cooling_until.insert(id, Instant::now() + rest);
                sqlx::query("UPDATE api_keys SET last_error = $2 WHERE id = $1")
                    .bind(id)
                    .bind(format!("{status}: {detail}"))
                    .execute(&self.db)
                    .await?;
            }
            None => {
                tracing::warn!(%id, "OpenRouter rejected key; deactivating it");
                sqlx::query("UPDATE api_keys SET is_active = false, last_error = $2 WHERE id = $1")
                    .bind(id)
                    .bind(format!("{status}: {detail}"))
                    .execute(&self.db)
                    .await?;
            }
        }
        Ok(())
    }
}

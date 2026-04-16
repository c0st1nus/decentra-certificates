use actix_web::{HttpResponse, get, http::StatusCode, web};
use sea_orm::DatabaseBackend;
use serde::Serialize;

use crate::{services::settings, state::AppState};

#[derive(Serialize)]
struct HealthResponse {
    service: String,
    issuance_enabled: bool,
    database_backend: String,
    workers: usize,
    storage_driver: String,
    uploads_dir: String,
    database_ready: bool,
    redis_ready: bool,
    storage_ready: bool,
    cluster_ready: bool,
}

#[get("/health")]
async fn health(state: web::Data<AppState>) -> HttpResponse {
    let response = build_health_response(state.get_ref()).await;
    HttpResponse::Ok().json(response)
}

#[get("/ready")]
async fn ready(state: web::Data<AppState>) -> HttpResponse {
    let response = build_health_response(state.get_ref()).await;
    if response.cluster_ready {
        HttpResponse::Ok().json(response)
    } else {
        HttpResponse::build(StatusCode::SERVICE_UNAVAILABLE).json(response)
    }
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(health).service(ready);
}

async fn build_health_response(state: &AppState) -> HealthResponse {
    let issuance =
        settings::get_issuance_setting(&state.db, state.settings.issuance_enabled_default)
            .await
            .ok()
            .unwrap_or(settings::IssuanceSetting { enabled: false });
    let database_ready = state.db.ping().await.is_ok();
    let redis_ready = state.redis.healthcheck().await.is_ok();
    let storage_health = state.storage.healthcheck().await.ok();
    let storage_ready = storage_health
        .as_ref()
        .map(|storage_health| storage_health.ready)
        .unwrap_or(false);
    let strategy = state.storage.strategy();
    let cluster_ready = database_ready && redis_ready && storage_ready;

    HealthResponse {
        service: state.settings.app_name.clone(),
        issuance_enabled: issuance.enabled,
        database_backend: match state.db.get_database_backend() {
            DatabaseBackend::Postgres => "postgres",
            DatabaseBackend::MySql => "mysql",
            DatabaseBackend::Sqlite => "sqlite",
            _ => "unknown",
        }
        .to_owned(),
        workers: state.settings.server.workers,
        storage_driver: strategy.driver.to_owned(),
        uploads_dir: strategy.uploads_dir,
        database_ready,
        redis_ready,
        storage_ready,
        cluster_ready,
    }
}

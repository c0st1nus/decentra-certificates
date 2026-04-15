use actix_web::{HttpResponse, get, web};
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
    storage_ready: bool,
}

#[get("/health")]
async fn health(state: web::Data<AppState>) -> HttpResponse {
    let issuance =
        settings::get_issuance_setting(&state.db, state.settings.issuance_enabled_default)
            .await
            .ok()
            .unwrap_or(settings::IssuanceSetting { enabled: false });
    let storage_health = state.storage.healthcheck().await.ok();
    let strategy = state.storage.strategy();

    HttpResponse::Ok().json(HealthResponse {
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
        storage_ready: storage_health.map(|health| health.ready).unwrap_or(false),
    })
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(health);
}

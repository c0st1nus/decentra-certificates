use actix_web::{HttpResponse, get, web};
use sea_orm::DatabaseBackend;
use serde::Serialize;

use crate::state::AppState;

#[derive(Serialize)]
struct HealthResponse {
    service: String,
    issuance_enabled: bool,
    database_backend: String,
    uploads_dir: String,
}

#[get("/health")]
async fn health(state: web::Data<AppState>) -> HttpResponse {
    HttpResponse::Ok().json(HealthResponse {
        service: state.settings.app_name.clone(),
        issuance_enabled: state.settings.issuance_enabled,
        database_backend: match state.db.get_database_backend() {
            DatabaseBackend::Postgres => "postgres",
            DatabaseBackend::MySql => "mysql",
            DatabaseBackend::Sqlite => "sqlite",
            _ => "unknown",
        }
        .to_owned(),
        uploads_dir: state.settings.storage.uploads_dir.display().to_string(),
    })
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(health);
}

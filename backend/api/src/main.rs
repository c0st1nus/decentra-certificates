use std::io;

use actix_web::{App, HttpServer, middleware::Logger, web};
use decentra_certificates_api::app::{build_app, build_cors};
use decentra_certificates_api::config::Settings;
use decentra_certificates_api::services::certificate_jobs;
use decentra_certificates_api::services::settings as settings_service;
use decentra_certificates_api::state::AppState;
use db_migration::Migrator;
use jsonwebtoken::crypto::rust_crypto::DEFAULT_PROVIDER as JWT_CRYPTO_PROVIDER;
use sea_orm::Database;
use sea_orm_migration::MigratorTraitSelf;
use tracing::info;
use tracing_subscriber::{EnvFilter, fmt};

#[actix_web::main]
async fn main() -> io::Result<()> {
    dotenvy::dotenv().ok();
    init_tracing();
    init_jwt_crypto();

    let settings = Settings::from_env().map_err(io::Error::other)?;
    settings
        .ensure_directories()
        .await
        .map_err(io::Error::other)?;

    let db = Database::connect(&settings.database_url)
        .await
        .map_err(io::Error::other)?;
    Migrator.up(&db, None).await.map_err(io::Error::other)?;
    settings_service::ensure_defaults(&db, settings.issuance_enabled_default)
        .await
        .map_err(io::Error::other)?;
    let state = AppState::try_new(settings.clone(), db)
        .await
        .map_err(io::Error::other)?;
    certificate_jobs::spawn_workers(state.clone());
    let warmup_state = state.clone();
    tokio::spawn(async move {
        if let Err(err) = certificate_jobs::enqueue_active_template_if_enabled(&warmup_state).await
        {
            tracing::error!(error = %err, "failed to enqueue active template jobs during startup warmup");
        }
    });

    let bind_address = settings.server.bind_address.clone();
    let workers = settings.server.workers;
    let stress_test_mode = settings.stress_test_mode;

    info!(%bind_address, workers, "starting decentra certificates backend");

    HttpServer::new(move || {
        App::new()
            .app_data(web::JsonConfig::default().limit(5 * 1024 * 1024))
            .wrap(Logger::default())
            .wrap(build_cors(&settings.cors_origins))
            .app_data(web::Data::new(state.clone()))
            .configure(|cfg| build_app(cfg, stress_test_mode))
    })
    .workers(workers)
    .bind(&bind_address)?
    .run()
    .await
}

fn init_tracing() {
    let filter =
        EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info,actix_web=info"));

    fmt().with_env_filter(filter).init();
}

fn init_jwt_crypto() {
    let _ = JWT_CRYPTO_PROVIDER.install_default();
}

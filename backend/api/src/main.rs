mod app;
mod config;
mod error;
mod middleware;
mod routes;
mod services;
mod state;

use std::io;

use actix_web::{App, HttpServer, middleware::Logger, web};
use app::{build_app, build_cors};
use config::Settings;
use sea_orm::Database;
use services::settings as settings_service;
use state::AppState;
use tracing::info;
use tracing_subscriber::{EnvFilter, fmt};

#[actix_web::main]
async fn main() -> io::Result<()> {
    dotenvy::dotenv().ok();
    init_tracing();

    let settings = Settings::from_env().map_err(io::Error::other)?;
    settings
        .ensure_directories()
        .await
        .map_err(io::Error::other)?;

    let db = Database::connect(&settings.database_url)
        .await
        .map_err(io::Error::other)?;
    settings_service::ensure_defaults(&db, settings.issuance_enabled_default)
        .await
        .map_err(io::Error::other)?;
    let state = AppState::new(settings.clone(), db);

    let bind_address = settings.server.bind_address.clone();
    let workers = settings.server.workers;

    info!(%bind_address, workers, "starting decentra certificates backend");

    HttpServer::new(move || {
        App::new()
            .wrap(Logger::default())
            .wrap(build_cors(&settings.cors_origins))
            .app_data(web::Data::new(state.clone()))
            .configure(build_app)
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

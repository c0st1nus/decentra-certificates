use sea_orm::DatabaseConnection;

use crate::config::Settings;

#[derive(Clone)]
pub struct AppState {
    pub settings: Settings,
    pub db: DatabaseConnection,
}

impl AppState {
    pub fn new(settings: Settings, db: DatabaseConnection) -> Self {
        Self { settings, db }
    }
}

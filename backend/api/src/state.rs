use sea_orm::DatabaseConnection;

use crate::config::Settings;
use crate::services::storage::StorageService;

#[derive(Clone)]
pub struct AppState {
    pub settings: Settings,
    pub db: DatabaseConnection,
    pub storage: StorageService,
}

impl AppState {
    pub fn new(settings: Settings, db: DatabaseConnection) -> Self {
        let storage = StorageService::new(settings.storage.clone());

        Self {
            settings,
            db,
            storage,
        }
    }
}

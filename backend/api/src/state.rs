use sea_orm::DatabaseConnection;

use crate::config::Settings;
use crate::services::redis::RedisService;
use crate::services::storage::StorageService;

#[derive(Clone)]
pub struct AppState {
    pub settings: Settings,
    pub db: DatabaseConnection,
    pub redis: RedisService,
    pub storage: StorageService,
}

impl AppState {
    pub async fn try_new(settings: Settings, db: DatabaseConnection) -> anyhow::Result<Self> {
        let redis = RedisService::new(settings.redis_url.clone())?;
        let storage = StorageService::new(settings.storage.clone()).await?;

        Ok(Self {
            settings,
            db,
            redis,
            storage,
        })
    }
}

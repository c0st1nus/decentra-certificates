use sea_orm::DatabaseConnection;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;

use crate::config::Settings;
use crate::services::redis::RedisService;
use crate::services::storage::StorageService;

pub type FontCache = Arc<RwLock<HashMap<String, Arc<Vec<u8>>>>>;

#[derive(Clone)]
pub struct AppState {
    pub settings: Settings,
    pub db: DatabaseConnection,
    pub redis: RedisService,
    pub storage: StorageService,
    pub font_cache: FontCache,
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
            font_cache: Arc::new(RwLock::new(HashMap::new())),
        })
    }
}

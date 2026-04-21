use sea_orm::DatabaseConnection;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{RwLock, Semaphore};

use crate::config::Settings;
use crate::services::font_loader::FontDatabase;
use crate::services::redis::RedisService;
use crate::services::storage::StorageService;

pub type TemplateBackgroundCache = Arc<RwLock<HashMap<uuid::Uuid, Option<Arc<String>>>>>;
pub type TemplateSvgCache = Arc<RwLock<HashMap<uuid::Uuid, Arc<String>>>>;

#[derive(Clone)]
pub struct AppState {
    pub settings: Settings,
    pub db: DatabaseConnection,
    pub redis: RedisService,
    pub storage: StorageService,
    pub font_db: Arc<FontDatabase>,
    pub template_background_cache: TemplateBackgroundCache,
    pub template_svg_cache: TemplateSvgCache,
    pub render_semaphore: Arc<Semaphore>,
}

impl AppState {
    pub async fn try_new(settings: Settings, db: DatabaseConnection) -> anyhow::Result<Self> {
        let redis = RedisService::new(settings.redis_url.clone())?;
        let storage = StorageService::new(settings.storage.clone()).await?;
        let fonts_dir = settings.storage.uploads_dir.join("fonts");
        let font_db = if fonts_dir.exists() {
            Arc::new(FontDatabase::with_custom_fonts(&fonts_dir).await?)
        } else {
            Arc::new(FontDatabase::new())
        };

        Ok(Self {
            settings,
            db,
            redis,
            storage,
            font_db,
            template_background_cache: Arc::new(RwLock::new(HashMap::new())),
            template_svg_cache: Arc::new(RwLock::new(HashMap::new())),
            render_semaphore: Arc::new(Semaphore::new(num_cpus::get().max(1))),
        })
    }

    pub async fn invalidate_template_background(&self, template_id: uuid::Uuid) {
        let mut background_cache = self.template_background_cache.write().await;
        background_cache.remove(&template_id);
        drop(background_cache);

        let mut svg_cache = self.template_svg_cache.write().await;
        svg_cache.remove(&template_id);
    }
}

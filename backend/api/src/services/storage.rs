use anyhow::{Context, Result};
use serde::Serialize;

use crate::config::StorageSettings;

#[derive(Clone)]
pub struct StorageService {
    settings: StorageSettings,
}

#[derive(Clone, Debug, Serialize)]
pub struct StorageStrategy {
    pub driver: &'static str,
    pub uploads_dir: String,
    pub templates_dir: String,
    pub generated_dir: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct StorageHealth {
    pub ready: bool,
    pub strategy: StorageStrategy,
}

impl StorageService {
    pub fn new(settings: StorageSettings) -> Self {
        Self { settings }
    }

    pub fn strategy(&self) -> StorageStrategy {
        StorageStrategy {
            driver: "local_fs",
            uploads_dir: self.settings.uploads_dir.display().to_string(),
            templates_dir: self.settings.templates_dir.display().to_string(),
            generated_dir: self.settings.generated_dir.display().to_string(),
        }
    }

    pub async fn healthcheck(&self) -> Result<StorageHealth> {
        tokio::fs::metadata(&self.settings.templates_dir)
            .await
            .with_context(|| {
                format!(
                    "templates storage directory is not accessible: {}",
                    self.settings.templates_dir.display()
                )
            })?;
        tokio::fs::metadata(&self.settings.generated_dir)
            .await
            .with_context(|| {
                format!(
                    "generated certificates directory is not accessible: {}",
                    self.settings.generated_dir.display()
                )
            })?;

        Ok(StorageHealth {
            ready: true,
            strategy: self.strategy(),
        })
    }
}

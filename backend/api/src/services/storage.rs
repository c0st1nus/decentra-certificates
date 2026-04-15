use std::path::PathBuf;

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

    pub fn generated_file_path(&self, certificate_id: &str) -> PathBuf {
        self.settings
            .generated_dir
            .join(format!("{certificate_id}.pdf"))
    }

    pub fn template_file_path(&self, template_id: &str, file_name: &str) -> PathBuf {
        let extension = PathBuf::from(file_name)
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("bin")
            .to_lowercase();

        self.settings
            .templates_dir
            .join(format!("{template_id}.{extension}"))
    }

    pub fn template_preview_path(&self, template_id: &str) -> PathBuf {
        self.settings
            .templates_dir
            .join(format!("{template_id}-preview.pdf"))
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

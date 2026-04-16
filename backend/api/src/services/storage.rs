use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use aws_config::{BehaviorVersion, Region};
use aws_sdk_s3::{Client, primitives::ByteStream};
use serde::Serialize;

use crate::config::{S3StorageSettings, StorageDriver, StorageSettings};

const TEMPLATE_PREFIX: &str = "templates";
const GENERATED_PREFIX: &str = "generated";

#[derive(Clone)]
pub struct StorageService {
    backend: StorageBackend,
}

#[derive(Clone)]
enum StorageBackend {
    Local(LocalStorageBackend),
    S3(S3StorageBackend),
}

#[derive(Clone)]
struct LocalStorageBackend {
    settings: StorageSettings,
}

#[derive(Clone)]
struct S3StorageBackend {
    client: Client,
    settings: S3StorageSettings,
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
    pub async fn new(settings: StorageSettings) -> Result<Self> {
        let backend = match settings.driver {
            StorageDriver::LocalFs => StorageBackend::Local(LocalStorageBackend { settings }),
            StorageDriver::S3 => {
                let s3_settings = settings
                    .s3
                    .clone()
                    .context("s3 storage settings are required when STORAGE_DRIVER=s3")?;
                StorageBackend::S3(S3StorageBackend::new(s3_settings).await?)
            }
        };

        Ok(Self { backend })
    }

    pub fn generated_file_key(&self, certificate_id: &str) -> String {
        format!("{GENERATED_PREFIX}/{certificate_id}.pdf")
    }

    pub fn template_file_key(&self, template_id: &str, file_name: &str) -> String {
        let extension = PathBuf::from(file_name)
            .extension()
            .and_then(|value| value.to_str())
            .unwrap_or("bin")
            .to_lowercase();

        format!("{TEMPLATE_PREFIX}/{template_id}.{extension}")
    }

    pub fn template_preview_key(&self, template_id: &str) -> String {
        format!("{TEMPLATE_PREFIX}/{template_id}-preview.pdf")
    }

    pub async fn put_object(
        &self,
        key: &str,
        bytes: Vec<u8>,
        content_type: Option<&str>,
    ) -> Result<()> {
        match &self.backend {
            StorageBackend::Local(backend) => backend.put_object(key, bytes).await,
            StorageBackend::S3(backend) => backend.put_object(key, bytes, content_type).await,
        }
    }

    pub async fn get_object(&self, key: &str) -> Result<Vec<u8>> {
        match &self.backend {
            StorageBackend::Local(backend) => backend.get_object(key).await,
            StorageBackend::S3(backend) => backend.get_object(key).await,
        }
    }

    pub async fn delete_object(&self, key: &str) -> Result<()> {
        match &self.backend {
            StorageBackend::Local(backend) => backend.delete_object(key).await,
            StorageBackend::S3(backend) => backend.delete_object(key).await,
        }
    }

    pub async fn object_exists(&self, key: &str) -> Result<bool> {
        match &self.backend {
            StorageBackend::Local(backend) => backend.object_exists(key).await,
            StorageBackend::S3(backend) => backend.object_exists(key).await,
        }
    }

    pub fn strategy(&self) -> StorageStrategy {
        match &self.backend {
            StorageBackend::Local(backend) => backend.strategy(),
            StorageBackend::S3(backend) => backend.strategy(),
        }
    }

    pub async fn healthcheck(&self) -> Result<StorageHealth> {
        let strategy = self.strategy();

        match &self.backend {
            StorageBackend::Local(backend) => backend.healthcheck(strategy).await,
            StorageBackend::S3(backend) => backend.healthcheck(strategy).await,
        }
    }
}

impl LocalStorageBackend {
    async fn put_object(&self, key: &str, bytes: Vec<u8>) -> Result<()> {
        let path = self.resolve_path(key);
        if let Some(parent) = path.parent() {
            tokio::fs::create_dir_all(parent).await.with_context(|| {
                format!("failed to create storage directory: {}", parent.display())
            })?;
        }

        tokio::fs::write(&path, bytes)
            .await
            .with_context(|| format!("failed to write storage object: {}", path.display()))?;

        Ok(())
    }

    async fn get_object(&self, key: &str) -> Result<Vec<u8>> {
        let path = self.resolve_path(key);
        tokio::fs::read(&path)
            .await
            .with_context(|| format!("failed to read storage object: {}", path.display()))
    }

    async fn delete_object(&self, key: &str) -> Result<()> {
        let path = self.resolve_path(key);
        match tokio::fs::remove_file(&path).await {
            Ok(()) => Ok(()),
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(err) => Err(anyhow::anyhow!(
                "failed to remove storage object {}: {err}",
                path.display()
            )),
        }
    }

    async fn object_exists(&self, key: &str) -> Result<bool> {
        let path = self.resolve_path(key);
        match tokio::fs::metadata(&path).await {
            Ok(_) => Ok(true),
            Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(false),
            Err(err) => Err(anyhow::anyhow!(
                "failed to check storage object {}: {err}",
                path.display()
            )),
        }
    }

    fn strategy(&self) -> StorageStrategy {
        StorageStrategy {
            driver: "local_fs",
            uploads_dir: self.settings.uploads_dir.display().to_string(),
            templates_dir: self.settings.templates_dir.display().to_string(),
            generated_dir: self.settings.generated_dir.display().to_string(),
        }
    }

    async fn healthcheck(&self, strategy: StorageStrategy) -> Result<StorageHealth> {
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
            strategy,
        })
    }

    fn resolve_path(&self, key: &str) -> PathBuf {
        if is_legacy_local_path(key) {
            PathBuf::from(key)
        } else {
            self.settings.uploads_dir.join(key)
        }
    }
}

impl S3StorageBackend {
    async fn new(settings: S3StorageSettings) -> Result<Self> {
        let mut shared_config = aws_config::defaults(BehaviorVersion::latest())
            .region(Region::new(settings.region.clone()));

        if let Some(endpoint_url) = settings.endpoint_url.as_deref() {
            shared_config = shared_config.endpoint_url(endpoint_url);
        }

        let shared_config = shared_config.load().await;
        let mut config_builder = aws_sdk_s3::config::Builder::from(&shared_config);
        if settings.force_path_style {
            config_builder = config_builder.force_path_style(true);
        }

        Ok(Self {
            client: Client::from_conf(config_builder.build()),
            settings,
        })
    }

    async fn put_object(
        &self,
        key: &str,
        bytes: Vec<u8>,
        content_type: Option<&str>,
    ) -> Result<()> {
        let mut request = self
            .client
            .put_object()
            .bucket(&self.settings.bucket)
            .key(self.full_key(key))
            .body(ByteStream::from(bytes));

        if let Some(content_type) = content_type {
            request = request.content_type(content_type);
        }

        request.send().await.with_context(|| {
            format!(
                "failed to upload object to s3 bucket {}",
                self.settings.bucket
            )
        })?;

        Ok(())
    }

    async fn get_object(&self, key: &str) -> Result<Vec<u8>> {
        let response = self
            .client
            .get_object()
            .bucket(&self.settings.bucket)
            .key(self.full_key(key))
            .send()
            .await
            .with_context(|| {
                format!(
                    "failed to download object from s3 bucket {}",
                    self.settings.bucket
                )
            })?;

        let bytes = response.body.collect().await.with_context(|| {
            format!(
                "failed to collect object body from s3 bucket {}",
                self.settings.bucket
            )
        })?;

        Ok(bytes.into_bytes().to_vec())
    }

    async fn delete_object(&self, key: &str) -> Result<()> {
        self.client
            .delete_object()
            .bucket(&self.settings.bucket)
            .key(self.full_key(key))
            .send()
            .await
            .with_context(|| {
                format!(
                    "failed to delete object from s3 bucket {}",
                    self.settings.bucket
                )
            })?;

        Ok(())
    }

    async fn object_exists(&self, key: &str) -> Result<bool> {
        let result = self
            .client
            .head_object()
            .bucket(&self.settings.bucket)
            .key(self.full_key(key))
            .send()
            .await;

        match result {
            Ok(_) => Ok(true),
            Err(err) => {
                let message = err.to_string().to_ascii_lowercase();
                if message.contains("not found")
                    || message.contains("status code: 404")
                    || message.contains("no such key")
                {
                    Ok(false)
                } else {
                    Err(anyhow::anyhow!(
                        "failed to check object in s3 bucket {}: {err}",
                        self.settings.bucket
                    ))
                }
            }
        }
    }

    fn strategy(&self) -> StorageStrategy {
        let base = self.base_uri();

        StorageStrategy {
            driver: "s3",
            uploads_dir: base.clone(),
            templates_dir: format!("{base}/{TEMPLATE_PREFIX}"),
            generated_dir: format!("{base}/{GENERATED_PREFIX}"),
        }
    }

    async fn healthcheck(&self, strategy: StorageStrategy) -> Result<StorageHealth> {
        self.client
            .head_bucket()
            .bucket(&self.settings.bucket)
            .send()
            .await
            .with_context(|| format!("s3 bucket is not accessible: {}", self.settings.bucket))?;

        Ok(StorageHealth {
            ready: true,
            strategy,
        })
    }

    fn full_key(&self, key: &str) -> String {
        if self.settings.prefix.is_empty() {
            key.to_owned()
        } else {
            format!("{}/{}", self.settings.prefix, key.trim_start_matches('/'))
        }
    }

    fn base_uri(&self) -> String {
        if self.settings.prefix.is_empty() {
            format!("s3://{}", self.settings.bucket)
        } else {
            format!("s3://{}/{}", self.settings.bucket, self.settings.prefix)
        }
    }
}

fn is_legacy_local_path(key: &str) -> bool {
    let path = Path::new(key);
    path.is_absolute() || key.starts_with("./") || key.starts_with("../")
}

#[cfg(test)]
mod tests {
    use super::is_legacy_local_path;

    #[test]
    fn detects_legacy_local_paths() {
        assert!(is_legacy_local_path("./uploads/templates/test.png"));
        assert!(is_legacy_local_path("/var/data/generated/test.pdf"));
        assert!(is_legacy_local_path("../uploads/generated/test.pdf"));
        assert!(!is_legacy_local_path("templates/test.png"));
        assert!(!is_legacy_local_path("generated/test.pdf"));
    }
}

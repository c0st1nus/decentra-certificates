use std::{env, path::PathBuf};

use anyhow::{Context, Result};
use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
pub struct Settings {
    pub app_name: String,
    pub database_url: String,
    pub redis_url: String,
    pub jwt: JwtSettings,
    pub server: ServerSettings,
    pub storage: StorageSettings,
    pub cors_origins: Vec<String>,
    pub issuance_enabled_default: bool,
    pub certificate_workers: usize,
    pub render_parallelism: usize,
    pub certificate_render_scale: f32,
    pub preview_render_scale: f32,
    pub stress_test_mode: bool,
    pub telegram: TelegramSettings,
}

#[derive(Clone, Debug, Serialize)]
pub struct TelegramSettings {
    pub bot_token: Option<String>,
    pub channel_id: Option<String>,
    pub client_id: Option<String>,
    pub client_secret: Option<String>,
    pub subscription_required: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct JwtSettings {
    pub access_secret: String,
    pub refresh_secret: String,
    pub access_ttl_minutes: i64,
    pub refresh_ttl_days: i64,
}

#[derive(Clone, Debug, Serialize)]
pub struct ServerSettings {
    pub bind_address: String,
    pub workers: usize,
}

#[derive(Clone, Debug, Serialize)]
pub struct StorageSettings {
    pub driver: StorageDriver,
    pub uploads_dir: PathBuf,
    pub templates_dir: PathBuf,
    pub generated_dir: PathBuf,
    pub s3: Option<S3StorageSettings>,
}

#[derive(Clone, Debug, Serialize)]
pub enum StorageDriver {
    LocalFs,
    S3,
}

#[derive(Clone, Debug, Serialize)]
pub struct S3StorageSettings {
    pub bucket: String,
    pub region: String,
    pub prefix: String,
    pub endpoint_url: Option<String>,
    pub force_path_style: bool,
}

impl Settings {
    pub fn from_env() -> Result<Self> {
        let storage_driver = env_storage_driver("STORAGE_DRIVER", StorageDriver::LocalFs)?;
        let uploads_dir = env_path("UPLOADS_DIR", "./uploads");
        let templates_dir = uploads_dir.join("templates");
        let generated_dir = uploads_dir.join("generated");
        let certificate_workers = env_parse("CERTIFICATE_WORKERS", num_cpus::get().max(1))?;
        let render_parallelism = env_parse(
            "RENDER_PARALLELISM",
            certificate_workers.min(num_cpus::get_physical().max(1)),
        )?;
        let s3 = match storage_driver {
            StorageDriver::LocalFs => None,
            StorageDriver::S3 => Some(S3StorageSettings {
                bucket: env_required("STORAGE_S3_BUCKET")?,
                region: env_required("STORAGE_S3_REGION")?,
                prefix: normalize_s3_prefix(&env_string(
                    "STORAGE_S3_PREFIX",
                    "decentra-certificates",
                )),
                endpoint_url: env_optional("STORAGE_S3_ENDPOINT_URL"),
                force_path_style: env_parse("STORAGE_S3_FORCE_PATH_STYLE", false)?,
            }),
        };

        Ok(Self {
            app_name: env_string("APP_NAME", "decentra-certificates"),
            database_url: env_required("DATABASE_URL")?,
            redis_url: env_string("REDIS_URL", "redis://127.0.0.1:6379/0"),
            jwt: JwtSettings {
                access_secret: env_required("JWT_ACCESS_SECRET")?,
                refresh_secret: env_required("JWT_REFRESH_SECRET")?,
                access_ttl_minutes: env_parse("JWT_ACCESS_TTL_MINUTES", 60)?,
                refresh_ttl_days: env_parse("JWT_REFRESH_TTL_DAYS", 30)?,
            },
            server: ServerSettings {
                bind_address: env_string("BIND_ADDRESS", "127.0.0.1:8080"),
                workers: env_parse("HTTP_WORKERS", num_cpus::get_physical().max(2))?,
            },
            storage: StorageSettings {
                driver: storage_driver,
                uploads_dir,
                templates_dir,
                generated_dir,
                s3,
            },
            cors_origins: env_list(
                "CORS_ORIGINS",
                &["http://localhost:3000", "http://127.0.0.1:3000"],
            ),
            issuance_enabled_default: env_parse("ISSUANCE_ENABLED", false)?,
            certificate_workers,
            render_parallelism,
            certificate_render_scale: env_parse("CERTIFICATE_RENDER_SCALE", 1.5_f32)?,
            preview_render_scale: env_parse("PREVIEW_RENDER_SCALE", 1.25_f32)?,
            stress_test_mode: env_parse("STRESS_TEST_MODE", false)?,
            telegram: TelegramSettings {
                bot_token: env_optional("TELEGRAM_BOT_TOKEN"),
                channel_id: env_optional("TELEGRAM_CHANNEL_ID"),
                client_id: env_optional("TELEGRAM_CLIENT_ID"),
                client_secret: env_optional("TELEGRAM_CLIENT_SECRET"),
                subscription_required: env_parse("TELEGRAM_SUBSCRIPTION_REQUIRED", false)?,
            },
        })
    }

    pub async fn ensure_directories(&self) -> Result<()> {
        if matches!(self.storage.driver, StorageDriver::LocalFs) {
            tokio::fs::create_dir_all(&self.storage.templates_dir)
                .await
                .context("failed to create templates directory")?;
            tokio::fs::create_dir_all(&self.storage.generated_dir)
                .await
                .context("failed to create generated certificates directory")?;
        }

        Ok(())
    }
}

fn env_required(key: &str) -> Result<String> {
    env::var(key).with_context(|| format!("missing required environment variable `{key}`"))
}

fn env_string(key: &str, default: &str) -> String {
    env::var(key).unwrap_or_else(|_| default.to_owned())
}

fn env_optional(key: &str) -> Option<String> {
    env::var(key)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
}

fn env_path(key: &str, default: &str) -> PathBuf {
    env::var(key)
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(default))
}

fn env_list(key: &str, default: &[&str]) -> Vec<String> {
    env::var(key)
        .ok()
        .map(|value| {
            value
                .split(',')
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToOwned::to_owned)
                .collect()
        })
        .filter(|values: &Vec<String>| !values.is_empty())
        .unwrap_or_else(|| default.iter().map(|value| (*value).to_owned()).collect())
}

fn env_parse<T>(key: &str, default: T) -> Result<T>
where
    T: std::str::FromStr,
    <T as std::str::FromStr>::Err: std::fmt::Display,
{
    match env::var(key) {
        Ok(value) => value
            .parse::<T>()
            .map_err(|err| anyhow::anyhow!("invalid value for `{key}`: {err}")),
        Err(_) => Ok(default),
    }
}

fn env_storage_driver(key: &str, default: StorageDriver) -> Result<StorageDriver> {
    match env::var(key) {
        Ok(value) => StorageDriver::from_env_value(&value),
        Err(_) => Ok(default),
    }
}

fn normalize_s3_prefix(value: &str) -> String {
    value.trim_matches('/').to_owned()
}

impl StorageDriver {
    fn from_env_value(value: &str) -> Result<Self> {
        match value.trim().to_ascii_lowercase().as_str() {
            "local" | "local_fs" | "localfs" => Ok(Self::LocalFs),
            "s3" => Ok(Self::S3),
            other => Err(anyhow::anyhow!(
                "invalid value for `STORAGE_DRIVER`: expected `local_fs` or `s3`, got `{other}`"
            )),
        }
    }
}

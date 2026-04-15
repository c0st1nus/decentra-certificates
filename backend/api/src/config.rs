use std::{env, path::PathBuf};

use anyhow::{Context, Result};
use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
pub struct Settings {
    pub app_name: String,
    pub database_url: String,
    pub jwt: JwtSettings,
    pub server: ServerSettings,
    pub storage: StorageSettings,
    pub issuance_enabled_default: bool,
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
    pub uploads_dir: PathBuf,
    pub templates_dir: PathBuf,
    pub generated_dir: PathBuf,
}

impl Settings {
    pub fn from_env() -> Result<Self> {
        let uploads_dir = env_path("UPLOADS_DIR", "./uploads");
        let templates_dir = uploads_dir.join("templates");
        let generated_dir = uploads_dir.join("generated");

        Ok(Self {
            app_name: env_string("APP_NAME", "decentra-certificates"),
            database_url: env_required("DATABASE_URL")?,
            jwt: JwtSettings {
                access_secret: env_required("JWT_ACCESS_SECRET")?,
                refresh_secret: env_required("JWT_REFRESH_SECRET")?,
                access_ttl_minutes: env_parse("JWT_ACCESS_TTL_MINUTES", 15)?,
                refresh_ttl_days: env_parse("JWT_REFRESH_TTL_DAYS", 30)?,
            },
            server: ServerSettings {
                bind_address: env_string("BIND_ADDRESS", "127.0.0.1:8080"),
                workers: env_parse("HTTP_WORKERS", num_cpus::get_physical().max(2))?,
            },
            storage: StorageSettings {
                uploads_dir,
                templates_dir,
                generated_dir,
            },
            issuance_enabled_default: env_parse("ISSUANCE_ENABLED", false)?,
        })
    }

    pub async fn ensure_directories(&self) -> Result<()> {
        tokio::fs::create_dir_all(&self.storage.templates_dir)
            .await
            .context("failed to create templates directory")?;
        tokio::fs::create_dir_all(&self.storage.generated_dir)
            .await
            .context("failed to create generated certificates directory")?;
        Ok(())
    }
}

fn env_required(key: &str) -> Result<String> {
    env::var(key).with_context(|| format!("missing required environment variable `{key}`"))
}

fn env_string(key: &str, default: &str) -> String {
    env::var(key).unwrap_or_else(|_| default.to_owned())
}

fn env_path(key: &str, default: &str) -> PathBuf {
    env::var(key)
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(default))
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

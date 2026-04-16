use anyhow::{Context, Result};
use serde::Serialize;

#[derive(Clone)]
pub struct RedisService {
    client: redis::Client,
}

#[derive(Clone, Debug, Serialize)]
pub struct RedisHealth {
    pub ready: bool,
    pub driver: &'static str,
}

impl RedisService {
    pub fn new(url: String) -> Result<Self> {
        let client = redis::Client::open(url).context("failed to initialize redis client")?;

        Ok(Self { client })
    }

    async fn connection(&self) -> Result<redis::aio::MultiplexedConnection> {
        self.client
            .get_multiplexed_async_connection()
            .await
            .context("failed to establish redis connection")
    }

    pub async fn healthcheck(&self) -> Result<RedisHealth> {
        let mut connection = self.connection().await?;
        let pong: String = redis::cmd("PING")
            .query_async(&mut connection)
            .await
            .context("redis ping failed")?;

        Ok(RedisHealth {
            ready: pong.eq_ignore_ascii_case("PONG"),
            driver: "redis",
        })
    }

    pub async fn acquire_lock(&self, key: &str, ttl_seconds: usize) -> Result<bool> {
        let mut connection = self.connection().await?;
        let result: Option<String> = redis::cmd("SET")
            .arg(key)
            .arg("locked")
            .arg("NX")
            .arg("EX")
            .arg(ttl_seconds)
            .query_async(&mut connection)
            .await
            .with_context(|| format!("failed to set redis lock `{key}`"))?;

        Ok(result.is_some())
    }

    pub async fn remove_key(&self, key: &str) -> Result<()> {
        let mut connection = self.connection().await?;
        let _: i64 = redis::cmd("DEL")
            .arg(key)
            .query_async(&mut connection)
            .await
            .with_context(|| format!("failed to delete redis key `{key}`"))?;
        Ok(())
    }

    pub async fn increment_counter(&self, key: &str, ttl_seconds: usize) -> Result<u64> {
        let mut connection = self.connection().await?;
        let count: i64 = redis::cmd("INCR")
            .arg(key)
            .query_async(&mut connection)
            .await
            .with_context(|| format!("failed to increment redis key `{key}`"))?;

        if count == 1 {
            let _: i64 = redis::cmd("EXPIRE")
                .arg(key)
                .arg(ttl_seconds)
                .query_async(&mut connection)
                .await
                .with_context(|| format!("failed to set ttl for redis key `{key}`"))?;
        }

        Ok(count.max(0) as u64)
    }

    pub async fn get_string(&self, key: &str) -> Result<Option<String>> {
        let mut connection = self.connection().await?;
        redis::cmd("GET")
            .arg(key)
            .query_async(&mut connection)
            .await
            .with_context(|| format!("failed to read redis key `{key}`"))
    }
}

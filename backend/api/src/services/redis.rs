use anyhow::{Context, Result};
use serde::{Serialize, de::DeserializeOwned};

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

    pub async fn get_json<T>(&self, key: &str) -> Result<Option<T>>
    where
        T: DeserializeOwned,
    {
        let Some(value) = self.get_string(key).await? else {
            return Ok(None);
        };

        serde_json::from_str(&value)
            .with_context(|| format!("failed to deserialize redis json key `{key}`"))
            .map(Some)
    }

    pub async fn set_json<T>(&self, key: &str, value: &T, ttl_seconds: usize) -> Result<()>
    where
        T: Serialize,
    {
        let mut connection = self.connection().await?;
        let payload = serde_json::to_string(value)
            .with_context(|| format!("failed to serialize redis json key `{key}`"))?;
        let _: String = redis::cmd("SET")
            .arg(key)
            .arg(payload)
            .arg("EX")
            .arg(ttl_seconds)
            .query_async(&mut connection)
            .await
            .with_context(|| format!("failed to write redis json key `{key}`"))?;
        Ok(())
    }

    pub async fn enqueue_scored(&self, key: &str, member: &str, score: f64) -> Result<()> {
        let mut connection = self.connection().await?;
        let _: i64 = redis::cmd("ZADD")
            .arg(key)
            .arg(score)
            .arg(member)
            .query_async(&mut connection)
            .await
            .with_context(|| format!("failed to zadd member `{member}` to redis key `{key}`"))?;
        Ok(())
    }

    pub async fn dequeue_scored(&self, key: &str) -> Result<Option<String>> {
        let mut connection = self.connection().await?;
        let response: redis::Value = redis::cmd("ZPOPMIN")
            .arg(key)
            .arg(1)
            .query_async(&mut connection)
            .await
            .with_context(|| format!("failed to zpopmin redis key `{key}`"))?;

        match response {
            redis::Value::Nil => Ok(None),
            redis::Value::Array(values) if values.is_empty() => Ok(None),
            redis::Value::Array(values) => {
                let Some(member) = values.first() else {
                    return Err(anyhow::anyhow!(
                        "unexpected zpopmin response length for redis key `{key}`"
                    ));
                };

                let member = match member {
                    redis::Value::BulkString(bytes) => String::from_utf8(bytes.clone())
                        .context("zpopmin returned a non-utf8 member")?,
                    redis::Value::SimpleString(value) => value.clone(),
                    other => {
                        return Err(anyhow::anyhow!(
                            "unexpected zpopmin member type for redis key `{key}`: {other:?}"
                        ));
                    }
                };

                Ok(Some(member))
            }
            other => Err(anyhow::anyhow!(
                "unexpected zpopmin response for redis key `{key}`: {other:?}"
            )),
        }
    }
}

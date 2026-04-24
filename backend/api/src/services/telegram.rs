use anyhow::{Context, Result};
use hmac::{Hmac, Mac};
use serde::Deserialize;
use sha2::Sha256;
use std::collections::HashMap;

pub const TELEGRAM_OAUTH_JWKS_URL: &str = "https://oauth.telegram.org/.well-known/jwks.json";
pub const TELEGRAM_BOT_API_BASE: &str = "https://api.telegram.org/bot";

#[derive(Clone, Debug)]
pub struct TelegramUser {
    pub id: i64,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub username: Option<String>,
}

#[derive(Debug, Deserialize)]
struct BotApiResponse {
    ok: bool,
    result: Option<serde_json::Value>,
    description: Option<String>,
}

pub fn validate_init_data(init_data: &str, bot_token: &str) -> Result<TelegramUser> {
    let mut pairs = HashMap::new();
    for pair in init_data.split('&') {
        if let Some((key, value)) = pair.split_once('=') {
            pairs.insert(key.to_owned(), urlencoding::decode(value)?.into_owned());
        }
    }

    let hash = pairs
        .remove("hash")
        .ok_or_else(|| anyhow::anyhow!("missing hash in initData"))?;

    let mut keys: Vec<&str> = pairs.keys().map(String::as_str).collect();
    keys.sort_unstable();

    let data_check_string = keys
        .into_iter()
        .map(|key| format!("{}={}", key, pairs.get(key).unwrap()))
        .collect::<Vec<_>>()
        .join("\n");

    let mut mac = Hmac::<Sha256>::new_from_slice(b"WebAppData")
        .map_err(|_| anyhow::anyhow!("failed to create hmac key"))?;
    mac.update(bot_token.as_bytes());
    let secret_key = mac.finalize().into_bytes();

    let mut mac =
        Hmac::<Sha256>::new_from_slice(&secret_key).map_err(|_| anyhow::anyhow!("hmac error"))?;
    mac.update(data_check_string.as_bytes());
    let calculated_hash = hex::encode(mac.finalize().into_bytes());

    if !constant_time_eq::constant_time_eq(calculated_hash.as_bytes(), hash.as_bytes()) {
        return Err(anyhow::anyhow!("initData hash mismatch"));
    }

    let user_json = pairs
        .get("user")
        .ok_or_else(|| anyhow::anyhow!("missing user in initData"))?;
    let user: serde_json::Value = serde_json::from_str(user_json)?;

    let id = user["id"]
        .as_i64()
        .ok_or_else(|| anyhow::anyhow!("missing user id in initData"))?;

    Ok(TelegramUser {
        id,
        first_name: user["first_name"].as_str().map(ToOwned::to_owned),
        last_name: user["last_name"].as_str().map(ToOwned::to_owned),
        username: user["username"].as_str().map(ToOwned::to_owned),
    })
}

pub async fn validate_id_token(id_token: &str, client_id: &str) -> Result<TelegramUser> {
    let jwks = fetch_telegram_jwks().await?;

    let header = jsonwebtoken::decode_header(id_token)
        .map_err(|err| anyhow::anyhow!("invalid id_token header: {err}"))?;

    let kid = header
        .kid
        .ok_or_else(|| anyhow::anyhow!("missing kid in id_token header"))?;

    let jwk = jwks
        .iter()
        .find(|key| key.common.key_id.as_deref() == Some(&kid))
        .ok_or_else(|| anyhow::anyhow!("no matching JWK found for kid {kid}"))?;

    let decoding_key = jsonwebtoken::DecodingKey::from_jwk(jwk)
        .map_err(|err| anyhow::anyhow!("invalid JWK: {err}"))?;

    let mut validation = jsonwebtoken::Validation::new(header.alg);
    validation.set_issuer(&["https://oauth.telegram.org"]);
    validation.set_audience(&[client_id]);

    let token_data =
        jsonwebtoken::decode::<TelegramIdTokenClaims>(id_token, &decoding_key, &validation)
            .map_err(|err| anyhow::anyhow!("id_token validation failed: {err}"))?;

    let claims = token_data.claims;

    Ok(TelegramUser {
        id: claims.id,
        first_name: claims.name,
        last_name: None,
        username: claims.preferred_username,
    })
}

pub async fn check_channel_subscription(
    user_id: i64,
    channel_id: &str,
    bot_token: &str,
) -> Result<bool> {
    let url = format!(
        "{TELEGRAM_BOT_API_BASE}{bot_token}/getChatMember?chat_id={channel_id}&user_id={user_id}"
    );

    let response = reqwest::get(&url)
        .await
        .with_context(|| "failed to call Telegram Bot API")?;

    let body: BotApiResponse = response
        .json()
        .await
        .with_context(|| "failed to parse Telegram Bot API response")?;

    if !body.ok {
        let desc = body.description.unwrap_or_default();
        return Err(anyhow::anyhow!("Telegram API error: {desc}"));
    }

    let result = body
        .result
        .ok_or_else(|| anyhow::anyhow!("empty result from Telegram API"))?;

    let status = result["status"].as_str().unwrap_or("unknown");

    Ok(matches!(status, "member" | "administrator" | "creator"))
}

async fn fetch_telegram_jwks() -> Result<Vec<jsonwebtoken::jwk::Jwk>> {
    let response = reqwest::get(TELEGRAM_OAUTH_JWKS_URL)
        .await
        .with_context(|| "failed to fetch Telegram JWKS")?;

    let jwks: serde_json::Value = response
        .json()
        .await
        .with_context(|| "failed to parse Telegram JWKS")?;

    let keys = jwks["keys"]
        .as_array()
        .ok_or_else(|| anyhow::anyhow!("missing keys in JWKS"))?;

    let mut result = Vec::with_capacity(keys.len());
    for key in keys {
        let jwk: jsonwebtoken::jwk::Jwk = serde_json::from_value(key.clone())?;
        result.push(jwk);
    }

    Ok(result)
}

#[derive(Debug, Deserialize)]
struct TelegramIdTokenClaims {
    #[serde(rename = "iss")]
    _iss: String,
    #[serde(rename = "aud")]
    _aud: String,
    #[serde(rename = "sub")]
    _sub: String,
    #[serde(rename = "iat")]
    _iat: i64,
    #[serde(rename = "exp")]
    _exp: i64,
    id: i64,
    name: Option<String>,
    preferred_username: Option<String>,
    #[serde(rename = "phone_number")]
    _phone_number: Option<String>,
}

// minimal constant-time comparison to avoid timing attacks
mod constant_time_eq {
    pub fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
        if a.len() != b.len() {
            return false;
        }
        let mut result = 0u8;
        for (x, y) in a.iter().zip(b.iter()) {
            result |= x ^ y;
        }
        result == 0
    }
}

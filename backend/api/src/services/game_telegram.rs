use serde::Deserialize;

use crate::{
    config::Settings,
    error::AppError,
    services::telegram::{self, TelegramUser},
};

#[derive(Debug, Deserialize, Clone)]
pub struct TelegramAuthPayload {
    pub auth_type: String,
    pub value: String,
}

pub async fn resolve_telegram_user(
    settings: &Settings,
    auth: &TelegramAuthPayload,
) -> Result<TelegramUser, AppError> {
    let bot_token = settings.telegram.bot_token.as_deref().ok_or_else(|| {
        AppError::Internal(anyhow::anyhow!("TELEGRAM_BOT_TOKEN not configured"))
    })?;

    match auth.auth_type.as_str() {
        "init_data" => telegram::validate_init_data(&auth.value, bot_token)
            .map_err(|err| AppError::BadRequest(format!("invalid telegram initData: {err}"))),
        "id_token" => {
            let client_id = settings.telegram.client_id.as_deref().ok_or_else(|| {
                AppError::Internal(anyhow::anyhow!("TELEGRAM_CLIENT_ID not configured"))
            })?;
            telegram::validate_id_token(&auth.value, client_id)
                .await
                .map_err(|err| AppError::BadRequest(format!("invalid telegram id_token: {err}")))
        }
        other => Err(AppError::BadRequest(format!(
            "unsupported telegram auth type: {other}"
        ))),
    }
}

pub async fn fetch_avatar_url(bot_token: &str, user_id: i64) -> Option<String> {
    let photos_url = format!(
        "https://api.telegram.org/bot{bot_token}/getUserProfilePhotos?user_id={user_id}&limit=1"
    );
    let photos_response = reqwest::get(&photos_url).await.ok()?;
    let photos_body: serde_json::Value = photos_response.json().await.ok()?;
    if !photos_body["ok"].as_bool().unwrap_or(false) {
        return None;
    }

    let file_id = photos_body["result"]["photos"]
        .as_array()
        .and_then(|rows| rows.first())
        .and_then(|row| row.as_array())
        .and_then(|sizes| sizes.last())
        .and_then(|size| size["file_id"].as_str())?;

    let file_url = format!("https://api.telegram.org/bot{bot_token}/getFile?file_id={file_id}");
    let file_response = reqwest::get(&file_url).await.ok()?;
    let file_body: serde_json::Value = file_response.json().await.ok()?;
    let file_path = file_body["result"]["file_path"].as_str()?;

    Some(format!("https://api.telegram.org/file/bot{bot_token}/{file_path}"))
}

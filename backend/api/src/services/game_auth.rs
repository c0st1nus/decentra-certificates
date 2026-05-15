use anyhow::Result;
use chrono::{Duration, Utc};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};

use crate::{config::JwtSettings, error::AppError};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct GameAccessClaims {
    pub sub: String,
    pub telegram_id: i64,
    pub exp: i64,
    pub typ: String,
}

#[derive(Clone, Debug)]
pub struct AuthenticatedGameUser {
    pub id: i32,
    pub telegram_id: i64,
}

pub struct GameAuthService;

impl GameAuthService {
    pub fn issue_token(jwt: &JwtSettings, user_id: i32, telegram_id: i64) -> Result<String, AppError> {
        let now = Utc::now();
        let access_expires_at = now + Duration::hours(24);

        let access_token = encode(
            &Header::default(),
            &GameAccessClaims {
                sub: user_id.to_string(),
                telegram_id,
                exp: access_expires_at.timestamp(),
                typ: "game_access".to_owned(),
            },
            &EncodingKey::from_secret(jwt.access_secret.as_bytes()),
        )
        .map_err(|err| AppError::Internal(err.into()))?;

        Ok(access_token)
    }

    pub fn authenticate_token(jwt: &JwtSettings, token: &str) -> Result<AuthenticatedGameUser, AppError> {
        let mut validation = Validation::new(Algorithm::HS256);
        validation.validate_exp = true;

        let token_data = decode::<GameAccessClaims>(
            token,
            &DecodingKey::from_secret(jwt.access_secret.as_bytes()),
            &validation,
        )
        .map_err(|_| AppError::Unauthorized("invalid game access token".to_owned()))?;

        if token_data.claims.typ != "game_access" {
            return Err(AppError::Unauthorized(
                "invalid token type".to_owned(),
            ));
        }

        let id = token_data.claims.sub.parse::<i32>().map_err(|_| AppError::Unauthorized("invalid user id in token".to_owned()))?;

        Ok(AuthenticatedGameUser {
            id,
            telegram_id: token_data.claims.telegram_id,
        })
    }
}

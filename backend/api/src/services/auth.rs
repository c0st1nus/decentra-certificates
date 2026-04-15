use anyhow::Result;
use argon2::{
    Argon2,
    password_hash::{PasswordHash, PasswordVerifier},
};
use chrono::{Duration, Utc};
use entity::{admins, refresh_sessions};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode};
use sea_orm::{ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, Set};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::{config::JwtSettings, error::AppError};

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AdminRole {
    SuperAdmin,
    Operator,
}

impl AdminRole {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::SuperAdmin => "super_admin",
            Self::Operator => "operator",
        }
    }
}

impl TryFrom<&str> for AdminRole {
    type Error = AppError;

    fn try_from(value: &str) -> Result<Self, Self::Error> {
        match value {
            "super_admin" => Ok(Self::SuperAdmin),
            "operator" => Ok(Self::Operator),
            _ => Err(AppError::Forbidden("unknown admin role".to_owned())),
        }
    }
}

#[derive(Clone, Debug)]
pub struct AuthenticatedAdmin {
    pub id: Uuid,
    pub login: String,
    pub role: AdminRole,
}

impl AuthenticatedAdmin {
    pub fn require_role(&self, required_role: AdminRole) -> Result<(), AppError> {
        if self.role == required_role {
            return Ok(());
        }

        Err(AppError::Forbidden(format!(
            "admin role `{}` is required",
            required_role.as_str()
        )))
    }
}

#[derive(Debug, Serialize)]
pub struct LoginResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub token_type: &'static str,
    pub expires_in_seconds: i64,
    pub admin: AdminProfile,
}

#[derive(Debug, Serialize)]
pub struct RefreshResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub token_type: &'static str,
    pub expires_in_seconds: i64,
}

#[derive(Debug, Serialize)]
pub struct AdminProfile {
    pub id: Uuid,
    pub login: String,
    pub role: String,
}

#[derive(Debug, Serialize)]
pub struct SessionResponse {
    pub admin: AdminProfile,
}

#[derive(Debug, Deserialize)]
pub struct RefreshTokenRequest {
    pub refresh_token: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct AccessClaims {
    sub: String,
    login: String,
    role: String,
    exp: i64,
    typ: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
struct RefreshClaims {
    sub: String,
    sid: String,
    exp: i64,
    typ: String,
}

pub struct AuthService;

impl AuthService {
    pub async fn login(
        db: &DatabaseConnection,
        jwt: &JwtSettings,
        login: &str,
        password: &str,
    ) -> Result<LoginResponse, AppError> {
        let admin = admins::Entity::find()
            .filter(admins::Column::Login.eq(login))
            .one(db)
            .await
            .map_err(|err| AppError::Internal(err.into()))?
            .ok_or_else(|| AppError::Unauthorized("invalid login or password".to_owned()))?;

        if !admin.is_active {
            return Err(AppError::Forbidden("admin account is disabled".to_owned()));
        }

        verify_password(&admin.password_hash, password)?;

        let admin_role = AdminRole::try_from(admin.role.as_str())?;
        let admin_id = admin.id;
        let admin_login = admin.login.clone();
        let now = Utc::now();
        let access_expires_at = now + Duration::minutes(jwt.access_ttl_minutes);
        let refresh_expires_at = now + Duration::days(jwt.refresh_ttl_days);
        let refresh_session_id = Uuid::new_v4();

        let access_token = encode(
            &Header::default(),
            &AccessClaims {
                sub: admin_id.to_string(),
                login: admin_login.clone(),
                role: admin_role.as_str().to_owned(),
                exp: access_expires_at.timestamp(),
                typ: "access".to_owned(),
            },
            &EncodingKey::from_secret(jwt.access_secret.as_bytes()),
        )
        .map_err(|err| AppError::Internal(err.into()))?;

        let refresh_token = encode(
            &Header::default(),
            &RefreshClaims {
                sub: admin_id.to_string(),
                sid: refresh_session_id.to_string(),
                exp: refresh_expires_at.timestamp(),
                typ: "refresh".to_owned(),
            },
            &EncodingKey::from_secret(jwt.refresh_secret.as_bytes()),
        )
        .map_err(|err| AppError::Internal(err.into()))?;

        refresh_sessions::ActiveModel {
            id: Set(refresh_session_id),
            admin_id: Set(admin_id),
            token_hash: Set(hash_token(&refresh_token)),
            expires_at: Set(refresh_expires_at),
            revoked_at: Set(None),
            created_at: Set(now),
        }
        .insert(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;

        let mut admin_active_model: admins::ActiveModel = admin.into();
        admin_active_model.last_login_at = Set(Some(now));
        admin_active_model.updated_at = Set(now);
        admin_active_model
            .update(db)
            .await
            .map_err(|err| AppError::Internal(err.into()))?;

        Ok(LoginResponse {
            access_token,
            refresh_token,
            token_type: "Bearer",
            expires_in_seconds: jwt.access_ttl_minutes * 60,
            admin: AdminProfile {
                id: admin_id,
                login: admin_login,
                role: admin_role.as_str().to_owned(),
            },
        })
    }

    pub async fn refresh(
        db: &DatabaseConnection,
        jwt: &JwtSettings,
        refresh_token: &str,
    ) -> Result<RefreshResponse, AppError> {
        let claims = decode_refresh_claims(jwt, refresh_token)?;
        let session_id = Uuid::parse_str(&claims.sid)
            .map_err(|_| AppError::Unauthorized("invalid refresh session".to_owned()))?;
        let admin_id = Uuid::parse_str(&claims.sub)
            .map_err(|_| AppError::Unauthorized("invalid refresh subject".to_owned()))?;

        let session = refresh_sessions::Entity::find_by_id(session_id)
            .one(db)
            .await
            .map_err(|err| AppError::Internal(err.into()))?
            .ok_or_else(|| AppError::Unauthorized("refresh session not found".to_owned()))?;

        if session.admin_id != admin_id {
            return Err(AppError::Unauthorized(
                "refresh session mismatch".to_owned(),
            ));
        }
        if session.revoked_at.is_some() {
            return Err(AppError::Unauthorized("refresh session revoked".to_owned()));
        }
        if session.expires_at <= Utc::now() {
            return Err(AppError::Unauthorized("refresh session expired".to_owned()));
        }
        if session.token_hash != hash_token(refresh_token) {
            return Err(AppError::Unauthorized("refresh token mismatch".to_owned()));
        }

        let admin = admins::Entity::find_by_id(admin_id)
            .one(db)
            .await
            .map_err(|err| AppError::Internal(err.into()))?
            .ok_or_else(|| AppError::Unauthorized("admin account not found".to_owned()))?;
        if !admin.is_active {
            return Err(AppError::Forbidden("admin account is disabled".to_owned()));
        }

        let admin_role = AdminRole::try_from(admin.role.as_str())?;
        let now = Utc::now();
        let access_expires_at = now + Duration::minutes(jwt.access_ttl_minutes);
        let refresh_expires_at = now + Duration::days(jwt.refresh_ttl_days);

        let access_token = encode(
            &Header::default(),
            &AccessClaims {
                sub: admin.id.to_string(),
                login: admin.login.clone(),
                role: admin_role.as_str().to_owned(),
                exp: access_expires_at.timestamp(),
                typ: "access".to_owned(),
            },
            &EncodingKey::from_secret(jwt.access_secret.as_bytes()),
        )
        .map_err(|err| AppError::Internal(err.into()))?;

        let rotated_refresh_token = encode(
            &Header::default(),
            &RefreshClaims {
                sub: admin.id.to_string(),
                sid: session.id.to_string(),
                exp: refresh_expires_at.timestamp(),
                typ: "refresh".to_owned(),
            },
            &EncodingKey::from_secret(jwt.refresh_secret.as_bytes()),
        )
        .map_err(|err| AppError::Internal(err.into()))?;

        let mut session_active_model: refresh_sessions::ActiveModel = session.into();
        session_active_model.token_hash = Set(hash_token(&rotated_refresh_token));
        session_active_model.expires_at = Set(refresh_expires_at);
        session_active_model
            .update(db)
            .await
            .map_err(|err| AppError::Internal(err.into()))?;

        Ok(RefreshResponse {
            access_token,
            refresh_token: rotated_refresh_token,
            token_type: "Bearer",
            expires_in_seconds: jwt.access_ttl_minutes * 60,
        })
    }

    pub async fn logout(
        db: &DatabaseConnection,
        jwt: &JwtSettings,
        refresh_token: &str,
    ) -> Result<(), AppError> {
        let claims = decode_refresh_claims(jwt, refresh_token)?;
        let session_id = Uuid::parse_str(&claims.sid)
            .map_err(|_| AppError::Unauthorized("invalid refresh session".to_owned()))?;
        let session = refresh_sessions::Entity::find_by_id(session_id)
            .one(db)
            .await
            .map_err(|err| AppError::Internal(err.into()))?
            .ok_or_else(|| AppError::Unauthorized("refresh session not found".to_owned()))?;

        let mut session_active_model: refresh_sessions::ActiveModel = session.into();
        session_active_model.revoked_at = Set(Some(Utc::now()));
        session_active_model
            .update(db)
            .await
            .map_err(|err| AppError::Internal(err.into()))?;

        Ok(())
    }

    pub async fn authenticate_access_token(
        db: &DatabaseConnection,
        jwt: &JwtSettings,
        token: &str,
    ) -> Result<AuthenticatedAdmin, AppError> {
        let claims = decode_access_claims(jwt, token)?;
        let admin_id = Uuid::parse_str(&claims.sub)
            .map_err(|_| AppError::Unauthorized("invalid access token subject".to_owned()))?;
        let admin = admins::Entity::find_by_id(admin_id)
            .one(db)
            .await
            .map_err(|err| AppError::Internal(err.into()))?
            .ok_or_else(|| AppError::Unauthorized("admin account not found".to_owned()))?;

        if !admin.is_active {
            return Err(AppError::Forbidden("admin account is disabled".to_owned()));
        }

        Ok(AuthenticatedAdmin {
            id: admin.id,
            login: admin.login,
            role: AdminRole::try_from(admin.role.as_str())?,
        })
    }
}

fn decode_access_claims(jwt: &JwtSettings, token: &str) -> Result<AccessClaims, AppError> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;

    let token_data = decode::<AccessClaims>(
        token,
        &DecodingKey::from_secret(jwt.access_secret.as_bytes()),
        &validation,
    )
    .map_err(|_| AppError::Unauthorized("invalid access token".to_owned()))?;

    if token_data.claims.typ != "access" {
        return Err(AppError::Unauthorized(
            "invalid access token type".to_owned(),
        ));
    }

    Ok(token_data.claims)
}

fn decode_refresh_claims(jwt: &JwtSettings, token: &str) -> Result<RefreshClaims, AppError> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;

    let token_data = decode::<RefreshClaims>(
        token,
        &DecodingKey::from_secret(jwt.refresh_secret.as_bytes()),
        &validation,
    )
    .map_err(|_| AppError::Unauthorized("invalid refresh token".to_owned()))?;

    if token_data.claims.typ != "refresh" {
        return Err(AppError::Unauthorized(
            "invalid refresh token type".to_owned(),
        ));
    }

    Ok(token_data.claims)
}

fn verify_password(password_hash: &str, password: &str) -> Result<(), AppError> {
    let parsed_hash = PasswordHash::new(password_hash)
        .map_err(|_| AppError::Unauthorized("invalid login or password".to_owned()))?;
    Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .map_err(|_| AppError::Unauthorized("invalid login or password".to_owned()))
}

fn hash_token(token: &str) -> String {
    format!("{:x}", Sha256::digest(token.as_bytes()))
}

use actix_web::{HttpResponse, get, patch, post, web};
use serde::{Deserialize, Serialize};
use validator::Validate;

use crate::{
    error::AppError,
    middleware::auth::AdminAuth,
    services::{
        auth::{AuthService, RefreshTokenRequest, SessionResponse},
        settings,
    },
    state::AppState,
};

#[derive(Debug, Deserialize, Validate)]
pub struct LoginRequest {
    #[validate(length(min = 3))]
    pub login: String,
    #[validate(length(min = 8))]
    pub password: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateIssuanceStatusRequest {
    pub enabled: bool,
}

#[derive(Debug, Serialize)]
pub struct IssuanceStatusResponse {
    pub enabled: bool,
    pub updated_from_db: bool,
}

#[post("/login")]
async fn login(
    state: web::Data<AppState>,
    payload: web::Json<LoginRequest>,
) -> Result<HttpResponse, AppError> {
    payload
        .validate()
        .map_err(|err| AppError::BadRequest(err.to_string()))?;

    let response = AuthService::login(
        &state.db,
        &state.settings.jwt,
        &payload.login,
        &payload.password,
    )
    .await?;

    Ok(HttpResponse::Ok().json(response))
}

#[post("/refresh")]
async fn refresh(
    state: web::Data<AppState>,
    payload: web::Json<RefreshTokenRequest>,
) -> Result<HttpResponse, AppError> {
    let response =
        AuthService::refresh(&state.db, &state.settings.jwt, &payload.refresh_token).await?;

    Ok(HttpResponse::Ok().json(response))
}

#[post("/logout")]
async fn logout(
    state: web::Data<AppState>,
    payload: web::Json<RefreshTokenRequest>,
    _auth: AdminAuth,
) -> Result<HttpResponse, AppError> {
    AuthService::logout(&state.db, &state.settings.jwt, &payload.refresh_token).await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "status": "ok"
    })))
}

#[get("/me")]
async fn me(auth: AdminAuth) -> Result<HttpResponse, AppError> {
    Ok(HttpResponse::Ok().json(SessionResponse {
        admin: crate::services::auth::AdminProfile {
            id: auth.0.id,
            login: auth.0.login,
            role: auth.0.role.as_str().to_owned(),
        },
    }))
}

#[get("/issuance/status")]
async fn get_issuance_status(
    state: web::Data<AppState>,
    _auth: AdminAuth,
) -> Result<HttpResponse, AppError> {
    let issuance =
        settings::get_issuance_setting(&state.db, state.settings.issuance_enabled_default)
            .await
            .map_err(AppError::Internal)?;

    Ok(HttpResponse::Ok().json(IssuanceStatusResponse {
        enabled: issuance.enabled,
        updated_from_db: true,
    }))
}

#[patch("/issuance/status")]
async fn update_issuance_status(
    state: web::Data<AppState>,
    auth: AdminAuth,
    payload: web::Json<UpdateIssuanceStatusRequest>,
) -> Result<HttpResponse, AppError> {
    auth.require_role(crate::services::auth::AdminRole::SuperAdmin)?;

    let issuance = settings::update_issuance_setting(&state.db, payload.enabled)
        .await
        .map_err(AppError::Internal)?;

    Ok(HttpResponse::Ok().json(IssuanceStatusResponse {
        enabled: issuance.enabled,
        updated_from_db: true,
    }))
}

pub fn configure_public_auth(cfg: &mut web::ServiceConfig) {
    cfg.service(login).service(refresh);
}

pub fn configure_protected(cfg: &mut web::ServiceConfig) {
    cfg.service(logout)
        .service(me)
        .service(get_issuance_status)
        .service(update_issuance_status);
}

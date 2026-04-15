use actix_web::{HttpResponse, post, web};
use serde::Deserialize;
use validator::Validate;

use crate::{error::AppError, state::AppState};

#[derive(Debug, Deserialize, Validate)]
pub struct LoginRequest {
    #[validate(length(min = 3))]
    pub login: String,
    #[validate(length(min = 8))]
    pub password: String,
}

#[post("/auth/login")]
async fn login(
    _state: web::Data<AppState>,
    payload: web::Json<LoginRequest>,
) -> Result<HttpResponse, AppError> {
    payload
        .validate()
        .map_err(|err| AppError::BadRequest(err.to_string()))?;

    Ok(HttpResponse::NotImplemented().json(serde_json::json!({
        "status": "pending",
        "message": "DB-backed admin auth будет подключен следующим шагом"
    })))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(login);
}

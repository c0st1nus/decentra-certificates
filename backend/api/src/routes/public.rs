use actix_web::{HttpResponse, post, web};
use serde::{Deserialize, Serialize};
use validator::Validate;

use crate::{error::AppError, state::AppState};

#[derive(Debug, Deserialize, Validate)]
pub struct CertificateRequest {
    #[validate(email(message = "invalid email format"))]
    pub email: String,
}

#[derive(Debug, Serialize)]
pub struct CertificateRequestResponse {
    pub status: &'static str,
    pub message: &'static str,
}

#[post("/certificates/request")]
async fn request_certificate(
    state: web::Data<AppState>,
    payload: web::Json<CertificateRequest>,
) -> Result<HttpResponse, AppError> {
    payload
        .validate()
        .map_err(|err| AppError::BadRequest(err.to_string()))?;

    if !state.settings.issuance_enabled {
        return Ok(HttpResponse::Forbidden().json(CertificateRequestResponse {
            status: "issuance_disabled",
            message: "Выдача сертификатов еще не открыта",
        }));
    }

    Ok(HttpResponse::NotImplemented().json(CertificateRequestResponse {
        status: "pending",
        message: "Публичная выдача будет подключена после импорта участников и шаблонов",
    }))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(request_certificate);
}

use actix_web::{HttpResponse, get, http::header, post, web};
use serde::{Deserialize, Serialize};
use validator::Validate;

use crate::{error::AppError, services::certificates, state::AppState};

#[derive(Debug, Deserialize, Validate)]
pub struct CertificateRequest {
    #[validate(email(message = "invalid email format"))]
    pub email: String,
}

#[derive(Debug, Serialize)]
pub struct VerificationLookupResponse {
    pub status: &'static str,
    pub message: &'static str,
    pub certificate_id: String,
    pub verification_code: String,
    pub full_name: String,
    pub template_name: String,
    pub issued_at: String,
}

#[post("/certificates/request")]
async fn request_certificate(
    state: web::Data<AppState>,
    payload: web::Json<CertificateRequest>,
) -> Result<HttpResponse, AppError> {
    payload
        .validate()
        .map_err(|err| AppError::BadRequest(err.to_string()))?;

    let response = certificates::issue_certificate(
        &state.db,
        &state.storage,
        state.settings.issuance_enabled_default,
        &payload.email,
    )
    .await?;

    Ok(HttpResponse::Ok().json(response))
}

#[get("/certificates/{certificate_id}/download")]
async fn download_certificate(
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let certificate_id = path.into_inner();
    let (pdf, filename) = certificates::download_certificate(&state.db, &certificate_id).await?;

    Ok(HttpResponse::Ok()
        .insert_header((header::CONTENT_TYPE, "application/pdf"))
        .insert_header((
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{filename}.pdf\""),
        ))
        .body(pdf))
}

#[get("/certificates/verify/{verification_code}")]
async fn verify_certificate(
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let lookup = certificates::verify_certificate(&state.db, &path.into_inner()).await?;

    Ok(HttpResponse::Ok().json(VerificationLookupResponse {
        status: lookup.status,
        message: lookup.message,
        certificate_id: lookup.certificate_id,
        verification_code: lookup.verification_code,
        full_name: lookup.full_name,
        template_name: lookup.template_name,
        issued_at: lookup.issued_at,
    }))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(request_certificate)
        .service(download_certificate)
        .service(verify_certificate);
}

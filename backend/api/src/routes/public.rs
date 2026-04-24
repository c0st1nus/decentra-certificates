use std::time::Duration;

use actix_web::{HttpResponse, get, http::header, post, web};
use futures_util::StreamExt;
use futures_util::stream;
use jsonwebtoken::{DecodingKey, EncodingKey, Header, Validation, decode, encode};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

use crate::{
    error::AppError,
    services::{certificates, telegram, urls},
    state::AppState,
};

const DOWNLOAD_TOKEN_TTL_SECONDS: i64 = 15 * 60;
const DOWNLOAD_TOKEN_TYPE: &str = "certificate_download";
const JOB_EVENTS_TOKEN_TTL_SECONDS: i64 = 30 * 60;
const JOB_EVENTS_TOKEN_TYPE: &str = "certificate_job_events";

#[derive(Debug, Deserialize, Validate)]
pub struct CertificateRequest {
    #[validate(email(message = "invalid email format"))]
    pub email: String,
    pub template_id: Option<Uuid>,
    pub telegram_auth: Option<TelegramAuthPayload>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct CheckCertificatesRequest {
    #[validate(email(message = "invalid email format"))]
    pub email: String,
    pub telegram_auth: Option<TelegramAuthPayload>,
}

#[derive(Debug, Deserialize, Validate)]
pub struct VerifySubscriptionRequest {
    pub telegram_auth: TelegramAuthPayload,
}

#[derive(Debug, Deserialize, Clone)]
pub struct TelegramAuthPayload {
    pub auth_type: String,
    pub value: String,
}

#[derive(Debug, Deserialize)]
struct DownloadCertificateQuery {
    disposition: Option<String>,
    download_token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CertificateJobEventsQuery {
    status_token: Option<String>,
}

#[derive(Debug, Deserialize, Serialize)]
struct PublicAccessTokenClaims {
    sub: String,
    exp: i64,
    typ: String,
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

#[derive(Debug, Serialize)]
pub struct SubscriptionStatusResponse {
    pub subscribed: bool,
    pub user_id: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct TelegramSettingsResponse {
    pub channel_url: String,
    pub subscription_required: bool,
    pub client_id: Option<String>,
}

struct JobEventStreamState {
    app_state: web::Data<AppState>,
    job_id: String,
    last_payload: Option<String>,
    heartbeat_ticks: u8,
    terminal_sent: bool,
}

#[post("/certificates/request")]
async fn request_certificate(
    state: web::Data<AppState>,
    payload: web::Json<CertificateRequest>,
) -> Result<HttpResponse, AppError> {
    payload
        .validate()
        .map_err(|err| AppError::BadRequest(err.to_string()))?;

    verify_telegram_subscription_if_required(&state, payload.telegram_auth.as_ref()).await?;

    match certificates::issue_certificate(&state, &payload.email, payload.template_id).await? {
        certificates::IssueCertificateResult::Ready(mut response) => {
            response.download_url =
                protected_certificate_download_url(&state, &response.certificate_id)?;
            Ok(HttpResponse::Ok().json(response))
        }
        certificates::IssueCertificateResult::Queued(mut response) => {
            response.events_url = protected_certificate_job_events_url(&state, &response.job_id)?;
            Ok(HttpResponse::Accepted().json(response))
        }
    }
}

#[post("/certificates/check")]
async fn check_certificates(
    state: web::Data<AppState>,
    payload: web::Json<CheckCertificatesRequest>,
) -> Result<HttpResponse, AppError> {
    payload
        .validate()
        .map_err(|err| AppError::BadRequest(err.to_string()))?;

    verify_telegram_subscription_if_required(&state, payload.telegram_auth.as_ref()).await?;

    let mut response = certificates::check_available_certificates(&state, &payload.email).await?;
    add_available_download_tokens(&state, &mut response)?;

    Ok(HttpResponse::Ok().json(response))
}

#[get("/telegram/settings")]
async fn telegram_settings(state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    Ok(HttpResponse::Ok().json(TelegramSettingsResponse {
        channel_url: state.settings.telegram.channel_url.clone(),
        subscription_required: state.settings.telegram.subscription_required,
        client_id: state.settings.telegram.client_id.clone(),
    }))
}

#[post("/telegram/verify-subscription")]
async fn verify_subscription(
    state: web::Data<AppState>,
    payload: web::Json<VerifySubscriptionRequest>,
) -> Result<HttpResponse, AppError> {
    let (subscribed, user_id) =
        check_telegram_subscription(&state, Some(&payload.telegram_auth)).await?;

    Ok(HttpResponse::Ok().json(SubscriptionStatusResponse {
        subscribed,
        user_id,
    }))
}

#[get("/certificates/jobs/{job_id}")]
async fn get_certificate_job(
    state: web::Data<AppState>,
    path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let response = certificates::get_certificate_job(&state, &path.into_inner()).await?;
    Ok(HttpResponse::Ok().json(response))
}

#[get("/certificates/jobs/{job_id}/events")]
async fn certificate_job_events(
    state: web::Data<AppState>,
    path: web::Path<String>,
    query: web::Query<CertificateJobEventsQuery>,
) -> Result<HttpResponse, AppError> {
    let job_id = path.into_inner();
    verify_job_events_token_if_required(&state, &job_id, query.status_token.as_deref())?;
    let mut initial_status = certificates::get_certificate_job(&state, &job_id).await?;
    add_job_download_token(&state, &mut initial_status)?;
    let initial_payload = serde_json::to_string(&initial_status).map_err(|err| {
        AppError::Internal(anyhow::anyhow!(
            "failed to serialize initial job status: {err}"
        ))
    })?;

    let stream = stream::unfold(
        Some(JobEventStreamState {
            app_state: state,
            job_id,
            last_payload: Some(initial_payload.clone()),
            heartbeat_ticks: 0,
            terminal_sent: is_terminal_status(&initial_status.status),
        }),
        move |state| async move {
            let mut state = match state {
                Some(state) => state,
                None => return None,
            };

            if state.terminal_sent {
                return None;
            }

            tokio::time::sleep(Duration::from_secs(1)).await;
            let mut status =
                match certificates::get_certificate_job(&state.app_state, &state.job_id).await {
                    Ok(status) => status,
                    Err(err) => {
                        let chunk = format!(
                            "event: error\ndata: {}\n\n",
                            serde_json::json!({ "message": err.to_string() })
                        );
                        return Some((Ok(web::Bytes::from(chunk)), None));
                    }
                };
            if let Err(err) = add_job_download_token(&state.app_state, &mut status) {
                let chunk = format!(
                    "event: error\ndata: {}\n\n",
                    serde_json::json!({ "message": err.to_string() })
                );
                return Some((Ok(web::Bytes::from(chunk)), None));
            }

            let payload = match serde_json::to_string(&status) {
                Ok(payload) => payload,
                Err(err) => {
                    let chunk = format!(
                        "event: error\ndata: {}\n\n",
                        serde_json::json!({ "message": err.to_string() })
                    );
                    return Some((Ok(web::Bytes::from(chunk)), None));
                }
            };

            let is_terminal = is_terminal_status(&status.status);
            if state.last_payload.as_deref() != Some(payload.as_str()) {
                state.last_payload = Some(payload.clone());
                state.heartbeat_ticks = 0;
                state.terminal_sent = is_terminal;
                let chunk = format!("event: status\ndata: {payload}\n\n");
                return Some((Ok(web::Bytes::from(chunk)), Some(state)));
            }

            state.heartbeat_ticks = state.heartbeat_ticks.saturating_add(1);
            if state.heartbeat_ticks >= 10 {
                state.heartbeat_ticks = 0;
                state.terminal_sent = is_terminal;
                return Some((
                    Ok(web::Bytes::from_static(b": keep-alive\n\n")),
                    Some(state),
                ));
            }

            Some((Ok(web::Bytes::from_static(b"")), Some(state)))
        },
    );

    let first_chunk = web::Bytes::from(format!("event: status\ndata: {initial_payload}\n\n"));
    let response_stream =
        stream::once(async move { Ok::<_, actix_web::Error>(first_chunk) }).chain(stream);

    Ok(HttpResponse::Ok()
        .insert_header((header::CONTENT_TYPE, "text/event-stream"))
        .insert_header((header::CACHE_CONTROL, "no-cache"))
        .insert_header(("X-Accel-Buffering", "no"))
        .streaming(response_stream))
}

#[get("/certificates/{certificate_id}/download")]
async fn download_certificate(
    state: web::Data<AppState>,
    path: web::Path<String>,
    query: web::Query<DownloadCertificateQuery>,
) -> Result<HttpResponse, AppError> {
    let certificate_id = path.into_inner();
    verify_download_token_if_required(&state, &certificate_id, query.download_token.as_deref())?;
    let (pdf, filename) = certificates::download_certificate(&state, &certificate_id).await?;
    let content_disposition = match query.disposition.as_deref() {
        Some("inline") => format!("inline; filename=\"{filename}.pdf\""),
        _ => format!("attachment; filename=\"{filename}.pdf\""),
    };

    Ok(HttpResponse::Ok()
        .insert_header((header::CONTENT_TYPE, "application/pdf"))
        .insert_header((header::CONTENT_DISPOSITION, content_disposition))
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
        .service(check_certificates)
        .service(telegram_settings)
        .service(verify_subscription)
        .service(get_certificate_job)
        .service(certificate_job_events)
        .service(download_certificate)
        .service(verify_certificate);
}

fn is_terminal_status(status: &str) -> bool {
    matches!(status, "completed" | "failed")
}

fn add_available_download_tokens(
    state: &AppState,
    response: &mut certificates::AvailableCertificatesResponse,
) -> Result<(), AppError> {
    for certificate in &mut response.certificates {
        if certificate.download_url.is_some()
            && let Some(certificate_id) = certificate.certificate_id.as_deref()
        {
            certificate.download_url =
                Some(protected_certificate_download_url(state, certificate_id)?);
        }
    }

    Ok(())
}

fn add_job_download_token(
    state: &AppState,
    status: &mut crate::services::certificate_jobs::CertificateJobStatus,
) -> Result<(), AppError> {
    if status.status == "completed" && status.download_url.is_some() {
        status.download_url = Some(protected_certificate_download_url(
            state,
            &status.certificate_id,
        )?);
    }

    Ok(())
}

fn protected_certificate_download_url(
    state: &AppState,
    certificate_id: &str,
) -> Result<String, AppError> {
    if !state.settings.telegram.subscription_required {
        return Ok(urls::certificate_download_url(certificate_id));
    }

    let token = issue_download_token(state, certificate_id)?;
    Ok(format!(
        "{}?download_token={}",
        urls::certificate_download_url(certificate_id),
        urlencoding::encode(&token)
    ))
}

fn protected_certificate_job_events_url(
    state: &AppState,
    job_id: &str,
) -> Result<String, AppError> {
    let path = urls::certificate_job_events_url(job_id);
    if !state.settings.telegram.subscription_required {
        return Ok(path);
    }

    let token = issue_public_access_token(
        state,
        job_id,
        JOB_EVENTS_TOKEN_TYPE,
        JOB_EVENTS_TOKEN_TTL_SECONDS,
    )?;
    Ok(format!(
        "{path}?status_token={}",
        urlencoding::encode(&token)
    ))
}

fn issue_download_token(state: &AppState, certificate_id: &str) -> Result<String, AppError> {
    issue_public_access_token(
        state,
        certificate_id,
        DOWNLOAD_TOKEN_TYPE,
        DOWNLOAD_TOKEN_TTL_SECONDS,
    )
}

fn issue_public_access_token(
    state: &AppState,
    subject: &str,
    token_type: &str,
    ttl_seconds: i64,
) -> Result<String, AppError> {
    let expires_at = chrono::Utc::now() + chrono::Duration::seconds(ttl_seconds);
    encode(
        &Header::default(),
        &PublicAccessTokenClaims {
            sub: subject.to_owned(),
            exp: expires_at.timestamp(),
            typ: token_type.to_owned(),
        },
        &EncodingKey::from_secret(state.settings.jwt.access_secret.as_bytes()),
    )
    .map_err(|err| AppError::Internal(err.into()))
}

fn verify_job_events_token_if_required(
    state: &AppState,
    job_id: &str,
    token: Option<&str>,
) -> Result<(), AppError> {
    verify_public_access_token_if_required(
        state,
        job_id,
        token,
        JOB_EVENTS_TOKEN_TYPE,
        "status_token_required",
        "invalid_status_token",
    )
}

fn verify_download_token_if_required(
    state: &AppState,
    certificate_id: &str,
    token: Option<&str>,
) -> Result<(), AppError> {
    verify_public_access_token_if_required(
        state,
        certificate_id,
        token,
        DOWNLOAD_TOKEN_TYPE,
        "download_token_required",
        "invalid_download_token",
    )
}

fn verify_public_access_token_if_required(
    state: &AppState,
    subject: &str,
    token: Option<&str>,
    token_type: &str,
    missing_message: &str,
    invalid_message: &str,
) -> Result<(), AppError> {
    if !state.settings.telegram.subscription_required {
        return Ok(());
    }

    let token = token.ok_or_else(|| AppError::Forbidden(missing_message.to_owned()))?;
    let claims = decode::<PublicAccessTokenClaims>(
        token,
        &DecodingKey::from_secret(state.settings.jwt.access_secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|_| AppError::Forbidden(invalid_message.to_owned()))?
    .claims;

    if claims.typ != token_type || claims.sub != subject {
        return Err(AppError::Forbidden(invalid_message.to_owned()));
    }

    Ok(())
}

async fn verify_telegram_subscription_if_required(
    state: &AppState,
    auth: Option<&TelegramAuthPayload>,
) -> Result<(), AppError> {
    if !state.settings.telegram.subscription_required {
        return Ok(());
    }

    let (subscribed, _) = check_telegram_subscription(state, auth).await?;
    if !subscribed {
        return Err(AppError::Forbidden("not_subscribed_to_channel".to_owned()));
    }

    Ok(())
}

async fn check_telegram_subscription(
    state: &AppState,
    auth: Option<&TelegramAuthPayload>,
) -> Result<(bool, Option<i64>), AppError> {
    let auth = match auth {
        Some(a) => a,
        None => return Ok((false, None)),
    };

    let bot_token = state
        .settings
        .telegram
        .bot_token
        .as_deref()
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("TELEGRAM_BOT_TOKEN not configured")))?;

    let channel_id = state
        .settings
        .telegram
        .channel_id
        .as_deref()
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("TELEGRAM_CHANNEL_ID not configured")))?;

    let user = match auth.auth_type.as_str() {
        "init_data" => telegram::validate_init_data(&auth.value, bot_token)
            .map_err(|err| AppError::BadRequest(format!("invalid telegram initData: {err}")))?,
        "id_token" => {
            let client_id = state
                .settings
                .telegram
                .client_id
                .as_deref()
                .ok_or_else(|| {
                    AppError::Internal(anyhow::anyhow!("TELEGRAM_CLIENT_ID not configured"))
                })?;
            telegram::validate_id_token(&auth.value, client_id)
                .await
                .map_err(|err| AppError::BadRequest(format!("invalid telegram id_token: {err}")))?
        }
        other => {
            return Err(AppError::BadRequest(format!(
                "unsupported telegram auth type: {other}"
            )));
        }
    };

    let subscribed = telegram::check_channel_subscription(user.id, channel_id, bot_token)
        .await
        .map_err(|err| AppError::Internal(anyhow::anyhow!("telegram api error: {err}")))?;

    Ok((subscribed, Some(user.id)))
}

use std::{future::Ready, future::ready};

use actix_web::{
    Error, FromRequest, HttpMessage, HttpRequest,
    body::MessageBody,
    dev::{ServiceRequest, ServiceResponse},
    middleware::Next,
    web,
};

use crate::{
    error::AppError,
    services::auth::{AdminRole, AuthService, AuthenticatedAdmin},
    state::AppState,
};

pub async fn require_admin_auth(
    req: ServiceRequest,
    next: Next<impl MessageBody>,
) -> Result<ServiceResponse<impl MessageBody>, Error> {
    let state = req
        .app_data::<web::Data<AppState>>()
        .cloned()
        .ok_or_else(|| {
            AppError::Internal(anyhow::anyhow!("application state is not configured"))
        })?;
    let token = extract_bearer_token(req.request())?;
    let admin =
        AuthService::authenticate_access_token(&state.db, &state.settings.jwt, token).await?;

    req.extensions_mut().insert(admin);

    next.call(req).await
}

#[derive(Clone, Debug)]
pub struct AdminAuth(pub AuthenticatedAdmin);

impl AdminAuth {
    pub fn require_role(&self, required_role: AdminRole) -> Result<(), AppError> {
        self.0.require_role(required_role)
    }
}

impl FromRequest for AdminAuth {
    type Error = Error;
    type Future = Ready<Result<Self, Self::Error>>;

    fn from_request(req: &HttpRequest, _: &mut actix_web::dev::Payload) -> Self::Future {
        ready(
            req.extensions()
                .get::<AuthenticatedAdmin>()
                .cloned()
                .map(Self)
                .ok_or_else(|| {
                    AppError::Unauthorized("missing authenticated admin context".to_owned()).into()
                }),
        )
    }
}

fn extract_bearer_token(request: &HttpRequest) -> Result<&str, AppError> {
    let header = request
        .headers()
        .get(actix_web::http::header::AUTHORIZATION)
        .ok_or_else(|| AppError::Unauthorized("missing bearer token".to_owned()))?;
    let value = header
        .to_str()
        .map_err(|_| AppError::Unauthorized("invalid authorization header".to_owned()))?;

    value
        .strip_prefix("Bearer ")
        .filter(|token| !token.is_empty())
        .ok_or_else(|| AppError::Unauthorized("invalid bearer token".to_owned()))
}

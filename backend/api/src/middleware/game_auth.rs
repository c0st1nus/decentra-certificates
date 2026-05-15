use actix_web::{FromRequest, dev::Payload, error::ErrorUnauthorized};
use std::future::{ready, Ready};

use crate::{
    services::game_auth::{AuthenticatedGameUser, GameAuthService},
    state::AppState,
};

pub struct GameAuth(pub AuthenticatedGameUser);

impl FromRequest for GameAuth {
    type Error = actix_web::Error;
    type Future = Ready<Result<Self, Self::Error>>;

    fn from_request(req: &actix_web::HttpRequest, _payload: &mut Payload) -> Self::Future {
        let auth_header = match req.headers().get("Authorization") {
            Some(header) => header,
            None => return ready(Err(ErrorUnauthorized("missing authorization header"))),
        };

        let auth_str = match auth_header.to_str() {
            Ok(s) => s,
            Err(_) => return ready(Err(ErrorUnauthorized("invalid authorization header"))),
        };

        if !auth_str.starts_with("Bearer ") {
            return ready(Err(ErrorUnauthorized("invalid authorization type")));
        }

        let token = &auth_str["Bearer ".len()..];

        let state = match req.app_data::<actix_web::web::Data<AppState>>() {
            Some(state) => state,
            None => return ready(Err(actix_web::error::ErrorInternalServerError("missing state"))),
        };

        match GameAuthService::authenticate_token(&state.settings.jwt, token) {
            Ok(user) => ready(Ok(GameAuth(user))),
            Err(_) => ready(Err(ErrorUnauthorized("invalid token"))),
        }
    }
}

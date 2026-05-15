use actix_web::{HttpResponse, get, post, web};
use chrono::Utc;
use entity::{game_scores, game_sessions, game_users, prelude::*};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, PaginatorTrait, QueryFilter, QueryOrder,
    QuerySelect, Set, TryIntoModel,
};
use serde::{Deserialize, Serialize};

use crate::{
    error::AppError,
    middleware::game_auth::GameAuth,
    services::{
        game_auth::GameAuthService,
        game_leaderboard::{self, validate_score_plausibility},
        game_telegram::{self, TelegramAuthPayload},
    },
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct GameAuthRequest {
    pub telegram_auth: TelegramAuthPayload,
}

#[derive(Debug, Serialize)]
pub struct GameAuthResponse {
    pub access_token: String,
    pub expires_in_seconds: i64,
    pub user: game_users::Model,
}

#[derive(Debug, Serialize)]
pub struct GameHistoryItem {
    pub id: String,
    pub score: i32,
    pub lines_cleared: i32,
    pub level: i32,
    pub duration_seconds: i32,
    pub created_at: chrono::DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct ProfileStats {
    pub games_played: u64,
    pub personal_best: i32,
    pub total_score: i64,
    pub total_lines_cleared: i64,
}

#[derive(Debug, Serialize)]
pub struct ProfileResponse {
    pub user: game_users::Model,
    pub stats: ProfileStats,
    pub games: Vec<GameHistoryItem>,
}

#[derive(Debug, Serialize)]
pub struct SessionStartResponse {
    pub session_id: String,
    pub nonce: String,
}

#[derive(Debug, Deserialize)]
pub struct SessionFinishRequest {
    pub score: i32,
    pub lines_cleared: i32,
    pub nonce: String,
}

#[derive(Debug, Deserialize)]
pub struct LeaderboardQuery {
    pub page: Option<u64>,
    pub page_size: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct LeaderboardEntry {
    pub user_id: i32,
    pub username: Option<String>,
    pub avatar_url: Option<String>,
    pub score: i32,
    pub lines_cleared: i32,
    pub rank: u64,
    pub achieved_at: chrono::DateTime<Utc>,
}

#[post("/auth")]
async fn auth(
    state: web::Data<AppState>,
    payload: web::Json<GameAuthRequest>,
) -> Result<HttpResponse, AppError> {
    let telegram_user =
        game_telegram::resolve_telegram_user(&state.settings, &payload.telegram_auth).await?;

    let bot_token = state.settings.telegram.bot_token.as_deref();
    let avatar_url = if let Some(token) = bot_token {
        game_telegram::fetch_avatar_url(token, telegram_user.id).await
    } else {
        None
    };

    let user = if let Some(existing_user) = GameUsers::find()
        .filter(game_users::Column::TelegramId.eq(telegram_user.id))
        .one(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.into()))?
    {
        let mut active_user: game_users::ActiveModel = existing_user.into();
        let mut updated = false;
        if telegram_user.username.is_some() {
            active_user.username = Set(telegram_user.username.clone());
            updated = true;
        }
        if avatar_url.is_some() {
            active_user.avatar_url = Set(avatar_url.clone());
            updated = true;
        }
        if updated {
            active_user
                .update(&state.db)
                .await
                .map_err(|e| AppError::Internal(e.into()))?
        } else {
            active_user.try_into_model().unwrap()
        }
    } else {
        game_users::ActiveModel {
            telegram_id: Set(telegram_user.id),
            username: Set(telegram_user.username),
            avatar_url: Set(avatar_url),
            ..Default::default()
        }
        .insert(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.into()))?
    };

    let token = GameAuthService::issue_token(&state.settings.jwt, user.id, user.telegram_id)?;

    Ok(HttpResponse::Ok().json(GameAuthResponse {
        access_token: token,
        expires_in_seconds: 24 * 60 * 60,
        user,
    }))
}

#[get("/me")]
async fn get_profile(auth_user: GameAuth, state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    let user = GameUsers::find_by_id(auth_user.0.id)
        .one(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.into()))?
        .ok_or_else(|| AppError::NotFound("User not found".to_owned()))?;

    let completed_sessions = GameSessions::find()
        .filter(game_sessions::Column::UserId.eq(user.id))
        .filter(game_sessions::Column::Status.eq("completed"))
        .order_by_desc(game_sessions::Column::EndedAt)
        .limit(25)
        .all(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    let total_games = GameSessions::find()
        .filter(game_sessions::Column::UserId.eq(user.id))
        .filter(game_sessions::Column::Status.eq("completed"))
        .count(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    let top_score = GameScores::find()
        .filter(game_scores::Column::UserId.eq(user.id))
        .order_by_desc(game_scores::Column::Score)
        .one(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    let aggregate = GameScores::find()
        .filter(game_scores::Column::UserId.eq(user.id))
        .all(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    let games: Vec<GameHistoryItem> = completed_sessions
        .into_iter()
        .map(|session| GameHistoryItem {
            id: session.id.to_string(),
            score: session.score.unwrap_or(0),
            lines_cleared: session.lines_cleared.unwrap_or(0),
            level: ((session.lines_cleared.unwrap_or(0) / 10) + 1).max(1),
            duration_seconds: session.duration_ms.unwrap_or(0) / 1000,
            created_at: chrono::DateTime::<Utc>::from_naive_utc_and_offset(
                session.ended_at.unwrap_or(session.started_at).naive_utc(),
                Utc,
            ),
        })
        .collect();

    let total_score: i64 = aggregate.iter().map(|row| i64::from(row.score)).sum();
    let total_lines_cleared: i64 = aggregate.iter().map(|row| i64::from(row.lines_cleared)).sum();

    Ok(HttpResponse::Ok().json(ProfileResponse {
        user,
        stats: ProfileStats {
            games_played: total_games,
            personal_best: top_score.map(|row| row.score).unwrap_or(0),
            total_score,
            total_lines_cleared,
        },
        games,
    }))
}

#[post("/sessions/start")]
async fn start_session(
    auth_user: GameAuth,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let _ = game_leaderboard::apply_scheduled_reset_if_due(&state.db).await?;

    let nonce = uuid::Uuid::new_v4().to_string();
    let session = game_sessions::ActiveModel {
        user_id: Set(auth_user.0.id),
        status: Set("active".to_owned()),
        nonce: Set(nonce.clone()),
        ..Default::default()
    }
    .insert(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    Ok(HttpResponse::Ok().json(SessionStartResponse {
        session_id: session.id.to_string(),
        nonce,
    }))
}

#[post("/sessions/{id}/finish")]
async fn finish_session(
    auth_user: GameAuth,
    path: web::Path<String>,
    payload: web::Json<SessionFinishRequest>,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let session_id = path
        .parse::<i32>()
        .map_err(|_| AppError::BadRequest("invalid session id".to_owned()))?;

    let session = GameSessions::find_by_id(session_id)
        .one(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.into()))?
        .ok_or_else(|| AppError::NotFound("Session not found".to_owned()))?;

    if session.user_id != auth_user.0.id {
        return Err(AppError::Forbidden(
            "Session belongs to another user".to_owned(),
        ));
    }

    if session.status != "active" {
        return Err(AppError::BadRequest(
            "Session is already completed".to_owned(),
        ));
    }

    if session.nonce != payload.nonce {
        return Err(AppError::BadRequest("Invalid nonce".to_owned()));
    }

    let now = Utc::now();
    let started_at = chrono::DateTime::<Utc>::from_naive_utc_and_offset(session.started_at.naive_utc(), Utc);
    let duration_ms = (now - started_at).num_milliseconds().clamp(0, i64::MAX) as i32;

    if !validate_score_plausibility(payload.score, payload.lines_cleared, duration_ms) {
        let mut active_session: game_sessions::ActiveModel = session.into();
        active_session.status = Set("rejected".to_owned());
        active_session.ended_at = Set(Some(now.into()));
        active_session.update(&state.db).await.map_err(|e| AppError::Internal(e.into()))?;
        return Err(AppError::BadRequest(
            "Score implausible for session duration".to_owned(),
        ));
    }

    let mut active_session: game_sessions::ActiveModel = session.into();
    active_session.status = Set("completed".to_owned());
    active_session.ended_at = Set(Some(now.into()));
    active_session.score = Set(Some(payload.score));
    active_session.lines_cleared = Set(Some(payload.lines_cleared));
    active_session.duration_ms = Set(Some(duration_ms));
    let session = active_session
        .update(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    let settings = game_leaderboard::apply_scheduled_reset_if_due(&state.db).await?;

    let score = game_scores::ActiveModel {
        session_id: Set(session.id),
        user_id: Set(auth_user.0.id),
        score: Set(payload.score),
        lines_cleared: Set(payload.lines_cleared),
        duration_ms: Set(duration_ms),
        leaderboard_epoch: Set(settings.current_epoch),
        ..Default::default()
    }
    .insert(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    Ok(HttpResponse::Ok().json(score))
}

#[get("/leaderboard")]
async fn get_leaderboard(
    query: web::Query<LeaderboardQuery>,
    state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let settings = game_leaderboard::apply_scheduled_reset_if_due(&state.db).await?;

    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(20).clamp(1, 100);

    let scores = GameScores::find()
        .filter(game_scores::Column::LeaderboardEpoch.eq(settings.current_epoch))
        .find_also_related(GameUsers)
        .order_by_desc(game_scores::Column::Score)
        .order_by_asc(game_scores::Column::CreatedAt)
        .paginate(&state.db, page_size)
        .fetch_page(page - 1)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    let offset = (page - 1) * page_size;
    let entries: Vec<LeaderboardEntry> = scores
        .into_iter()
        .enumerate()
        .map(|(index, (score, user))| {
            let u = user.unwrap();
            LeaderboardEntry {
                user_id: u.id,
                username: u.username,
                avatar_url: u.avatar_url,
                score: score.score,
                lines_cleared: score.lines_cleared,
                rank: offset + index as u64 + 1,
                achieved_at: chrono::DateTime::<Utc>::from_naive_utc_and_offset(
                    score.created_at.naive_utc(),
                    Utc,
                ),
            }
        })
        .collect();

    Ok(HttpResponse::Ok().json(serde_json::json!({ "items": entries })))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(auth)
        .service(get_profile)
        .service(start_session)
        .service(finish_session)
        .service(get_leaderboard);
}

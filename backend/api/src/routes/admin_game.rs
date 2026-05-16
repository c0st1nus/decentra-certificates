use actix_web::{HttpResponse, get, post, web};
use chrono::Utc;
use entity::{game_scores, game_sessions, game_users, prelude::*};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, EntityTrait, PaginatorTrait, QueryFilter, QueryOrder,
    QuerySelect, Set,
};
use serde::{Deserialize, Serialize};

use crate::{
    error::AppError,
    middleware::auth::AdminAuth,
    services::game_leaderboard,
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct LeaderboardQuery {
    pub page: Option<u64>,
    pub page_size: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct ScheduleResetRequest {
    pub reset_at: Option<chrono::DateTime<Utc>>,
}

#[derive(Debug, Serialize)]
pub struct AdminLeaderboardEntry {
    pub user_id: i32,
    pub username: Option<String>,
    pub avatar_url: Option<String>,
    pub score: i32,
    pub lines_cleared: i32,
    pub rank: u64,
    pub last_played_at: chrono::DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct AdminGameUserResponse {
    pub user: game_users::Model,
    pub games_played: u64,
    pub personal_best: i32,
    pub recent_scores: Vec<game_scores::Model>,
}

#[get("/leaderboard")]
async fn get_leaderboard(
    query: web::Query<LeaderboardQuery>,
    state: web::Data<AppState>,
    _auth: AdminAuth,
) -> Result<HttpResponse, AppError> {
    let settings = game_leaderboard::apply_scheduled_reset_if_due(&state.db).await?;
    let page = query.page.unwrap_or(1).max(1);
    let page_size = query.page_size.unwrap_or(50).clamp(1, 100);

    let offset = (page - 1) * page_size;
    let rows = game_leaderboard::fetch_deduplicated_leaderboard_page(
        &state.db,
        settings.current_epoch,
        offset,
        page_size,
    )
    .await?;

    let items: Vec<AdminLeaderboardEntry> = rows
        .into_iter()
        .map(|row| AdminLeaderboardEntry {
            user_id: row.user_id,
            username: row.username,
            avatar_url: row.avatar_url,
            score: row.score,
            lines_cleared: row.lines_cleared,
            rank: row.rank.max(0) as u64,
            last_played_at: row.created_at.with_timezone(&Utc),
        })
        .collect();

    Ok(HttpResponse::Ok().json(serde_json::json!({ "items": items })))
}

#[get("/users/{id}")]
async fn get_user(
    path: web::Path<i32>,
    state: web::Data<AppState>,
    _auth: AdminAuth,
) -> Result<HttpResponse, AppError> {
    let user_id = path.into_inner();
    let user = GameUsers::find_by_id(user_id)
        .one(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.into()))?
        .ok_or_else(|| AppError::NotFound("game user not found".to_owned()))?;

    let games_played = GameSessions::find()
        .filter(game_sessions::Column::UserId.eq(user_id))
        .filter(game_sessions::Column::Status.eq("completed"))
        .count(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    let personal_best = GameScores::find()
        .filter(game_scores::Column::UserId.eq(user_id))
        .order_by_desc(game_scores::Column::Score)
        .one(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.into()))?
        .map(|row| row.score)
        .unwrap_or(0);

    let recent_scores = GameScores::find()
        .filter(game_scores::Column::UserId.eq(user_id))
        .order_by_desc(game_scores::Column::CreatedAt)
        .limit(25)
        .all(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    Ok(HttpResponse::Ok().json(AdminGameUserResponse {
        user,
        games_played,
        personal_best,
        recent_scores,
    }))
}

#[post("/leaderboard/reset")]
async fn reset_leaderboard(
    state: web::Data<AppState>,
    _auth: AdminAuth,
) -> Result<HttpResponse, AppError> {
    let settings = game_leaderboard::load_leaderboard_settings(&state.db).await?;
    let updated = game_leaderboard::soft_reset_leaderboard(&state.db, settings).await?;
    Ok(HttpResponse::Ok().json(updated))
}

#[post("/leaderboard/schedule-reset")]
async fn schedule_reset(
    state: web::Data<AppState>,
    payload: web::Json<ScheduleResetRequest>,
    _auth: AdminAuth,
) -> Result<HttpResponse, AppError> {
    let settings = game_leaderboard::load_leaderboard_settings(&state.db).await?;
    let reset_at = payload
        .reset_at
        .unwrap_or_else(|| Utc::now() + chrono::Duration::hours(24));

    let mut active_settings: entity::leaderboard_settings::ActiveModel = settings.into();
    active_settings.scheduled_reset_at = Set(Some(reset_at.into()));

    let updated = active_settings
        .update(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "status": "scheduled",
        "reset_at": reset_at,
        "settings": updated,
    })))
}

pub fn configure(cfg: &mut web::ServiceConfig) {
    cfg.service(get_leaderboard)
        .service(get_user)
        .service(reset_leaderboard)
        .service(schedule_reset);
}

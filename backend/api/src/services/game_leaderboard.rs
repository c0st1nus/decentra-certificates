use chrono::Utc;
use entity::{leaderboard_settings, prelude::*};
use sea_orm::{ActiveModelTrait, DatabaseConnection, EntityTrait, Set};

use crate::error::AppError;

pub async fn load_leaderboard_settings(
    db: &DatabaseConnection,
) -> Result<leaderboard_settings::Model, AppError> {
    LeaderboardSettings::find()
        .one(db)
        .await
        .map_err(|e| AppError::Internal(e.into()))?
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("leaderboard settings missing")))
}

pub async fn apply_scheduled_reset_if_due(
    db: &DatabaseConnection,
) -> Result<leaderboard_settings::Model, AppError> {
    let settings = load_leaderboard_settings(db).await?;

    let Some(scheduled_at) = settings.scheduled_reset_at else {
        return Ok(settings);
    };

    let scheduled_at = chrono::DateTime::<Utc>::from_naive_utc_and_offset(
        scheduled_at.naive_utc(),
        Utc,
    );
    if scheduled_at > Utc::now() {
        return Ok(settings);
    }

    soft_reset_leaderboard(db, settings).await
}

pub async fn soft_reset_leaderboard(
    db: &DatabaseConnection,
    settings: leaderboard_settings::Model,
) -> Result<leaderboard_settings::Model, AppError> {
    let next_epoch = settings.current_epoch + 1;
    let mut active_settings: leaderboard_settings::ActiveModel = settings.into();
    active_settings.current_epoch = Set(next_epoch);
    active_settings.last_reset_at = Set(Some(Utc::now().into()));
    active_settings.scheduled_reset_at = Set(None);

    active_settings
        .update(db)
        .await
        .map_err(|e| AppError::Internal(e.into()))
}

pub fn validate_score_plausibility(score: i32, lines_cleared: i32, duration_ms: i32) -> bool {
    if score < 0 || lines_cleared < 0 || duration_ms < 0 {
        return false;
    }

    if score == 0 && lines_cleared == 0 {
        return duration_ms >= 0;
    }

    if duration_ms < 1_000 && score > 100 {
        return false;
    }

    if lines_cleared > 0 && duration_ms < lines_cleared.saturating_mul(150) {
        return false;
    }

    let max_lines_from_score = (score / 25).clamp(0, 600);
    if lines_cleared > max_lines_from_score + 15 {
        return false;
    }

    let max_score_for_duration = (duration_ms as i64)
        .saturating_mul(8)
        .clamp(0, i64::from(i32::MAX)) as i32;
    score <= max_score_for_duration.saturating_add(2_000)
}

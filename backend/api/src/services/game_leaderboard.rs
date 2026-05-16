use chrono::Utc;
use entity::{leaderboard_settings, prelude::*};
use sea_orm::{
    ActiveModelTrait, DatabaseBackend, DatabaseConnection, EntityTrait, FromQueryResult, Set,
    Statement,
};

use crate::error::AppError;

/// One row per user: best score in the epoch (tie-break: earliest `created_at`).
#[derive(Debug, Clone, FromQueryResult)]
pub struct LeaderboardDedupedRow {
    pub user_id: i32,
    pub username: Option<String>,
    pub avatar_url: Option<String>,
    pub score: i32,
    pub lines_cleared: i32,
    pub created_at: chrono::DateTime<chrono::FixedOffset>,
    pub rank: i64,
}

const DEDUP_BEST_CTE: &str = r#"
WITH best AS (
  SELECT DISTINCT ON (gs.user_id)
    gs.user_id,
    gs.score,
    gs.lines_cleared,
    gs.created_at,
    gu.username,
    gu.avatar_url
  FROM game_scores gs
  INNER JOIN game_users gu ON gu.id = gs.user_id
  WHERE gs.leaderboard_epoch = $1
  ORDER BY gs.user_id, gs.score DESC, gs.created_at ASC
),
ranked AS (
  SELECT
    user_id,
    username,
    avatar_url,
    score,
    lines_cleared,
    created_at,
    ROW_NUMBER() OVER (ORDER BY score DESC, created_at ASC) AS rank
  FROM best
)
"#;

/// Distinct users with at least one score in the epoch (after per-user best dedup, same as player count).
pub async fn count_leaderboard_players_in_epoch(
    db: &DatabaseConnection,
    leaderboard_epoch: i32,
) -> Result<u64, AppError> {
    const COUNT_SQL: &str = r#"
WITH best AS (
  SELECT DISTINCT ON (gs.user_id)
    gs.user_id
  FROM game_scores gs
  WHERE gs.leaderboard_epoch = $1
  ORDER BY gs.user_id, gs.score DESC, gs.created_at ASC
)
SELECT COUNT(*)::bigint AS cnt FROM best
"#;
    let sql = COUNT_SQL;
    let stmt = Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        sql,
        [leaderboard_epoch.into()],
    );
    #[derive(Debug, FromQueryResult)]
    struct CountRow {
        cnt: i64,
    }
    let row = CountRow::find_by_statement(stmt)
        .one(db)
        .await
        .map_err(|e| AppError::Internal(e.into()))?
        .ok_or_else(|| AppError::Internal(anyhow::anyhow!("leaderboard count returned no row")))?;
    Ok(row.cnt.max(0) as u64)
}

/// Paginated deduplicated leaderboard (`rank` is global among all players in the epoch).
pub async fn fetch_deduplicated_leaderboard_page(
    db: &DatabaseConnection,
    leaderboard_epoch: i32,
    offset: u64,
    limit: u64,
) -> Result<Vec<LeaderboardDedupedRow>, AppError> {
    let sql = format!(
        r#"
{DEDUP_BEST_CTE}
SELECT user_id, username, avatar_url, score, lines_cleared, created_at, rank
FROM ranked
ORDER BY rank ASC
LIMIT $2 OFFSET $3
"#
    );
    let stmt = Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        sql,
        [
            leaderboard_epoch.into(),
            sea_orm::Value::BigInt(Some(limit as i64)),
            sea_orm::Value::BigInt(Some(offset as i64)),
        ],
    );
    LeaderboardDedupedRow::find_by_statement(stmt)
        .all(db)
        .await
        .map_err(|e| AppError::Internal(e.into()))
}

/// Best deduplicated row for a single user in the epoch, if they have any score.
pub async fn fetch_deduplicated_leaderboard_row_for_user(
    db: &DatabaseConnection,
    leaderboard_epoch: i32,
    user_id: i32,
) -> Result<Option<LeaderboardDedupedRow>, AppError> {
    let sql = format!(
        r#"
{DEDUP_BEST_CTE}
SELECT user_id, username, avatar_url, score, lines_cleared, created_at, rank
FROM ranked
WHERE user_id = $2
"#
    );
    let stmt = Statement::from_sql_and_values(
        DatabaseBackend::Postgres,
        sql,
        [leaderboard_epoch.into(), user_id.into()],
    );
    LeaderboardDedupedRow::find_by_statement(stmt)
        .one(db)
        .await
        .map_err(|e| AppError::Internal(e.into()))
}

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

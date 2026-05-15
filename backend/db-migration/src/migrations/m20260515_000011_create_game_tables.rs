use sea_orm_migration::{prelude::*, schema::*};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        // game_users
        manager
            .create_table(
                Table::create()
                    .table(GameUsers::Table)
                    .if_not_exists()
                    .col(pk_auto(GameUsers::Id))
                    .col(big_integer(GameUsers::TelegramId).unique_key())
                    .col(string_null(GameUsers::Username))
                    .col(string_null(GameUsers::AvatarUrl))
                    .col(timestamp_with_time_zone(GameUsers::CreatedAt).default(Expr::current_timestamp()))
                    .to_owned(),
            )
            .await?;

        // game_sessions
        manager
            .create_table(
                Table::create()
                    .table(GameSessions::Table)
                    .if_not_exists()
                    .col(pk_auto(GameSessions::Id))
                    .col(integer(GameSessions::UserId))
                    .col(timestamp_with_time_zone(GameSessions::StartedAt).default(Expr::current_timestamp()))
                    .col(timestamp_with_time_zone_null(GameSessions::EndedAt))
                    .col(string(GameSessions::Status).default("active"))
                    .col(string(GameSessions::Nonce))
                    .col(integer_null(GameSessions::Score))
                    .col(integer_null(GameSessions::LinesCleared))
                    .col(integer_null(GameSessions::DurationMs))
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_game_sessions_user_id")
                            .from(GameSessions::Table, GameSessions::UserId)
                            .to(GameUsers::Table, GameUsers::Id)
                            .on_delete(ForeignKeyAction::Cascade)
                            .on_update(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // game_scores
        manager
            .create_table(
                Table::create()
                    .table(GameScores::Table)
                    .if_not_exists()
                    .col(pk_auto(GameScores::Id))
                    .col(integer(GameScores::SessionId).unique_key())
                    .col(integer(GameScores::UserId))
                    .col(integer(GameScores::Score))
                    .col(integer(GameScores::LinesCleared))
                    .col(integer(GameScores::DurationMs))
                    .col(timestamp_with_time_zone(GameScores::CreatedAt).default(Expr::current_timestamp()))
                    .col(integer(GameScores::LeaderboardEpoch))
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_game_scores_session_id")
                            .from(GameScores::Table, GameScores::SessionId)
                            .to(GameSessions::Table, GameSessions::Id)
                            .on_delete(ForeignKeyAction::Cascade)
                            .on_update(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_game_scores_user_id")
                            .from(GameScores::Table, GameScores::UserId)
                            .to(GameUsers::Table, GameUsers::Id)
                            .on_delete(ForeignKeyAction::Cascade)
                            .on_update(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        // leaderboard_settings
        manager
            .create_table(
                Table::create()
                    .table(LeaderboardSettings::Table)
                    .if_not_exists()
                    .col(pk_auto(LeaderboardSettings::Id))
                    .col(integer(LeaderboardSettings::CurrentEpoch).default(1))
                    .col(timestamp_with_time_zone_null(LeaderboardSettings::ScheduledResetAt))
                    .col(timestamp_with_time_zone_null(LeaderboardSettings::LastResetAt))
                    .to_owned(),
            )
            .await?;

        // Insert default leaderboard settings
        let insert = Query::insert()
            .into_table(LeaderboardSettings::Table)
            .columns([LeaderboardSettings::CurrentEpoch])
            .values_panic([1.into()])
            .to_owned();

        manager.exec_stmt(insert).await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(LeaderboardSettings::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(GameScores::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(GameSessions::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(GameUsers::Table).to_owned())
            .await?;

        Ok(())
    }
}

#[derive(DeriveIden)]
enum GameUsers {
    Table,
    Id,
    TelegramId,
    Username,
    AvatarUrl,
    CreatedAt,
}

#[derive(DeriveIden)]
enum GameSessions {
    Table,
    Id,
    UserId,
    StartedAt,
    EndedAt,
    Status,
    Nonce,
    Score,
    LinesCleared,
    DurationMs,
}

#[derive(DeriveIden)]
enum GameScores {
    Table,
    Id,
    SessionId,
    UserId,
    Score,
    LinesCleared,
    DurationMs,
    CreatedAt,
    LeaderboardEpoch,
}

#[derive(DeriveIden)]
enum LeaderboardSettings {
    Table,
    Id,
    CurrentEpoch,
    ScheduledResetAt,
    LastResetAt,
}

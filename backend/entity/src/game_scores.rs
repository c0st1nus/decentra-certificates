use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize, Deserialize)]
#[sea_orm(table_name = "game_scores")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    #[sea_orm(unique)]
    pub session_id: i32,
    pub user_id: i32,
    pub score: i32,
    pub lines_cleared: i32,
    pub duration_ms: i32,
    pub created_at: DateTimeWithTimeZone,
    pub leaderboard_epoch: i32,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::game_sessions::Entity",
        from = "Column::SessionId",
        to = "super::game_sessions::Column::Id",
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    GameSessions,
    #[sea_orm(
        belongs_to = "super::game_users::Entity",
        from = "Column::UserId",
        to = "super::game_users::Column::Id",
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    GameUsers,
}

impl Related<super::game_sessions::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::GameSessions.def()
    }
}

impl Related<super::game_users::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::GameUsers.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}

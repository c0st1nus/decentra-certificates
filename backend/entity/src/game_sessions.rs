use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize, Deserialize)]
#[sea_orm(table_name = "game_sessions")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    pub user_id: i32,
    pub started_at: DateTimeWithTimeZone,
    pub ended_at: Option<DateTimeWithTimeZone>,
    pub status: String,
    pub nonce: String,
    pub score: Option<i32>,
    pub lines_cleared: Option<i32>,
    pub duration_ms: Option<i32>,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::game_users::Entity",
        from = "Column::UserId",
        to = "super::game_users::Column::Id",
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    GameUsers,
    #[sea_orm(has_one = "super::game_scores::Entity")]
    GameScores,
}

impl Related<super::game_users::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::GameUsers.def()
    }
}

impl Related<super::game_scores::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::GameScores.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}

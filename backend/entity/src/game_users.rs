use sea_orm::entity::prelude::*;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, PartialEq, DeriveEntityModel, Eq, Serialize, Deserialize)]
#[sea_orm(table_name = "game_users")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: i32,
    #[sea_orm(unique)]
    pub telegram_id: i64,
    pub username: Option<String>,
    pub avatar_url: Option<String>,
    pub created_at: DateTimeWithTimeZone,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::game_sessions::Entity")]
    GameSessions,
    #[sea_orm(has_many = "super::game_scores::Entity")]
    GameScores,
}

impl Related<super::game_sessions::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::GameSessions.def()
    }
}

impl Related<super::game_scores::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::GameScores.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}

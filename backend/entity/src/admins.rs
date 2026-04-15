use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "admins")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: Uuid,
    #[sea_orm(unique)]
    pub login: String,
    pub password_hash: String,
    pub role: String,
    pub is_active: bool,
    pub last_login_at: Option<DateTimeUtc>,
    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::refresh_sessions::Entity")]
    RefreshSessions,
}

impl Related<super::refresh_sessions::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::RefreshSessions.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}

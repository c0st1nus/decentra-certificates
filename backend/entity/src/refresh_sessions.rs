use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "refresh_sessions")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: Uuid,
    pub admin_id: Uuid,
    #[sea_orm(unique)]
    pub token_hash: String,
    pub expires_at: DateTimeUtc,
    pub revoked_at: Option<DateTimeUtc>,
    pub created_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::admins::Entity",
        from = "Column::AdminId",
        to = "super::admins::Column::Id",
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    Admin,
}

impl Related<super::admins::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Admin.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}

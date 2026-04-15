use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "participants")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: Uuid,
    pub event_code: String,
    pub email: String,
    pub email_normalized: String,
    pub full_name: String,
    pub category: Option<String>,
    pub metadata: Json,
    pub imported_at: DateTimeUtc,
    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_many = "super::certificate_issues::Entity")]
    CertificateIssues,
}

impl Related<super::certificate_issues::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::CertificateIssues.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}

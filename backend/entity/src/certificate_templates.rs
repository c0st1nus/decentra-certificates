use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "certificate_templates")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: Uuid,
    pub name: String,
    pub source_kind: String,
    pub source_path: String,
    pub preview_path: Option<String>,
    pub is_active: bool,
    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(has_one = "super::template_layouts::Entity")]
    TemplateLayout,
    #[sea_orm(has_many = "super::certificate_issues::Entity")]
    CertificateIssues,
}

impl Related<super::template_layouts::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::TemplateLayout.def()
    }
}

impl Related<super::certificate_issues::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::CertificateIssues.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}

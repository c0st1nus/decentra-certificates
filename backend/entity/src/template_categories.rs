use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "template_categories")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: Uuid,
    pub template_id: Uuid,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub is_active: bool,
    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::certificate_templates::Entity",
        from = "Column::TemplateId",
        to = "super::certificate_templates::Column::Id",
        on_update = "Cascade",
        on_delete = "Cascade"
    )]
    Template,
}

impl Related<super::certificate_templates::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Template.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}

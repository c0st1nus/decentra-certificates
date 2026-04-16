use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "template_layouts")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: Uuid,
    pub template_id: Uuid,
    pub page_width: i32,
    pub page_height: i32,
    pub name_x: i32,
    pub name_y: i32,
    pub name_max_width: i32,
    pub name_box_height: i32,
    pub font_family: String,
    pub font_size: i32,
    pub font_color_hex: String,
    pub text_align: String,
    pub vertical_align: String,
    pub auto_shrink: bool,
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

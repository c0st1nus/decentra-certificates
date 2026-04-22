use sea_orm::entity::prelude::*;

#[derive(Clone, Debug, PartialEq, DeriveEntityModel)]
#[sea_orm(table_name = "certificate_issues")]
pub struct Model {
    #[sea_orm(primary_key)]
    pub id: Uuid,
    #[sea_orm(unique)]
    pub certificate_id: String,
    #[sea_orm(unique)]
    pub verification_code: String,
    pub participant_id: Uuid,
    pub template_id: Uuid,
    pub generated_pdf_path: String,
    pub download_count: i32,
    pub last_downloaded_at: Option<DateTimeUtc>,
    pub status: String,
    pub attempts: i32,
    pub error_message: Option<String>,
    pub queued_at: Option<DateTimeUtc>,
    pub processing_at: Option<DateTimeUtc>,
    pub completed_at: Option<DateTimeUtc>,
    pub failed_at: Option<DateTimeUtc>,
    pub template_updated_at: Option<DateTimeUtc>,
    pub created_at: DateTimeUtc,
    pub updated_at: DateTimeUtc,
}

#[derive(Copy, Clone, Debug, EnumIter, DeriveRelation)]
pub enum Relation {
    #[sea_orm(
        belongs_to = "super::participants::Entity",
        from = "Column::ParticipantId",
        to = "super::participants::Column::Id",
        on_update = "Cascade",
        on_delete = "Restrict"
    )]
    Participant,
    #[sea_orm(
        belongs_to = "super::certificate_templates::Entity",
        from = "Column::TemplateId",
        to = "super::certificate_templates::Column::Id",
        on_update = "Cascade",
        on_delete = "Restrict"
    )]
    Template,
}

impl Related<super::participants::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Participant.def()
    }
}

impl Related<super::certificate_templates::Entity> for Entity {
    fn to() -> RelationDef {
        Relation::Template.def()
    }
}

impl ActiveModelBehavior for ActiveModel {}

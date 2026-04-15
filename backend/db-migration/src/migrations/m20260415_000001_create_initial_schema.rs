use sea_orm_migration::prelude::*;
use sea_orm_migration::schema::{
    boolean, integer, json_binary, string, string_null, timestamp, timestamp_null, uuid,
};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(Admins::Table)
                    .if_not_exists()
                    .col(uuid_pk(Admins::Id))
                    .col(string(Admins::Login).unique_key())
                    .col(string(Admins::PasswordHash))
                    .col(string(Admins::Role))
                    .col(boolean(Admins::IsActive).default(true))
                    .col(timestamp_null(Admins::LastLoginAt))
                    .col(timestamp(Admins::CreatedAt).default(Expr::current_timestamp()))
                    .col(timestamp(Admins::UpdatedAt).default(Expr::current_timestamp()))
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(RefreshSessions::Table)
                    .if_not_exists()
                    .col(uuid_pk(RefreshSessions::Id))
                    .col(uuid(RefreshSessions::AdminId))
                    .col(string(RefreshSessions::TokenHash).unique_key())
                    .col(timestamp(RefreshSessions::ExpiresAt))
                    .col(timestamp_null(RefreshSessions::RevokedAt))
                    .col(timestamp(RefreshSessions::CreatedAt).default(Expr::current_timestamp()))
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_refresh_sessions_admin_id")
                            .from(RefreshSessions::Table, RefreshSessions::AdminId)
                            .to(Admins::Table, Admins::Id)
                            .on_delete(ForeignKeyAction::Cascade)
                            .on_update(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(CertificateTemplates::Table)
                    .if_not_exists()
                    .col(uuid_pk(CertificateTemplates::Id))
                    .col(string(CertificateTemplates::Name))
                    .col(string(CertificateTemplates::SourceKind))
                    .col(string(CertificateTemplates::SourcePath))
                    .col(string_null(CertificateTemplates::PreviewPath))
                    .col(boolean(CertificateTemplates::IsActive).default(false))
                    .col(
                        timestamp(CertificateTemplates::CreatedAt)
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        timestamp(CertificateTemplates::UpdatedAt)
                            .default(Expr::current_timestamp()),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(TemplateLayouts::Table)
                    .if_not_exists()
                    .col(uuid_pk(TemplateLayouts::Id))
                    .col(uuid(TemplateLayouts::TemplateId).unique_key())
                    .col(integer(TemplateLayouts::PageWidth))
                    .col(integer(TemplateLayouts::PageHeight))
                    .col(integer(TemplateLayouts::NameX))
                    .col(integer(TemplateLayouts::NameY))
                    .col(integer(TemplateLayouts::NameMaxWidth))
                    .col(string(TemplateLayouts::FontFamily))
                    .col(integer(TemplateLayouts::FontSize))
                    .col(string(TemplateLayouts::FontColorHex))
                    .col(string(TemplateLayouts::TextAlign))
                    .col(boolean(TemplateLayouts::AutoShrink).default(true))
                    .col(timestamp(TemplateLayouts::CreatedAt).default(Expr::current_timestamp()))
                    .col(timestamp(TemplateLayouts::UpdatedAt).default(Expr::current_timestamp()))
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_template_layouts_template_id")
                            .from(TemplateLayouts::Table, TemplateLayouts::TemplateId)
                            .to(CertificateTemplates::Table, CertificateTemplates::Id)
                            .on_delete(ForeignKeyAction::Cascade)
                            .on_update(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(Participants::Table)
                    .if_not_exists()
                    .col(uuid_pk(Participants::Id))
                    .col(string(Participants::EventCode))
                    .col(string(Participants::Email))
                    .col(string(Participants::EmailNormalized))
                    .col(string(Participants::FullName))
                    .col(string_null(Participants::Category))
                    .col(json_binary(Participants::Metadata).default(Expr::value("{}")))
                    .col(timestamp(Participants::ImportedAt).default(Expr::current_timestamp()))
                    .col(timestamp(Participants::CreatedAt).default(Expr::current_timestamp()))
                    .col(timestamp(Participants::UpdatedAt).default(Expr::current_timestamp()))
                    .to_owned(),
            )
            .await?;
        manager
            .create_index(
                Index::create()
                    .name("idx_participants_email_normalized")
                    .table(Participants::Table)
                    .col(Participants::EmailNormalized)
                    .to_owned(),
            )
            .await?;
        manager
            .create_index(
                Index::create()
                    .name("uq_participants_event_email")
                    .table(Participants::Table)
                    .col(Participants::EventCode)
                    .col(Participants::EmailNormalized)
                    .unique()
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(CertificateIssues::Table)
                    .if_not_exists()
                    .col(uuid_pk(CertificateIssues::Id))
                    .col(string(CertificateIssues::CertificateId).unique_key())
                    .col(string(CertificateIssues::VerificationCode).unique_key())
                    .col(uuid(CertificateIssues::ParticipantId))
                    .col(uuid(CertificateIssues::TemplateId))
                    .col(string(CertificateIssues::GeneratedPdfPath))
                    .col(integer(CertificateIssues::DownloadCount).default(0))
                    .col(timestamp_null(CertificateIssues::LastDownloadedAt))
                    .col(timestamp(CertificateIssues::CreatedAt).default(Expr::current_timestamp()))
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_certificate_issues_participant_id")
                            .from(CertificateIssues::Table, CertificateIssues::ParticipantId)
                            .to(Participants::Table, Participants::Id)
                            .on_delete(ForeignKeyAction::Restrict)
                            .on_update(ForeignKeyAction::Cascade),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_certificate_issues_template_id")
                            .from(CertificateIssues::Table, CertificateIssues::TemplateId)
                            .to(CertificateTemplates::Table, CertificateTemplates::Id)
                            .on_delete(ForeignKeyAction::Restrict)
                            .on_update(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(AppSettings::Table)
                    .if_not_exists()
                    .col(string(AppSettings::Key).primary_key())
                    .col(json_binary(AppSettings::Value).default(Expr::value("{}")))
                    .col(timestamp(AppSettings::UpdatedAt).default(Expr::current_timestamp()))
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_table(Table::drop().table(AppSettings::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(CertificateIssues::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Participants::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(TemplateLayouts::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(CertificateTemplates::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(RefreshSessions::Table).to_owned())
            .await?;
        manager
            .drop_table(Table::drop().table(Admins::Table).to_owned())
            .await?;
        Ok(())
    }
}

#[derive(DeriveIden)]
enum Admins {
    Table,
    Id,
    Login,
    PasswordHash,
    Role,
    IsActive,
    LastLoginAt,
    CreatedAt,
    UpdatedAt,
}

#[derive(DeriveIden)]
enum RefreshSessions {
    Table,
    Id,
    AdminId,
    TokenHash,
    ExpiresAt,
    RevokedAt,
    CreatedAt,
}

#[derive(DeriveIden)]
enum CertificateTemplates {
    Table,
    Id,
    Name,
    SourceKind,
    SourcePath,
    PreviewPath,
    IsActive,
    CreatedAt,
    UpdatedAt,
}

#[derive(DeriveIden)]
enum TemplateLayouts {
    Table,
    Id,
    TemplateId,
    PageWidth,
    PageHeight,
    NameX,
    NameY,
    NameMaxWidth,
    FontFamily,
    FontSize,
    FontColorHex,
    TextAlign,
    AutoShrink,
    CreatedAt,
    UpdatedAt,
}

#[derive(DeriveIden)]
enum Participants {
    Table,
    Id,
    EventCode,
    Email,
    EmailNormalized,
    FullName,
    Category,
    Metadata,
    ImportedAt,
    CreatedAt,
    UpdatedAt,
}

#[derive(DeriveIden)]
enum CertificateIssues {
    Table,
    Id,
    CertificateId,
    VerificationCode,
    ParticipantId,
    TemplateId,
    GeneratedPdfPath,
    DownloadCount,
    LastDownloadedAt,
    CreatedAt,
}

#[derive(DeriveIden)]
enum AppSettings {
    Table,
    Key,
    Value,
    UpdatedAt,
}

fn uuid_pk(column: impl IntoIden) -> ColumnDef {
    uuid(column).primary_key().to_owned()
}

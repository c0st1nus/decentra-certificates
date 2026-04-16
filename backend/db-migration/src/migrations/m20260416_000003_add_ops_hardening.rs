use sea_orm_migration::prelude::*;
use sea_orm_migration::schema::{json_binary, string, string_null, timestamp_with_time_zone, uuid};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_table(
                Table::create()
                    .table(AdminAuditLogs::Table)
                    .if_not_exists()
                    .col(uuid_pk(AdminAuditLogs::Id))
                    .col(uuid(AdminAuditLogs::AdminId))
                    .col(string(AdminAuditLogs::Action))
                    .col(string(AdminAuditLogs::ResourceType))
                    .col(string_null(AdminAuditLogs::ResourceId))
                    .col(json_binary(AdminAuditLogs::Metadata).default(Expr::value("{}")))
                    .col(
                        timestamp_with_time_zone(AdminAuditLogs::CreatedAt)
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_admin_audit_logs_admin_id")
                            .from(AdminAuditLogs::Table, AdminAuditLogs::AdminId)
                            .to(Admins::Table, Admins::Id)
                            .on_delete(ForeignKeyAction::Cascade)
                            .on_update(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_admin_audit_logs_admin_created_at")
                    .table(AdminAuditLogs::Table)
                    .col(AdminAuditLogs::AdminId)
                    .col(AdminAuditLogs::CreatedAt)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("uq_certificate_issues_participant_template")
                    .table(CertificateIssues::Table)
                    .col(CertificateIssues::ParticipantId)
                    .col(CertificateIssues::TemplateId)
                    .unique()
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_index(
                Index::drop()
                    .name("uq_certificate_issues_participant_template")
                    .table(CertificateIssues::Table)
                    .to_owned(),
            )
            .await?;
        manager
            .drop_index(
                Index::drop()
                    .name("idx_admin_audit_logs_admin_created_at")
                    .table(AdminAuditLogs::Table)
                    .to_owned(),
            )
            .await?;
        manager
            .drop_table(Table::drop().table(AdminAuditLogs::Table).to_owned())
            .await?;
        Ok(())
    }
}

#[derive(DeriveIden)]
enum AdminAuditLogs {
    Table,
    Id,
    AdminId,
    Action,
    ResourceType,
    ResourceId,
    Metadata,
    CreatedAt,
}

#[derive(DeriveIden)]
enum Admins {
    Table,
    Id,
}

#[derive(DeriveIden)]
enum CertificateIssues {
    Table,
    ParticipantId,
    TemplateId,
}

fn uuid_pk(column: impl IntoIden) -> ColumnDef {
    uuid(column).primary_key().to_owned()
}

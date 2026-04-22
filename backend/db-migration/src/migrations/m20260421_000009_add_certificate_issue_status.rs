use sea_orm_migration::prelude::*;
use sea_orm_migration::schema::{
    integer, string, text_null, timestamp_with_time_zone, timestamp_with_time_zone_null,
};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(CertificateIssues::Table)
                    .add_column_if_not_exists(
                        string(CertificateIssues::Status)
                            .default("not_created")
                            .not_null(),
                    )
                    .add_column_if_not_exists(
                        integer(CertificateIssues::Attempts).default(0).not_null(),
                    )
                    .add_column_if_not_exists(text_null(CertificateIssues::ErrorMessage))
                    .add_column_if_not_exists(timestamp_with_time_zone_null(
                        CertificateIssues::QueuedAt,
                    ))
                    .add_column_if_not_exists(timestamp_with_time_zone_null(
                        CertificateIssues::ProcessingAt,
                    ))
                    .add_column_if_not_exists(timestamp_with_time_zone_null(
                        CertificateIssues::CompletedAt,
                    ))
                    .add_column_if_not_exists(timestamp_with_time_zone_null(
                        CertificateIssues::FailedAt,
                    ))
                    .add_column_if_not_exists(
                        timestamp_with_time_zone(CertificateIssues::UpdatedAt)
                            .default(Expr::current_timestamp()),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_certificate_issues_status_template_id")
                    .table(CertificateIssues::Table)
                    .col(CertificateIssues::Status)
                    .col(CertificateIssues::TemplateId)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_index(
                Index::drop()
                    .name("idx_certificate_issues_status_template_id")
                    .table(CertificateIssues::Table)
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(CertificateIssues::Table)
                    .drop_column(CertificateIssues::Status)
                    .drop_column(CertificateIssues::Attempts)
                    .drop_column(CertificateIssues::ErrorMessage)
                    .drop_column(CertificateIssues::QueuedAt)
                    .drop_column(CertificateIssues::ProcessingAt)
                    .drop_column(CertificateIssues::CompletedAt)
                    .drop_column(CertificateIssues::FailedAt)
                    .drop_column(CertificateIssues::UpdatedAt)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}

#[derive(DeriveIden)]
enum CertificateIssues {
    Table,
    Status,
    Attempts,
    ErrorMessage,
    QueuedAt,
    ProcessingAt,
    CompletedAt,
    FailedAt,
    UpdatedAt,
    TemplateId,
}

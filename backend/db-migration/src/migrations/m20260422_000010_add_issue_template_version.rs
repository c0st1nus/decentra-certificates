use sea_orm_migration::prelude::*;
use sea_orm_migration::schema::timestamp_with_time_zone_null;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .alter_table(
                Table::alter()
                    .table(CertificateIssues::Table)
                    .add_column_if_not_exists(timestamp_with_time_zone_null(
                        CertificateIssues::TemplateUpdatedAt,
                    ))
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_certificate_issues_template_version")
                    .table(CertificateIssues::Table)
                    .col(CertificateIssues::TemplateId)
                    .col(CertificateIssues::Status)
                    .col(CertificateIssues::TemplateUpdatedAt)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .drop_index(
                Index::drop()
                    .name("idx_certificate_issues_template_version")
                    .table(CertificateIssues::Table)
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(CertificateIssues::Table)
                    .drop_column(CertificateIssues::TemplateUpdatedAt)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}

#[derive(DeriveIden)]
enum CertificateIssues {
    Table,
    TemplateUpdatedAt,
    TemplateId,
    Status,
}

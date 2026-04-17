use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .create_index(
                Index::create()
                    .name("idx_participants_event_code")
                    .table(Participants::Table)
                    .col(Participants::EventCode)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_certificate_issues_template_id")
                    .table(CertificateIssues::Table)
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
                    .name("idx_certificate_issues_template_id")
                    .table(CertificateIssues::Table)
                    .to_owned(),
            )
            .await?;
        manager
            .drop_index(
                Index::drop()
                    .name("idx_participants_event_code")
                    .table(Participants::Table)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}

#[derive(DeriveIden)]
enum Participants {
    Table,
    EventCode,
}

#[derive(DeriveIden)]
enum CertificateIssues {
    Table,
    TemplateId,
}

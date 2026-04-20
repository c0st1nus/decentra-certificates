use sea_orm_migration::prelude::*;
use sea_orm_migration::schema::{boolean, string, string_null, timestamp_with_time_zone, uuid};

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(
                r#"
                DROP TABLE IF EXISTS categories CASCADE;
                ALTER TABLE certificate_templates DROP COLUMN IF EXISTS category_id;
                "#,
            )
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(TemplateCategories::Table)
                    .if_not_exists()
                    .col(uuid(TemplateCategories::Id).primary_key())
                    .col(uuid(TemplateCategories::TemplateId))
                    .col(string(TemplateCategories::Name))
                    .col(string(TemplateCategories::Slug))
                    .col(string_null(TemplateCategories::Description))
                    .col(boolean(TemplateCategories::IsActive).default(true))
                    .col(
                        timestamp_with_time_zone(TemplateCategories::CreatedAt)
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        timestamp_with_time_zone(TemplateCategories::UpdatedAt)
                            .default(Expr::current_timestamp()),
                    )
                    .foreign_key(
                        ForeignKey::create()
                            .name("fk_template_categories_template_id")
                            .from(TemplateCategories::Table, TemplateCategories::TemplateId)
                            .to(CertificateTemplates::Table, CertificateTemplates::Id)
                            .on_delete(ForeignKeyAction::Cascade)
                            .on_update(ForeignKeyAction::Cascade),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_template_categories_template_id")
                    .table(TemplateCategories::Table)
                    .col(TemplateCategories::TemplateId)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("uq_template_categories_template_slug")
                    .table(TemplateCategories::Table)
                    .col(TemplateCategories::TemplateId)
                    .col(TemplateCategories::Slug)
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
                    .name("uq_template_categories_template_slug")
                    .table(TemplateCategories::Table)
                    .to_owned(),
            )
            .await?;

        manager
            .drop_index(
                Index::drop()
                    .name("idx_template_categories_template_id")
                    .table(TemplateCategories::Table)
                    .to_owned(),
            )
            .await?;

        manager
            .drop_table(Table::drop().table(TemplateCategories::Table).to_owned())
            .await?;

        manager
            .create_table(
                Table::create()
                    .table(Categories::Table)
                    .if_not_exists()
                    .col(uuid(Categories::Id).primary_key())
                    .col(string(Categories::Name))
                    .col(string(Categories::Slug).unique_key())
                    .col(string_null(Categories::Description))
                    .col(boolean(Categories::IsActive).default(true))
                    .col(
                        timestamp_with_time_zone(Categories::CreatedAt)
                            .default(Expr::current_timestamp()),
                    )
                    .col(
                        timestamp_with_time_zone(Categories::UpdatedAt)
                            .default(Expr::current_timestamp()),
                    )
                    .to_owned(),
            )
            .await?;

        manager
            .alter_table(
                Table::alter()
                    .table(CertificateTemplates::Table)
                    .add_column_if_not_exists(uuid_null(CertificateTemplates::CategoryId))
                    .to_owned(),
            )
            .await?;

        manager
            .create_foreign_key(
                ForeignKey::create()
                    .name("fk_certificate_templates_category_id")
                    .from(CertificateTemplates::Table, CertificateTemplates::CategoryId)
                    .to(Categories::Table, Categories::Id)
                    .on_delete(ForeignKeyAction::SetNull)
                    .on_update(ForeignKeyAction::Cascade)
                    .to_owned(),
            )
            .await?;

        manager
            .create_index(
                Index::create()
                    .name("idx_certificate_templates_category_id")
                    .table(CertificateTemplates::Table)
                    .col(CertificateTemplates::CategoryId)
                    .to_owned(),
            )
            .await?;

        Ok(())
    }
}

#[derive(DeriveIden)]
enum TemplateCategories {
    Table,
    Id,
    TemplateId,
    Name,
    Slug,
    Description,
    IsActive,
    CreatedAt,
    UpdatedAt,
}

#[derive(DeriveIden)]
enum Categories {
    Table,
    Id,
    Name,
    Slug,
    Description,
    IsActive,
    CreatedAt,
    UpdatedAt,
}

#[derive(DeriveIden)]
enum CertificateTemplates {
    Table,
    Id,
    CategoryId,
}

fn uuid_null(column: impl IntoIden) -> ColumnDef {
    uuid(column).null().to_owned()
}

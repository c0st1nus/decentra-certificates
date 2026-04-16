use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(
                r#"
                ALTER TABLE template_layouts
                    ADD COLUMN IF NOT EXISTS name_box_height integer NOT NULL DEFAULT 81,
                    ADD COLUMN IF NOT EXISTS vertical_align varchar NOT NULL DEFAULT 'center';

                UPDATE template_layouts
                SET name_box_height = GREATEST(56, ROUND(font_size * 1.5)),
                    vertical_align = 'center'
                WHERE name_box_height IS NULL OR vertical_align IS NULL;
                "#,
            )
            .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        manager
            .get_connection()
            .execute_unprepared(
                r#"
                ALTER TABLE template_layouts
                    DROP COLUMN IF EXISTS vertical_align,
                    DROP COLUMN IF EXISTS name_box_height;
                "#,
            )
            .await?;

        Ok(())
    }
}

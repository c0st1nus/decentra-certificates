use sea_orm_migration::prelude::*;

#[derive(DeriveMigrationName)]
pub struct Migration;

#[async_trait::async_trait]
impl MigrationTrait for Migration {
    async fn up(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();

        db.execute_unprepared(
            r#"
            ALTER TABLE admins
                ALTER COLUMN last_login_at TYPE timestamptz USING last_login_at AT TIME ZONE 'UTC',
                ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC',
                ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
            "#,
        )
        .await?;

        db.execute_unprepared(
            r#"
            ALTER TABLE refresh_sessions
                ALTER COLUMN expires_at TYPE timestamptz USING expires_at AT TIME ZONE 'UTC',
                ALTER COLUMN revoked_at TYPE timestamptz USING revoked_at AT TIME ZONE 'UTC',
                ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
            "#,
        )
        .await?;

        db.execute_unprepared(
            r#"
            ALTER TABLE certificate_templates
                ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC',
                ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
            "#,
        )
        .await?;

        db.execute_unprepared(
            r#"
            ALTER TABLE template_layouts
                ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC',
                ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
            "#,
        )
        .await?;

        db.execute_unprepared(
            r#"
            ALTER TABLE participants
                ALTER COLUMN imported_at TYPE timestamptz USING imported_at AT TIME ZONE 'UTC',
                ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC',
                ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
            "#,
        )
        .await?;

        db.execute_unprepared(
            r#"
            ALTER TABLE certificate_issues
                ALTER COLUMN last_downloaded_at TYPE timestamptz USING last_downloaded_at AT TIME ZONE 'UTC',
                ALTER COLUMN created_at TYPE timestamptz USING created_at AT TIME ZONE 'UTC';
            "#,
        )
        .await?;

        db.execute_unprepared(
            r#"
            ALTER TABLE app_settings
                ALTER COLUMN updated_at TYPE timestamptz USING updated_at AT TIME ZONE 'UTC';
            "#,
        )
        .await?;

        Ok(())
    }

    async fn down(&self, manager: &SchemaManager) -> Result<(), DbErr> {
        let db = manager.get_connection();

        db.execute_unprepared(
            r#"
            ALTER TABLE admins
                ALTER COLUMN last_login_at TYPE timestamp USING last_login_at AT TIME ZONE 'UTC',
                ALTER COLUMN created_at TYPE timestamp USING created_at AT TIME ZONE 'UTC',
                ALTER COLUMN updated_at TYPE timestamp USING updated_at AT TIME ZONE 'UTC';
            "#,
        )
        .await?;

        db.execute_unprepared(
            r#"
            ALTER TABLE refresh_sessions
                ALTER COLUMN expires_at TYPE timestamp USING expires_at AT TIME ZONE 'UTC',
                ALTER COLUMN revoked_at TYPE timestamp USING revoked_at AT TIME ZONE 'UTC',
                ALTER COLUMN created_at TYPE timestamp USING created_at AT TIME ZONE 'UTC';
            "#,
        )
        .await?;

        db.execute_unprepared(
            r#"
            ALTER TABLE certificate_templates
                ALTER COLUMN created_at TYPE timestamp USING created_at AT TIME ZONE 'UTC',
                ALTER COLUMN updated_at TYPE timestamp USING updated_at AT TIME ZONE 'UTC';
            "#,
        )
        .await?;

        db.execute_unprepared(
            r#"
            ALTER TABLE template_layouts
                ALTER COLUMN created_at TYPE timestamp USING created_at AT TIME ZONE 'UTC',
                ALTER COLUMN updated_at TYPE timestamp USING updated_at AT TIME ZONE 'UTC';
            "#,
        )
        .await?;

        db.execute_unprepared(
            r#"
            ALTER TABLE participants
                ALTER COLUMN imported_at TYPE timestamp USING imported_at AT TIME ZONE 'UTC',
                ALTER COLUMN created_at TYPE timestamp USING created_at AT TIME ZONE 'UTC',
                ALTER COLUMN updated_at TYPE timestamp USING updated_at AT TIME ZONE 'UTC';
            "#,
        )
        .await?;

        db.execute_unprepared(
            r#"
            ALTER TABLE certificate_issues
                ALTER COLUMN last_downloaded_at TYPE timestamp USING last_downloaded_at AT TIME ZONE 'UTC',
                ALTER COLUMN created_at TYPE timestamp USING created_at AT TIME ZONE 'UTC';
            "#,
        )
        .await?;

        db.execute_unprepared(
            r#"
            ALTER TABLE app_settings
                ALTER COLUMN updated_at TYPE timestamp USING updated_at AT TIME ZONE 'UTC';
            "#,
        )
        .await?;

        Ok(())
    }
}

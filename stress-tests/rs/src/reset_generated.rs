use anyhow::{Context, Result};
use chrono::Utc;
use decentra_certificates_api::state::AppState;
use entity::{certificate_issues, certificate_templates, prelude::*};
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};

const STRESS_TEMPLATE_NAME: &str = "stress-test-template";

pub async fn run(state: &AppState) -> Result<()> {
    let Some(template) = CertificateTemplates::find()
        .filter(certificate_templates::Column::Name.eq(STRESS_TEMPLATE_NAME))
        .filter(certificate_templates::Column::IsActive.eq(true))
        .one(&state.db)
        .await
        .context("failed to load active stress-test template")?
    else {
        println!("No active {STRESS_TEMPLATE_NAME} found; nothing to reset.");
        return Ok(());
    };

    let issues = CertificateIssues::find()
        .filter(certificate_issues::Column::TemplateId.eq(template.id))
        .all(&state.db)
        .await
        .context("failed to load certificate issues for active stress-test template")?;

    let mut files_deleted = 0usize;
    let mut rows_reset = 0usize;
    for issue in issues {
        if state
            .storage
            .delete_object(&issue.generated_pdf_path)
            .await
            .is_ok()
        {
            files_deleted += 1;
        }

        let now = Utc::now();
        let mut active: certificate_issues::ActiveModel = issue.into();
        active.status = Set("not_created".to_owned());
        active.attempts = Set(0);
        active.error_message = Set(None);
        active.queued_at = Set(None);
        active.processing_at = Set(None);
        active.completed_at = Set(None);
        active.failed_at = Set(None);
        active.updated_at = Set(now);
        active
            .update(&state.db)
            .await
            .context("failed to reset certificate issue status")?;
        rows_reset += 1;
    }

    state.redis.remove_key("certificates:queue").await?;

    println!("Template: {} ({})", template.name, template.id);
    println!("Deleted generated objects: {files_deleted}");
    println!("Reset issue rows: {rows_reset}");
    println!("Cleared Redis queue: certificates:queue");

    Ok(())
}

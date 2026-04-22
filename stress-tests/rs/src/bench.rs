use std::collections::HashMap;

use anyhow::{Context, Result};
use chrono::Utc;
use decentra_certificates_api::services::templates::{TemplateLayoutData, save_layout};
use decentra_certificates_api::state::AppState;
use entity::{certificate_templates, participants, prelude::*};
use sea_orm::{ActiveModelTrait, ColumnTrait, EntityTrait, QueryFilter, Set};
use uuid::Uuid;

pub async fn ensure_test_template(state: &AppState) -> Result<certificate_templates::Model> {
    let existing = CertificateTemplates::find()
        .filter(certificate_templates::Column::Name.eq("stress-test-template"))
        .one(&state.db)
        .await
        .context("failed to query template")?;

    if let Some(template) = existing {
        return Ok(template);
    }

    let template_id = Uuid::new_v4();
    let source_key = state
        .storage
        .template_file_key(&template_id.to_string(), "template.png");
    let bytes = tokio::fs::read("stress-tests/fixtures/template.png")
        .await
        .context("failed to read template.png fixture")?;

    state
        .storage
        .put_object(&source_key, bytes, Some("image/png"))
        .await
        .context("failed to upload template")?;

    let now = Utc::now();
    let template = certificate_templates::ActiveModel {
        id: Set(template_id),
        name: Set("stress-test-template".to_owned()),
        source_kind: Set("png".to_owned()),
        source_path: Set(source_key),
        preview_path: Set(None),
        is_active: Set(true),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await
    .context("failed to insert template")?;

    save_layout(
        &state.db,
        template_id,
        TemplateLayoutData::default_for_template(),
    )
    .await
    .context("failed to save layout")?;

    Ok(template)
}

pub async fn ensure_test_participant(
    state: &AppState,
    template_id: Uuid,
    suffix: &str,
) -> Result<participants::Model> {
    let email = format!("stress-{suffix}@example.com");
    let existing = Participants::find()
        .filter(participants::Column::EmailNormalized.eq(email.to_lowercase()))
        .one(&state.db)
        .await
        .context("failed to query participant")?;

    if let Some(p) = existing {
        return Ok(p);
    }

    let now = Utc::now();
    let model = participants::ActiveModel {
        id: Set(Uuid::new_v4()),
        event_code: Set(template_id.to_string()),
        email: Set(email.clone()),
        email_normalized: Set(email.to_lowercase()),
        full_name: Set(format!("Stress Participant {suffix}")),
        category: Set(Some("General".to_owned())),
        metadata: Set(serde_json::Value::Object(serde_json::Map::new())),
        imported_at: Set(now),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(&state.db)
    .await
    .context("failed to insert participant")?;

    Ok(model)
}

pub fn build_test_bindings(full_name: &str) -> HashMap<String, String> {
    HashMap::from([
        ("participant.full_name".to_owned(), full_name.to_owned()),
        ("full_name".to_owned(), full_name.to_owned()),
        ("name".to_owned(), full_name.to_owned()),
        ("participant.category".to_owned(), "General".to_owned()),
        ("track_name".to_owned(), "General".to_owned()),
        ("template.name".to_owned(), "Stress Test".to_owned()),
        ("certificate_type".to_owned(), "Stress Test".to_owned()),
        (
            "issue.certificate_id".to_owned(),
            "stress-cert-0001".to_owned(),
        ),
        ("certificate_id".to_owned(), "stress-cert-0001".to_owned()),
        (
            "issue.issue_date".to_owned(),
            chrono::Utc::now().format("%Y-%m-%d").to_string(),
        ),
        (
            "issue.verification_code".to_owned(),
            "verify-stress-0001".to_owned(),
        ),
    ])
}

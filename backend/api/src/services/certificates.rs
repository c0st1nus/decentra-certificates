use anyhow::{Context, Result};
use chrono::Utc;
use entity::{
    certificate_issues, certificate_templates, participants,
    prelude::{CertificateIssues, CertificateTemplates, Participants, TemplateLayouts},
    template_layouts,
};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, DbErr, EntityTrait, QueryFilter,
    QueryOrder, Set,
};
use serde::Serialize;
use std::collections::HashMap;
use ulid::Ulid;

use crate::{
    error::AppError,
    services::{certificate_jobs, scene_renderer, settings, templates},
};

#[derive(Clone, Debug, Serialize)]
pub struct PublicCertificateResponse {
    pub status: &'static str,
    pub message: &'static str,
    pub certificate_id: String,
    pub verification_code: String,
    pub download_url: String,
    pub verification_url: String,
    pub full_name: String,
    pub template_name: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct QueuedCertificateResponse {
    pub status: &'static str,
    pub message: String,
    pub job_id: String,
    pub certificate_id: String,
    pub events_url: String,
    pub verification_url: String,
    pub full_name: String,
    pub template_name: String,
}

pub enum IssueCertificateResult {
    Ready(PublicCertificateResponse),
    Queued(QueuedCertificateResponse),
}

#[derive(Clone, Debug, Serialize)]
pub struct VerificationResponse {
    pub status: &'static str,
    pub message: &'static str,
    pub certificate_id: String,
    pub verification_code: String,
    pub full_name: String,
    pub template_name: String,
    pub issued_at: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct AvailableCertificate {
    pub template_id: String,
    pub template_name: String,
    pub full_name: String,
    pub category: Option<String>,
    pub already_issued: bool,
    pub generation_status: String,
    pub certificate_id: Option<String>,
    pub download_url: Option<String>,
    pub verification_url: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct AvailableCertificatesResponse {
    pub full_name: Option<String>,
    pub certificates: Vec<AvailableCertificate>,
}

pub async fn issue_certificate(
    state: &crate::state::AppState,
    email: &str,
    template_id: Option<uuid::Uuid>,
) -> Result<IssueCertificateResult, AppError> {
    let issuance =
        settings::get_issuance_setting(&state.db, state.settings.issuance_enabled_default)
            .await
            .map_err(AppError::Internal)?;

    if !issuance.enabled {
        return Err(AppError::Forbidden(
            "certificate issuance is not open yet".to_owned(),
        ));
    }

    let normalized_email = normalize_email(email);

    let template = if let Some(id) = template_id {
        CertificateTemplates::find_by_id(id)
            .one(&state.db)
            .await
            .map_err(|err| AppError::Internal(err.into()))?
            .ok_or_else(|| AppError::NotFound("template not found".to_owned()))?
    } else {
        find_active_template(&state.db).await?
    };

    let participant =
        find_participant_for_template(&state.db, &normalized_email, template.id).await?;
    find_layout_for_template(&state.db, template.id).await?;

    let issue = find_or_create_issue_record(state, &participant, &template).await?;
    if state
        .storage
        .object_exists(&issue.generated_pdf_path)
        .await
        .unwrap_or(false)
    {
        return Ok(IssueCertificateResult::Ready(build_public_response(
            participant,
            template,
            issue,
        )));
    }

    let job = certificate_jobs::enqueue_issue(
        state,
        &issue,
        &participant,
        &template,
        certificate_jobs::JobPriority::UserRequested,
    )
    .await
    .map_err(AppError::Internal)?;

    Ok(IssueCertificateResult::Queued(QueuedCertificateResponse {
        status: "queued",
        message: job.message,
        job_id: job.job_id.clone(),
        certificate_id: job.certificate_id,
        events_url: format!("/api/v1/public/certificates/jobs/{}/events", job.job_id),
        verification_url: job.verification_url.unwrap_or_else(|| {
            format!("/api/v1/public/certificates/verify/{}", issue.verification_code)
        }),
        full_name: participant.full_name,
        template_name: template.name,
    }))
}

pub async fn check_available_certificates(
    state: &crate::state::AppState,
    email: &str,
) -> Result<AvailableCertificatesResponse, AppError> {
    let normalized_email = normalize_email(email);

    let participants = Participants::find()
        .filter(participants::Column::EmailNormalized.eq(&normalized_email))
        .all(&state.db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;

    if participants.is_empty() {
        return Ok(AvailableCertificatesResponse {
            full_name: None,
            certificates: vec![],
        });
    }

    let template_ids: Vec<uuid::Uuid> = participants
        .iter()
        .map(|p| p.event_code.parse::<uuid::Uuid>().unwrap_or(uuid::Uuid::nil()))
        .filter(|id| !id.is_nil())
        .collect();

    let templates = if template_ids.is_empty() {
        vec![]
    } else {
        CertificateTemplates::find()
            .filter(certificate_templates::Column::Id.is_in(template_ids))
            .all(&state.db)
            .await
            .map_err(|err| AppError::Internal(err.into()))?
    };

    let existing_issues = if participants.is_empty() {
        vec![]
    } else {
        let participant_ids: Vec<uuid::Uuid> = participants.iter().map(|p| p.id).collect();
        CertificateIssues::find()
            .filter(certificate_issues::Column::ParticipantId.is_in(participant_ids))
            .all(&state.db)
            .await
            .map_err(|err| AppError::Internal(err.into()))?
    };

    let issue_map: HashMap<(uuid::Uuid, uuid::Uuid), &certificate_issues::Model> = existing_issues
        .iter()
        .map(|issue| ((issue.participant_id, issue.template_id), issue))
        .collect();

    let full_name = participants.first().map(|p| p.full_name.clone());
    let mut certificates = Vec::with_capacity(templates.len());

    for template in templates {
        let participant = participants.iter().find(|p| p.event_code == template.id.to_string());
        let issue = participant.and_then(|p| issue_map.get(&(p.id, template.id)).copied());
        let delivery_status = resolve_delivery_status(state, issue).await?;

        certificates.push(AvailableCertificate {
            template_id: template.id.to_string(),
            template_name: template.name.clone(),
            full_name: participant
                .map(|p| p.full_name.clone())
                .unwrap_or_else(|| full_name.clone().unwrap_or_default()),
            category: participant.and_then(|p| p.category.clone()),
            already_issued: delivery_status == "ready",
            generation_status: delivery_status.to_owned(),
            certificate_id: issue.map(|i| i.certificate_id.clone()),
            download_url: issue.and_then(|i| {
                (delivery_status == "ready")
                    .then(|| format!("/api/v1/public/certificates/{}/download", i.certificate_id))
            }),
            verification_url: issue
                .map(|i| format!("/api/v1/public/certificates/verify/{}", i.verification_code)),
        });
    }

    Ok(AvailableCertificatesResponse {
        full_name,
        certificates,
    })
}

fn build_public_response(
    participant: participants::Model,
    template: certificate_templates::Model,
    issue: certificate_issues::Model,
) -> PublicCertificateResponse {
    let certificate_id = issue.certificate_id.clone();
    let verification_code = issue.verification_code.clone();

    PublicCertificateResponse {
        status: "success",
        message: "Сертификат готов",
        certificate_id: certificate_id.clone(),
        verification_code: verification_code.clone(),
        download_url: format!("/api/v1/public/certificates/{certificate_id}/download"),
        verification_url: format!("/api/v1/public/certificates/verify/{verification_code}"),
        full_name: participant.full_name,
        template_name: template.name,
    }
}

pub async fn download_certificate(
    state: &crate::state::AppState,
    certificate_id: &str,
) -> Result<(Vec<u8>, String), AppError> {
    let issue = CertificateIssues::find()
        .filter(certificate_issues::Column::CertificateId.eq(certificate_id))
        .one(&state.db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?
        .ok_or_else(|| AppError::NotFound("certificate not found".to_owned()))?;

    let pdf = match state.storage.get_object(&issue.generated_pdf_path).await {
        Ok(bytes) => bytes,
        Err(err) if is_storage_not_found(&err) => {
            if let Some(status) = certificate_jobs::get_job_status(state, &issue.id.to_string())
                .await
                .map_err(AppError::Internal)?
                && status.is_processing()
            {
                return Err(AppError::TooEarly(
                    "certificate is still being generated".to_owned(),
                ));
            }
            return Err(AppError::NotFound(
                "generated certificate file not found".to_owned(),
            ));
        }
        Err(err) => {
            return Err(AppError::Internal(anyhow::anyhow!(
                "failed to read generated certificate object {}: {err}",
                issue.generated_pdf_path
            )));
        }
    };

    let mut active_model: certificate_issues::ActiveModel = issue.clone().into();
    active_model.download_count = Set(issue.download_count + 1);
    active_model.last_downloaded_at = Set(Some(Utc::now()));
    active_model
        .update(&state.db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;

    Ok((pdf, issue.certificate_id))
}

pub async fn get_certificate_job(
    state: &crate::state::AppState,
    job_id: &str,
) -> Result<certificate_jobs::CertificateJobStatus, AppError> {
    certificate_jobs::get_job_status(state, job_id)
        .await
        .map_err(AppError::Internal)?
        .ok_or_else(|| AppError::NotFound("certificate job not found".to_owned()))
}

pub async fn verify_certificate(
    db: &DatabaseConnection,
    verification_code: &str,
) -> Result<VerificationResponse, AppError> {
    let issue = CertificateIssues::find()
        .filter(certificate_issues::Column::VerificationCode.eq(verification_code))
        .one(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?
        .ok_or_else(|| AppError::NotFound("certificate not found".to_owned()))?;

    let participant = Participants::find_by_id(issue.participant_id)
        .one(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?
        .ok_or_else(|| AppError::NotFound("participant not found".to_owned()))?;
    let template = CertificateTemplates::find_by_id(issue.template_id)
        .one(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?
        .ok_or_else(|| AppError::NotFound("template not found".to_owned()))?;

    Ok(VerificationResponse {
        status: "verified",
        message: "Сертификат найден",
        certificate_id: issue.certificate_id,
        verification_code: issue.verification_code,
        full_name: participant.full_name,
        template_name: template.name,
        issued_at: issue.created_at.to_rfc3339(),
    })
}

async fn find_participant_for_template(
    db: &DatabaseConnection,
    normalized_email: &str,
    template_id: uuid::Uuid,
) -> Result<participants::Model, AppError> {
    Participants::find()
        .filter(participants::Column::EmailNormalized.eq(normalized_email))
        .filter(participants::Column::EventCode.eq(template_id.to_string()))
        .order_by_desc(participants::Column::ImportedAt)
        .one(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?
        .ok_or_else(|| AppError::NotFound("participant not found".to_owned()))
}

async fn find_active_template(
    db: &DatabaseConnection,
) -> Result<certificate_templates::Model, AppError> {
    CertificateTemplates::find()
        .filter(certificate_templates::Column::IsActive.eq(true))
        .order_by_desc(certificate_templates::Column::UpdatedAt)
        .one(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?
        .ok_or_else(|| {
            AppError::ServiceUnavailable("active certificate template is not configured".to_owned())
        })
}

pub(crate) async fn find_layout_for_template(
    db: &DatabaseConnection,
    template_id: uuid::Uuid,
) -> Result<template_layouts::Model, AppError> {
    TemplateLayouts::find()
        .filter(template_layouts::Column::TemplateId.eq(template_id))
        .one(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?
        .ok_or_else(|| AppError::ServiceUnavailable("template layout is not configured".to_owned()))
}

pub(crate) async fn find_or_create_issue_record(
    state: &crate::state::AppState,
    participant: &participants::Model,
    template: &certificate_templates::Model,
) -> Result<certificate_issues::Model, AppError> {
    if let Some(existing) = find_existing_issue(&state.db, participant, template).await? {
        return Ok(existing);
    }

    let certificate_id = Ulid::new().to_string().to_lowercase();
    let verification_code = Ulid::new().to_string().to_lowercase();
    let output_key = state.storage.generated_file_key(&certificate_id);
    let issue = certificate_issues::ActiveModel {
        id: Set(uuid::Uuid::new_v4()),
        certificate_id: Set(certificate_id.clone()),
        verification_code: Set(verification_code.clone()),
        participant_id: Set(participant.id),
        template_id: Set(template.id),
        generated_pdf_path: Set(output_key),
        download_count: Set(0),
        last_downloaded_at: Set(None),
        created_at: Set(Utc::now()),
    };

    match issue.insert(&state.db).await {
        Ok(issue) => Ok(issue),
        Err(err) if is_unique_issue_violation(&err) => find_existing_issue(&state.db, participant, template)
            .await?
            .ok_or_else(|| AppError::Internal(err.into())),
        Err(err) => Err(AppError::Internal(err.into())),
    }
}

async fn find_existing_issue(
    db: &DatabaseConnection,
    participant: &participants::Model,
    template: &certificate_templates::Model,
) -> Result<Option<certificate_issues::Model>, AppError> {
    CertificateIssues::find()
        .filter(certificate_issues::Column::ParticipantId.eq(participant.id))
        .filter(certificate_issues::Column::TemplateId.eq(template.id))
        .one(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))
}

fn is_unique_issue_violation(err: &DbErr) -> bool {
    let message = err.to_string().to_lowercase();
    message.contains("unique")
        || message.contains("duplicate key")
        || message.contains("constraint")
}

pub(crate) async fn render_issue_pdf(
    state: &crate::state::AppState,
    issue: &certificate_issues::Model,
    participant: &participants::Model,
    template: &certificate_templates::Model,
    layout: &template_layouts::Model,
) -> Result<()> {
    let layout_data = templates::model_to_layout_data(layout);
    let pdf = scene_renderer::render_scene_pdf(
        state,
        template,
        &layout_data,
        build_certificate_binding_values(participant, template, issue),
    )
    .await?;

    state
        .storage
        .put_object(&issue.generated_pdf_path, pdf, Some("application/pdf"))
        .await
        .with_context(|| {
            format!(
                "failed to write generated certificate object: {}",
                issue.generated_pdf_path
            )
        })?;
    Ok(())
}

pub(crate) fn build_pdf_document(
    page_width: f32,
    page_height: f32,
    content: &str,
    background: Option<&PdfBackground>,
) -> Result<Vec<u8>> {
    build_pdf(page_width, page_height, content, background)
}

fn is_storage_not_found(err: &anyhow::Error) -> bool {
    let message = err.to_string().to_ascii_lowercase();
    message.contains("not found") || message.contains("no such key") || message.contains("404")
}

fn build_certificate_binding_values(
    participant: &participants::Model,
    template: &certificate_templates::Model,
    issue: &certificate_issues::Model,
) -> HashMap<String, String> {
    let issue_date = issue.created_at.format("%Y-%m-%d").to_string();
    let track_name = participant.category.clone().unwrap_or_else(|| "General".to_owned());

    let mut values = HashMap::from([
        ("participant.full_name".to_owned(), participant.full_name.clone()),
        ("full_name".to_owned(), participant.full_name.clone()),
        ("name".to_owned(), participant.full_name.clone()),
        ("participant.category".to_owned(), track_name.clone()),
        ("track_name".to_owned(), track_name),
        ("template.name".to_owned(), template.name.clone()),
        ("certificate_type".to_owned(), template.name.clone()),
        ("issue.certificate_id".to_owned(), issue.certificate_id.clone()),
        ("certificate_id".to_owned(), issue.certificate_id.clone()),
        ("issue.issue_date".to_owned(), issue_date),
        (
            "issue.verification_code".to_owned(),
            issue.verification_code.clone(),
        ),
    ]);

    if let Some(metadata) = participant.metadata.as_object() {
        for (key, value) in metadata {
            let string_value = match value {
                serde_json::Value::String(inner) => inner.clone(),
                _ => value.to_string(),
            };
            values.insert(key.clone(), string_value.clone());
            values.insert(format!("participant.{key}"), string_value);
        }
    }

    values
}

#[derive(Clone, Debug)]
pub struct PdfBackground {
    pub width: u32,
    pub height: u32,
    pub filter: &'static str,
    pub bytes: Vec<u8>,
}

fn build_pdf(
    page_width: f32,
    page_height: f32,
    content: &str,
    background: Option<&PdfBackground>,
) -> Result<Vec<u8>> {
    let mut content_stream = String::new();
    if background.is_some() {
        content_stream.push_str(&format!(
            "q\n{} 0 0 {} 0 0 cm\n/Im1 Do\nQ\n",
            format_number(page_width),
            format_number(page_height),
        ));
    }
    content_stream.push_str(content);

    let page_resources = if background.is_some() {
        "<< /XObject << /Im1 5 0 R >> >>".to_owned()
    } else {
        "<< >>".to_owned()
    };

    let mut objects: Vec<Vec<u8>> = vec![
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n".to_vec(),
        b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n".to_vec(),
        format!(
            "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 {} {}] /Resources {} /Contents 4 0 R >> endobj\n",
            format_number(page_width),
            format_number(page_height),
            page_resources,
        )
        .into_bytes(),
        format!(
            "4 0 obj << /Length {} >> stream\n{}\nendstream endobj\n",
            content_stream.len(),
            content_stream
        )
        .into_bytes(),
    ];

    if let Some(background) = background {
        let mut image_object = format!(
            "5 0 obj << /Type /XObject /Subtype /Image /Width {} /Height {} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /{} /Length {} >> stream\n",
            background.width,
            background.height,
            background.filter,
            background.bytes.len(),
        )
        .into_bytes();
        image_object.extend_from_slice(&background.bytes);
        image_object.extend_from_slice(b"\nendstream endobj\n");
        objects.push(image_object);
    }

    let mut pdf = b"%PDF-1.4\n".to_vec();
    let mut offsets = Vec::with_capacity(objects.len() + 1);
    offsets.push(0usize);

    for object in objects {
        offsets.push(pdf.len());
        pdf.extend_from_slice(&object);
    }

    let xref_start = pdf.len();
    pdf.extend_from_slice(format!("xref\n0 {}\n", offsets.len()).as_bytes());
    pdf.extend_from_slice(b"0000000000 65535 f \n");
    for offset in offsets.iter().skip(1) {
        pdf.extend_from_slice(format!("{:010} 00000 n \n", offset).as_bytes());
    }
    pdf.extend_from_slice(
        format!(
            "trailer << /Size {} /Root 1 0 R >>\nstartxref\n{}\n%%EOF",
            offsets.len(),
            xref_start
        )
        .as_bytes(),
    );

    Ok(pdf)
}

fn normalize_email(email: &str) -> String {
    email.trim().to_lowercase()
}

fn format_number(value: f32) -> String {
    let mut text = format!("{value:.2}");
    while text.contains('.') && text.ends_with('0') {
        text.pop();
    }
    if text.ends_with('.') {
        text.pop();
    }
    text
}

async fn resolve_delivery_status(
    state: &crate::state::AppState,
    issue: Option<&certificate_issues::Model>,
) -> Result<&'static str, AppError> {
    let Some(issue) = issue else {
        return Ok("not_requested");
    };

    if state
        .storage
        .object_exists(&issue.generated_pdf_path)
        .await
        .unwrap_or(false)
    {
        return Ok("ready");
    }

    if let Some(job) = certificate_jobs::get_job_status(state, &issue.id.to_string())
        .await
        .map_err(AppError::Internal)?
    {
        return Ok(match job.status.as_str() {
            "queued" => "queued",
            "processing" => "processing",
            "failed" => "failed",
            "completed" => "ready",
            _ => "not_requested",
        });
    }

    Ok("not_requested")
}

#[cfg(test)]
mod tests {
    use super::normalize_email;

    #[test]
    fn normalizes_email_for_lookup() {
        assert_eq!(
            normalize_email("  Person@Example.com "),
            "person@example.com"
        );
    }
}

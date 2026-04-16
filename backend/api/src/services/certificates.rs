use anyhow::{Context, Result};
use chrono::Utc;
use entity::{
    certificate_issues, certificate_templates, participants,
    prelude::{CertificateIssues, CertificateTemplates, Participants, TemplateLayouts},
    template_layouts,
};
use flate2::{Compression, write::ZlibEncoder};
use image::GenericImageView;
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, DbErr, EntityTrait, QueryFilter, QueryOrder,
    Set,
};
use serde::Serialize;
use std::io::Write;
use ulid::Ulid;

use crate::{
    error::AppError,
    services::{redis::RedisService, settings, storage::StorageService, templates},
};

const NAME_BOX_INSET: f32 = 16.0;

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
pub struct PreviewRenderDiagnostics {
    pub preview_name: String,
    pub page_width: f32,
    pub page_height: f32,
    pub box_left: f32,
    pub box_top: f32,
    pub box_width: f32,
    pub box_height: f32,
    pub text_left: f32,
    pub text_top: f32,
    pub text_left_in_box: f32,
    pub text_top_in_box: f32,
    pub text_width: f32,
    pub font_size: f32,
    pub ascent_ratio: f32,
    pub baseline_top: f32,
    pub baseline_y: f32,
    pub pdf_font_family: String,
    pub text_align: String,
    pub vertical_align: String,
}

pub async fn issue_certificate(
    db: &DatabaseConnection,
    redis: &RedisService,
    storage: &StorageService,
    issuance_default_enabled: bool,
    email: &str,
) -> Result<PublicCertificateResponse, AppError> {
    let issuance = settings::get_issuance_setting(db, issuance_default_enabled)
        .await
        .map_err(AppError::Internal)?;

    if !issuance.enabled {
        return Err(AppError::Forbidden(
            "certificate issuance is not open yet".to_owned(),
        ));
    }

    let template = find_active_template(db).await?;
    let normalized_email = normalize_email(email);
    let participant = find_participant_for_template(db, &normalized_email, template.id).await?;
    let layout = find_layout_for_template(db, template.id).await?;
    let lock_key = format!("certificate:issue-lock:{}:{}", participant.id, template.id);
    let lock_acquired = redis.acquire_lock(&lock_key, 30).await.unwrap_or(false);

    let issue = if lock_acquired {
        let result = find_or_create_issue(db, storage, &participant, &template, &layout).await;
        let _ = redis.remove_key(&lock_key).await;
        result?
    } else if let Some(existing) = find_existing_issue(db, &participant, &template).await? {
        if !storage
            .object_exists(&existing.generated_pdf_path)
            .await
            .unwrap_or(false)
        {
            write_certificate_pdf(
                storage,
                &existing.generated_pdf_path,
                &participant,
                &template,
                &layout,
                &existing,
            )
            .await
            .map_err(AppError::Internal)?;
        }
        existing
    } else {
        find_or_create_issue(db, storage, &participant, &template, &layout).await?
    };

    Ok(build_public_response(participant, template, issue))
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
    db: &DatabaseConnection,
    storage: &StorageService,
    certificate_id: &str,
) -> Result<(Vec<u8>, String), AppError> {
    let issue = CertificateIssues::find()
        .filter(certificate_issues::Column::CertificateId.eq(certificate_id))
        .one(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?
        .ok_or_else(|| AppError::NotFound("certificate not found".to_owned()))?;

    let pdf = match storage.get_object(&issue.generated_pdf_path).await {
        Ok(bytes) => bytes,
        Err(err) if is_storage_not_found(&err) => {
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
        .update(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;

    Ok((pdf, issue.certificate_id))
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

async fn find_layout_for_template(
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

async fn find_or_create_issue(
    db: &DatabaseConnection,
    storage: &StorageService,
    participant: &participants::Model,
    template: &certificate_templates::Model,
    layout: &template_layouts::Model,
) -> Result<certificate_issues::Model, AppError> {
    if let Some(existing) = find_existing_issue(db, participant, template).await? {
        if !storage
            .object_exists(&existing.generated_pdf_path)
            .await
            .unwrap_or(false)
        {
            write_certificate_pdf(
                storage,
                &existing.generated_pdf_path,
                participant,
                template,
                layout,
                &existing,
            )
            .await
            .map_err(AppError::Internal)?;
        }

        return Ok(existing);
    }

    let certificate_id = Ulid::new().to_string().to_lowercase();
    let verification_code = Ulid::new().to_string().to_lowercase();
    let output_key = storage.generated_file_key(&certificate_id);
    let issue = certificate_issues::ActiveModel {
        id: Set(uuid::Uuid::new_v4()),
        certificate_id: Set(certificate_id.clone()),
        verification_code: Set(verification_code.clone()),
        participant_id: Set(participant.id),
        template_id: Set(template.id),
        generated_pdf_path: Set(output_key.clone()),
        download_count: Set(0),
        last_downloaded_at: Set(None),
        created_at: Set(Utc::now()),
    };

    let issue = match issue.insert(db).await {
        Ok(issue) => issue,
        Err(err) if is_unique_issue_violation(&err) => {
            find_existing_issue(db, participant, template)
                .await?
                .ok_or_else(|| AppError::Internal(err.into()))?
        }
        Err(err) => return Err(AppError::Internal(err.into())),
    };

    write_certificate_pdf(storage, &output_key, participant, template, layout, &issue)
        .await
        .map_err(AppError::Internal)?;

    Ok(issue)
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

async fn write_certificate_pdf(
    storage: &StorageService,
    output_key: &str,
    participant: &participants::Model,
    template: &certificate_templates::Model,
    layout: &template_layouts::Model,
    issue: &certificate_issues::Model,
) -> Result<()> {
    let font_family = templates::resolve_pdf_font_family(&layout.font_family);
    let pdf =
        render_certificate_pdf(storage, participant, template, layout, &font_family, issue).await?;
    storage
        .put_object(output_key, pdf, Some("application/pdf"))
        .await
        .with_context(|| format!("failed to write generated certificate object: {output_key}"))?;
    Ok(())
}

fn is_storage_not_found(err: &anyhow::Error) -> bool {
    let message = err.to_string().to_ascii_lowercase();
    message.contains("not found") || message.contains("no such key") || message.contains("404")
}

pub(crate) async fn render_certificate_pdf(
    storage: &StorageService,
    participant: &participants::Model,
    template: &certificate_templates::Model,
    layout: &template_layouts::Model,
    font_family: &str,
    issue: &certificate_issues::Model,
) -> Result<Vec<u8>> {
    let (pdf, _diagnostics) = render_certificate_pdf_with_diagnostics(
        storage,
        participant,
        template,
        layout,
        font_family,
        issue,
    )
    .await?;

    Ok(pdf)
}

pub(crate) async fn render_certificate_pdf_with_diagnostics(
    storage: &StorageService,
    participant: &participants::Model,
    template: &certificate_templates::Model,
    layout: &template_layouts::Model,
    font_family: &str,
    issue: &certificate_issues::Model,
) -> Result<(Vec<u8>, PreviewRenderDiagnostics)> {
    let page_width = layout.page_width.max(1) as f32;
    let page_height = layout.page_height.max(1) as f32;
    let name = participant.full_name.trim();
    let font_color = parse_hex_color(&layout.font_color_hex).unwrap_or((0.05, 0.05, 0.05));
    let diagnostics =
        compute_preview_render_diagnostics(name, layout, font_family, page_width, page_height);
    let background = load_pdf_background(storage, template).await?;
    let content = if background.is_some() {
        draw_text(
            &font_family,
            font_color,
            diagnostics.font_size,
            diagnostics.text_left,
            diagnostics.baseline_y,
            name,
        )
    } else {
        build_fallback_content(
            participant,
            template,
            issue,
            &font_family,
            font_color,
            diagnostics.text_left,
            diagnostics.baseline_y,
            page_width,
            page_height,
            diagnostics.font_size,
        )?
    };

    let pdf = build_pdf(
        page_width,
        page_height,
        &content,
        &font_family,
        background.as_ref(),
    )?;

    Ok((pdf, diagnostics))
}

#[derive(Clone, Debug)]
struct PdfBackground {
    width: u32,
    height: u32,
    filter: &'static str,
    bytes: Vec<u8>,
}

async fn load_pdf_background(
    storage: &StorageService,
    template: &certificate_templates::Model,
) -> Result<Option<PdfBackground>> {
    match template.source_kind.to_ascii_lowercase().as_str() {
        "png" | "jpg" | "jpeg" => {
            let bytes = storage
                .get_object(&template.source_path)
                .await
                .with_context(|| {
                    format!(
                        "failed to load template background: {}",
                        template.source_path
                    )
                })?;

            let image = image::load_from_memory(&bytes).with_context(|| {
                format!("failed to decode template image: {}", template.source_path)
            })?;
            let (width, height) = image.dimensions();
            let rgb = image.to_rgb8();

            let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
            encoder
                .write_all(rgb.as_raw())
                .context("failed to compress template background")?;
            let compressed = encoder
                .finish()
                .context("failed to finalize template background compression")?;

            Ok(Some(PdfBackground {
                width,
                height,
                filter: "FlateDecode",
                bytes: compressed,
            }))
        }
        _ => Ok(None),
    }
}

fn build_fallback_content(
    participant: &participants::Model,
    template: &certificate_templates::Model,
    issue: &certificate_issues::Model,
    font_family: &str,
    font_color: (f32, f32, f32),
    safe_name_x: f32,
    safe_name_y: f32,
    page_width: f32,
    page_height: f32,
    name_font_size: f32,
) -> Result<String> {
    let title = "Decentrathon Certificate";
    let subtitle = format!("Template: {}", template.name);
    let issued_at = issue.created_at.to_rfc3339();
    let certificate_line = format!("Certificate ID: {}", issue.certificate_id);
    let verification_line = format!("Verification code: {}", issue.verification_code);
    let event_line = format!("Event: {}", participant.event_code);
    let accent = (0.55, 0.85, 0.12);
    let title_x = 72.0;
    let title_y = page_height - 90.0;
    let body_y_start = safe_name_y - 70.0;
    let name = participant.full_name.trim();

    let mut content = String::new();
    content.push_str(&draw_line(
        accent,
        36.0,
        page_height - 44.0,
        page_width - 72.0,
    ));
    content.push_str(&draw_text(
        font_family,
        (0.0, 0.0, 0.0),
        16.0,
        title_x,
        title_y,
        title,
    ));
    content.push_str(&draw_text(
        font_family,
        (0.24, 0.24, 0.24),
        11.0,
        title_x,
        title_y - 22.0,
        &subtitle,
    ));
    content.push_str(&draw_text(
        font_family,
        font_color,
        11.0,
        title_x,
        title_y - 48.0,
        "Issued on the server, signed by Decentrathon.",
    ));
    content.push_str(&draw_text(
        font_family,
        font_color,
        name_font_size,
        safe_name_x,
        safe_name_y,
        name,
    ));
    content.push_str(&draw_text(
        font_family,
        (0.18, 0.18, 0.18),
        11.0,
        title_x,
        body_y_start,
        &event_line,
    ));
    content.push_str(&draw_text(
        font_family,
        (0.18, 0.18, 0.18),
        11.0,
        title_x,
        body_y_start - 18.0,
        &certificate_line,
    ));
    content.push_str(&draw_text(
        font_family,
        (0.18, 0.18, 0.18),
        11.0,
        title_x,
        body_y_start - 36.0,
        &verification_line,
    ));
    content.push_str(&draw_text(
        font_family,
        (0.18, 0.18, 0.18),
        11.0,
        title_x,
        body_y_start - 54.0,
        &format!("Generated at {}", issued_at),
    ));
    content.push_str(&draw_line(accent, 36.0, 72.0, page_width - 72.0));
    Ok(content)
}

fn build_pdf(
    page_width: f32,
    page_height: f32,
    content: &str,
    font_family: &str,
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
        "<< /Font << /F1 5 0 R >> /XObject << /Im1 6 0 R >> >>".to_owned()
    } else {
        "<< /Font << /F1 5 0 R >> >>".to_owned()
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
        format!(
            "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /{} >> endobj\n",
            font_family
        )
        .into_bytes(),
    ];

    if let Some(background) = background {
        let mut image_object = format!(
            "6 0 obj << /Type /XObject /Subtype /Image /Width {} /Height {} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /{} /Length {} >> stream\n",
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

fn draw_text(
    _font_family: &str,
    color: (f32, f32, f32),
    font_size: f32,
    x: f32,
    y: f32,
    text: &str,
) -> String {
    format!(
        "{r:.3} {g:.3} {b:.3} rg\nBT /F1 {size} Tf 1 0 0 1 {x} {y} Tm ({text}) Tj ET\n",
        r = color.0,
        g = color.1,
        b = color.2,
        size = font_size,
        x = format_number(x),
        y = format_number(y),
        text = escape_pdf_text(text),
    )
}

fn draw_line(color: (f32, f32, f32), start_x: f32, start_y: f32, end_x: f32) -> String {
    format!(
        "{r:.3} {g:.3} {b:.3} RG\n1.2 w\n{x1} {y} m\n{x2} {y} l\nS\n",
        r = color.0,
        g = color.1,
        b = color.2,
        x1 = format_number(start_x),
        x2 = format_number(end_x),
        y = format_number(start_y),
    )
}

fn compute_preview_render_diagnostics(
    name: &str,
    layout: &template_layouts::Model,
    font_family: &str,
    page_width: f32,
    page_height: f32,
) -> PreviewRenderDiagnostics {
    let font_size = compute_name_font_size(name, layout, font_family);
    let box_left = layout.name_x.max(0) as f32;
    let box_width = layout.name_max_width.max(1) as f32;
    let text_width = estimate_text_width(name, font_size, font_family);
    let text_left = match layout.text_align.as_str() {
        "center" => (box_left + box_width / 2.0) - text_width / 2.0,
        "right" => box_left + box_width - text_width - NAME_BOX_INSET,
        _ => box_left + NAME_BOX_INSET,
    };
    let box_height = compute_name_box_height(layout.name_box_height);
    let box_top = layout.name_y.max(0) as f32 - box_height;
    let ascent_ratio = resolve_pdf_text_ascent_ratio(font_family);
    let text_top = match layout.vertical_align.as_str() {
        "top" => box_top + NAME_BOX_INSET,
        "bottom" => box_top + box_height - font_size - NAME_BOX_INSET,
        _ => box_top + box_height / 2.0 + font_size * (0.35 - ascent_ratio),
    };
    let baseline_top = text_top + ascent_ratio * font_size;

    PreviewRenderDiagnostics {
        preview_name: name.to_owned(),
        page_width,
        page_height,
        box_left,
        box_top,
        box_width,
        box_height,
        text_left,
        text_top,
        text_left_in_box: text_left - box_left,
        text_top_in_box: text_top - box_top,
        text_width,
        font_size,
        ascent_ratio,
        baseline_top,
        baseline_y: page_height - baseline_top,
        pdf_font_family: font_family.to_owned(),
        text_align: layout.text_align.clone(),
        vertical_align: layout.vertical_align.clone(),
    }
}

fn compute_name_box_height(name_box_height: i32) -> f32 {
    name_box_height.max(40) as f32
}

fn resolve_pdf_text_ascent_ratio(font_family: &str) -> f32 {
    match font_family {
        "Times-Roman" => 0.9,
        "Courier" => 0.83,
        "Symbol" | "ZapfDingbats" => 0.88,
        _ => 0.93,
    }
}

fn compute_name_font_size(name: &str, layout: &template_layouts::Model, font_family: &str) -> f32 {
    let mut size = layout.font_size.max(1) as f32;
    if !layout.auto_shrink {
        return size;
    }
    let width_limit = (layout.name_max_width.max(1) as f32 - NAME_BOX_INSET * 2.0).max(1.0);
    let estimated = estimate_text_width(name, size, font_family);
    if estimated > width_limit {
        let ratio = width_limit / estimated;
        size = (size * ratio).clamp(1.0, layout.font_size.max(1) as f32);
    }
    size
}

fn estimate_text_width(text: &str, font_size: f32, font_family: &str) -> f32 {
    estimate_text_units(text, font_family) * font_size
}

fn estimate_text_units(text: &str, font_family: &str) -> f32 {
    let normalized = font_family.to_ascii_lowercase();
    let family_factor = match normalized.as_str() {
        "times-roman" => 0.85,
        "courier" => 0.62,
        "symbol" | "zapfdingbats" => 0.7,
        _ => 1.0,
    };

    let units = text
        .trim()
        .chars()
        .map(estimate_char_unit)
        .sum::<f32>();

    (units * family_factor).max(1.0)
}

fn estimate_char_unit(ch: char) -> f32 {
    if ch == ' ' {
        return 0.33;
    }

    if "ilI|!'`.,".contains(ch) {
        return 0.3;
    }

    if "fjrt()[]{}:;".contains(ch) {
        return 0.4;
    }

    if "mwMW@%&".contains(ch) {
        return 0.92;
    }

    if ch.is_ascii_uppercase() {
        return 0.72;
    }

    if ch.is_ascii_digit() {
        return 0.62;
    }

    0.56
}

fn parse_hex_color(value: &str) -> Option<(f32, f32, f32)> {
    let hex = value.trim().trim_start_matches('#');
    if hex.len() != 6 {
        return None;
    }

    let red = u8::from_str_radix(&hex[0..2], 16).ok()? as f32 / 255.0;
    let green = u8::from_str_radix(&hex[2..4], 16).ok()? as f32 / 255.0;
    let blue = u8::from_str_radix(&hex[4..6], 16).ok()? as f32 / 255.0;
    Some((red, green, blue))
}

fn escape_pdf_text(text: &str) -> String {
    transliterate_to_ascii(text)
        .chars()
        .flat_map(|ch| match ch {
            '\\' => vec!['\\', '\\'],
            '(' => vec!['\\', '('],
            ')' => vec!['\\', ')'],
            '\n' | '\r' => vec![' '],
            _ => vec![ch],
        })
        .collect()
}

fn transliterate_to_ascii(text: &str) -> String {
    let mut output = String::with_capacity(text.len());
    for ch in text.chars() {
        if ch.is_ascii() {
            output.push(ch);
        } else {
            output.push_str(transliterate_char(ch));
        }
    }
    output
}

fn transliterate_char(ch: char) -> &'static str {
    match ch {
        'А' => "A",
        'Б' => "B",
        'В' => "V",
        'Г' => "G",
        'Д' => "D",
        'Е' => "E",
        'Ё' => "Yo",
        'Ж' => "Zh",
        'З' => "Z",
        'И' => "I",
        'Й' => "Y",
        'К' => "K",
        'Л' => "L",
        'М' => "M",
        'Н' => "N",
        'О' => "O",
        'П' => "P",
        'Р' => "R",
        'С' => "S",
        'Т' => "T",
        'У' => "U",
        'Ф' => "F",
        'Х' => "Kh",
        'Ц' => "Ts",
        'Ч' => "Ch",
        'Ш' => "Sh",
        'Щ' => "Shch",
        'Ъ' => "",
        'Ы' => "Y",
        'Ь' => "",
        'Э' => "E",
        'Ю' => "Yu",
        'Я' => "Ya",
        'а' => "a",
        'б' => "b",
        'в' => "v",
        'г' => "g",
        'д' => "d",
        'е' => "e",
        'ё' => "yo",
        'ж' => "zh",
        'з' => "z",
        'и' => "i",
        'й' => "y",
        'к' => "k",
        'л' => "l",
        'м' => "m",
        'н' => "n",
        'о' => "o",
        'п' => "p",
        'р' => "r",
        'с' => "s",
        'т' => "t",
        'у' => "u",
        'ф' => "f",
        'х' => "kh",
        'ц' => "ts",
        'ч' => "ch",
        'ш' => "sh",
        'щ' => "shch",
        'ъ' => "",
        'ы' => "y",
        'ь' => "",
        'э' => "e",
        'ю' => "yu",
        'я' => "ya",
        _ => "?",
    }
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

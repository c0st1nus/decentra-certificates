use std::path::Path;

use anyhow::{Context, Result};
use chrono::Utc;
use entity::{
    certificate_issues, certificate_templates, participants,
    prelude::{CertificateIssues, CertificateTemplates, Participants, TemplateLayouts},
    template_layouts,
};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder, Set,
};
use serde::Serialize;
use ulid::Ulid;

use crate::{
    error::AppError,
    services::{settings, storage::StorageService},
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
pub struct VerificationResponse {
    pub status: &'static str,
    pub message: &'static str,
    pub certificate_id: String,
    pub verification_code: String,
    pub full_name: String,
    pub template_name: String,
    pub issued_at: String,
}

pub async fn issue_certificate(
    db: &DatabaseConnection,
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

    let normalized_email = normalize_email(email);
    let participant = find_participant_by_email(db, &normalized_email).await?;
    let template = find_active_template(db).await?;
    let layout = find_layout_for_template(db, template.id).await?;

    let issue = find_or_create_issue(db, storage, &participant, &template, &layout).await?;
    let certificate_id = issue.certificate_id.clone();
    let verification_code = issue.verification_code.clone();

    Ok(PublicCertificateResponse {
        status: "success",
        message: "Сертификат готов",
        certificate_id: certificate_id.clone(),
        verification_code: verification_code.clone(),
        download_url: format!("/api/v1/public/certificates/{certificate_id}/download"),
        verification_url: format!("/api/v1/public/certificates/verify/{verification_code}"),
        full_name: participant.full_name,
        template_name: template.name,
    })
}

pub async fn download_certificate(
    db: &DatabaseConnection,
    certificate_id: &str,
) -> Result<(Vec<u8>, String), AppError> {
    let issue = CertificateIssues::find()
        .filter(certificate_issues::Column::CertificateId.eq(certificate_id))
        .one(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?
        .ok_or_else(|| AppError::NotFound("certificate not found".to_owned()))?;

    let path = Path::new(&issue.generated_pdf_path);
    let pdf = match tokio::fs::read(path).await {
        Ok(bytes) => bytes,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            return Err(AppError::NotFound(
                "generated certificate file not found".to_owned(),
            ));
        }
        Err(err) => {
            return Err(AppError::Internal(anyhow::anyhow!(
                "failed to read generated certificate file: {} ({err})",
                path.display()
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

async fn find_participant_by_email(
    db: &DatabaseConnection,
    normalized_email: &str,
) -> Result<participants::Model, AppError> {
    Participants::find()
        .filter(participants::Column::EmailNormalized.eq(normalized_email))
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
    if let Some(existing) = CertificateIssues::find()
        .filter(certificate_issues::Column::ParticipantId.eq(participant.id))
        .filter(certificate_issues::Column::TemplateId.eq(template.id))
        .one(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?
    {
        let output_path = storage.generated_file_path(&existing.certificate_id);
        if !output_path.exists() {
            write_certificate_pdf(&output_path, participant, template, layout, &existing)
                .await
                .map_err(AppError::Internal)?;
        }

        return Ok(existing);
    }

    let certificate_id = Ulid::new().to_string().to_lowercase();
    let verification_code = Ulid::new().to_string().to_lowercase();
    let output_path = storage.generated_file_path(&certificate_id);
    let issue = certificate_issues::ActiveModel {
        id: Set(uuid::Uuid::new_v4()),
        certificate_id: Set(certificate_id.clone()),
        verification_code: Set(verification_code.clone()),
        participant_id: Set(participant.id),
        template_id: Set(template.id),
        generated_pdf_path: Set(output_path.display().to_string()),
        download_count: Set(0),
        last_downloaded_at: Set(None),
        created_at: Set(Utc::now()),
    }
    .insert(db)
    .await
    .map_err(|err| AppError::Internal(err.into()))?;

    write_certificate_pdf(&output_path, participant, template, layout, &issue)
        .await
        .map_err(AppError::Internal)?;

    Ok(issue)
}

async fn write_certificate_pdf(
    output_path: &Path,
    participant: &participants::Model,
    template: &certificate_templates::Model,
    layout: &template_layouts::Model,
    issue: &certificate_issues::Model,
) -> Result<()> {
    if let Some(parent) = output_path.parent() {
        tokio::fs::create_dir_all(parent).await.with_context(|| {
            format!("failed to create generated directory: {}", parent.display())
        })?;
    }

    let pdf = render_certificate_pdf(participant, template, layout, issue)?;
    tokio::fs::write(output_path, pdf).await.with_context(|| {
        format!(
            "failed to write generated certificate: {}",
            output_path.display()
        )
    })?;
    Ok(())
}

pub(crate) fn render_certificate_pdf(
    participant: &participants::Model,
    template: &certificate_templates::Model,
    layout: &template_layouts::Model,
    issue: &certificate_issues::Model,
) -> Result<Vec<u8>> {
    let page_width = layout.page_width.max(1) as f32;
    let page_height = layout.page_height.max(1) as f32;
    let title = "Decentrathon Certificate";
    let subtitle = format!("Template: {}", template.name);
    let name = participant.full_name.trim();
    let issued_at = issue.created_at.to_rfc3339();
    let certificate_line = format!("Certificate ID: {}", issue.certificate_id);
    let verification_line = format!("Verification code: {}", issue.verification_code);
    let event_line = format!("Event: {}", participant.event_code);
    let font_color = parse_hex_color(&layout.font_color_hex).unwrap_or((0.05, 0.05, 0.05));
    let accent = (0.55, 0.85, 0.12);
    let name_font_size = compute_name_font_size(name, layout);
    let title_x = 72.0;
    let title_y = page_height - 90.0;
    let name_x = layout.name_x.max(0) as f32;
    let name_y = page_height - layout.name_y.max(0) as f32;
    let name_width = estimate_text_width(name, name_font_size);
    let aligned_name_x = match layout.text_align.as_str() {
        "center" => (name_x + layout.name_max_width as f32 / 2.0) - name_width / 2.0,
        "right" => name_x + layout.name_max_width as f32 - name_width,
        _ => name_x,
    };
    let safe_name_x = aligned_name_x.max(48.0);
    let lower_name_bound = 140.0;
    let upper_name_bound = (page_height - 160.0).max(lower_name_bound);
    let safe_name_y = name_y.clamp(lower_name_bound, upper_name_bound);
    let body_y_start = safe_name_y - 70.0;

    let mut content = String::new();
    content.push_str(&draw_line(
        accent,
        36.0,
        page_height - 44.0,
        page_width - 72.0,
    ));
    content.push_str(&draw_text((0.0, 0.0, 0.0), 16.0, title_x, title_y, title));
    content.push_str(&draw_text(
        (0.24, 0.24, 0.24),
        11.0,
        title_x,
        title_y - 22.0,
        &subtitle,
    ));
    content.push_str(&draw_text(
        font_color,
        11.0,
        title_x,
        title_y - 48.0,
        "Issued on the server, signed by Decentrathon.",
    ));
    content.push_str(&draw_text(
        font_color,
        name_font_size,
        safe_name_x,
        safe_name_y,
        name,
    ));
    content.push_str(&draw_text(
        (0.18, 0.18, 0.18),
        11.0,
        title_x,
        body_y_start,
        &event_line,
    ));
    content.push_str(&draw_text(
        (0.18, 0.18, 0.18),
        11.0,
        title_x,
        body_y_start - 18.0,
        &certificate_line,
    ));
    content.push_str(&draw_text(
        (0.18, 0.18, 0.18),
        11.0,
        title_x,
        body_y_start - 36.0,
        &verification_line,
    ));
    content.push_str(&draw_text(
        (0.18, 0.18, 0.18),
        11.0,
        title_x,
        body_y_start - 54.0,
        &format!("Generated at {}", issued_at),
    ));
    content.push_str(&draw_line(accent, 36.0, 72.0, page_width - 72.0));

    build_pdf(page_width, page_height, &content)
}

fn build_pdf(page_width: f32, page_height: f32, content: &str) -> Result<Vec<u8>> {
    let content_stream = content.to_owned();
    let objects = vec![
        "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n".to_owned(),
        "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n".to_owned(),
        format!(
            "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 {} {}] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >> endobj\n",
            format_number(page_width),
            format_number(page_height)
        ),
        format!(
            "4 0 obj << /Length {} >> stream\n{}\nendstream endobj\n",
            content_stream.len(),
            content_stream
        ),
        "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n".to_owned(),
    ];

    let mut pdf = String::from("%PDF-1.4\n");
    let mut offsets = Vec::with_capacity(objects.len() + 1);
    offsets.push(0usize);

    for object in objects {
        offsets.push(pdf.len());
        pdf.push_str(&object);
    }

    let xref_start = pdf.len();
    pdf.push_str(&format!("xref\n0 {}\n", offsets.len()));
    pdf.push_str("0000000000 65535 f \n");
    for offset in offsets.iter().skip(1) {
        pdf.push_str(&format!("{:010} 00000 n \n", offset));
    }
    pdf.push_str(&format!(
        "trailer << /Size {} /Root 1 0 R >>\nstartxref\n{}\n%%EOF",
        offsets.len(),
        xref_start
    ));

    Ok(pdf.into_bytes())
}

fn draw_text(color: (f32, f32, f32), font_size: f32, x: f32, y: f32, text: &str) -> String {
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

fn compute_name_font_size(name: &str, layout: &template_layouts::Model) -> f32 {
    let mut size = layout.font_size.max(1) as f32;
    if layout.auto_shrink {
        let width_limit = layout.name_max_width.max(1) as f32;
        let estimated = estimate_text_width(name, size);
        if estimated > width_limit {
            let ratio = width_limit / estimated;
            size = (size * ratio).clamp(18.0, layout.font_size.max(1) as f32);
        }
    }
    size
}

fn estimate_text_width(text: &str, font_size: f32) -> f32 {
    text.chars().count() as f32 * font_size * 0.52
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

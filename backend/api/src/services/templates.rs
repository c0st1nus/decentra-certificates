use std::collections::HashMap;
use std::path::Path;

use anyhow::Context;
use chrono::Utc;
use entity::{
    certificate_templates,
    prelude::{CertificateTemplates, TemplateLayouts},
    template_layouts,
};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder, Set,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    error::AppError,
    services::{certificates, storage::StorageService},
};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TemplateLayoutData {
    pub page_width: i32,
    pub page_height: i32,
    pub name_x: i32,
    pub name_y: i32,
    pub name_max_width: i32,
    pub font_family: String,
    pub font_size: i32,
    pub font_color_hex: String,
    pub text_align: String,
    pub auto_shrink: bool,
}

#[derive(Clone, Debug, Serialize)]
pub struct TemplateSummary {
    pub id: Uuid,
    pub name: String,
    pub source_kind: String,
    pub is_active: bool,
    pub has_layout: bool,
    pub created_at: chrono::DateTime<Utc>,
    pub updated_at: chrono::DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize)]
pub struct TemplateDetail {
    pub template: TemplateSummary,
    pub layout: Option<TemplateLayoutData>,
}

pub async fn list_templates(db: &DatabaseConnection) -> Result<Vec<TemplateDetail>, AppError> {
    let templates = CertificateTemplates::find()
        .order_by_desc(certificate_templates::Column::UpdatedAt)
        .all(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;
    let layouts = TemplateLayouts::find()
        .all(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;

    let layouts_by_template_id = layouts
        .into_iter()
        .map(|layout| (layout.template_id, layout))
        .collect::<HashMap<_, _>>();

    let mut details = Vec::with_capacity(templates.len());
    for template in templates {
        let layout = layouts_by_template_id.get(&template.id);
        details.push(to_detail(template, layout));
    }

    Ok(details)
}

pub async fn get_template(db: &DatabaseConnection, id: Uuid) -> Result<TemplateDetail, AppError> {
    let template = CertificateTemplates::find_by_id(id)
        .one(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?
        .ok_or_else(|| AppError::NotFound("template not found".to_owned()))?;
    let layout = TemplateLayouts::find()
        .filter(template_layouts::Column::TemplateId.eq(id))
        .one(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;

    Ok(to_detail(template, layout.as_ref()))
}

pub async fn create_template(
    db: &DatabaseConnection,
    storage: &StorageService,
    name: String,
    source_kind: String,
    file_name: String,
    bytes: Vec<u8>,
) -> Result<TemplateDetail, AppError> {
    let template_id = Uuid::new_v4();
    let source_path = storage
        .template_file_path(&template_id.to_string(), &file_name)
        .display()
        .to_string();

    if let Some(parent) = Path::new(&source_path).parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .with_context(|| format!("failed to create template directory: {}", parent.display()))
            .map_err(AppError::Internal)?;
    }
    tokio::fs::write(&source_path, bytes)
        .await
        .with_context(|| format!("failed to write template file: {source_path}"))
        .map_err(AppError::Internal)?;

    let now = Utc::now();
    let template = certificate_templates::ActiveModel {
        id: Set(template_id),
        name: Set(name),
        source_kind: Set(source_kind),
        source_path: Set(source_path),
        preview_path: Set(None),
        is_active: Set(false),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(db)
    .await
    .map_err(|err| AppError::Internal(err.into()))?;

    save_layout(db, template.id, TemplateLayoutData::default_for_template()).await?;

    get_template(db, template.id).await
}

pub async fn update_template(
    db: &DatabaseConnection,
    storage: &StorageService,
    id: Uuid,
    name: Option<String>,
    file_name: Option<String>,
    file_bytes: Option<Vec<u8>>,
) -> Result<TemplateDetail, AppError> {
    let model = CertificateTemplates::find_by_id(id)
        .one(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?
        .ok_or_else(|| AppError::NotFound("template not found".to_owned()))?;

    let mut active_model: certificate_templates::ActiveModel = model.clone().into();
    if let Some(name) = name {
        active_model.name = Set(name);
    }

    if let Some(file_bytes) = file_bytes {
        if let Some(file_name) = file_name {
            let new_source_path = storage
                .template_file_path(&id.to_string(), &file_name)
                .display()
                .to_string();
            if let Some(parent) = Path::new(&new_source_path).parent() {
                tokio::fs::create_dir_all(parent)
                    .await
                    .with_context(|| {
                        format!("failed to create template directory: {}", parent.display())
                    })
                    .map_err(AppError::Internal)?;
            }
            tokio::fs::write(&new_source_path, file_bytes)
                .await
                .with_context(|| format!("failed to write template file: {new_source_path}"))
                .map_err(AppError::Internal)?;
            active_model.source_path = Set(new_source_path);
        } else {
            return Err(AppError::BadRequest(
                "file name is required when replacing template file".to_owned(),
            ));
        }
    }

    active_model.updated_at = Set(Utc::now());
    active_model
        .update(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;

    get_template(db, id).await
}

pub async fn activate_template(
    db: &DatabaseConnection,
    id: Uuid,
) -> Result<TemplateDetail, AppError> {
    let template = CertificateTemplates::find_by_id(id)
        .one(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?
        .ok_or_else(|| AppError::NotFound("template not found".to_owned()))?;

    let templates = CertificateTemplates::find()
        .all(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;
    for item in templates {
        let item_id = item.id;
        let mut active_model: certificate_templates::ActiveModel = item.into();
        active_model.is_active = Set(item_id == id);
        active_model.updated_at = Set(Utc::now());
        active_model
            .update(db)
            .await
            .map_err(|err| AppError::Internal(err.into()))?;
    }

    get_template(db, template.id).await
}

pub async fn delete_template(db: &DatabaseConnection, id: Uuid) -> Result<(), AppError> {
    let template = CertificateTemplates::find_by_id(id)
        .one(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?
        .ok_or_else(|| AppError::NotFound("template not found".to_owned()))?;

    if let Err(err) = tokio::fs::remove_file(&template.source_path).await
        && err.kind() != std::io::ErrorKind::NotFound
    {
        return Err(AppError::Internal(anyhow::anyhow!(
            "failed to remove template file {}: {err}",
            template.source_path
        )));
    }

    if let Some(preview_path) = template.preview_path.as_deref()
        && let Err(err) = tokio::fs::remove_file(preview_path).await
        && err.kind() != std::io::ErrorKind::NotFound
    {
        return Err(AppError::Internal(anyhow::anyhow!(
            "failed to remove template preview file {}: {err}",
            preview_path
        )));
    }

    CertificateTemplates::delete_by_id(id)
        .exec(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;

    Ok(())
}

pub async fn save_layout(
    db: &DatabaseConnection,
    template_id: Uuid,
    layout: TemplateLayoutData,
) -> Result<TemplateLayoutData, AppError> {
    let now = Utc::now();

    if let Some(existing) = TemplateLayouts::find()
        .filter(template_layouts::Column::TemplateId.eq(template_id))
        .one(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?
    {
        let mut active_model: template_layouts::ActiveModel = existing.into();
        active_model.page_width = Set(layout.page_width);
        active_model.page_height = Set(layout.page_height);
        active_model.name_x = Set(layout.name_x);
        active_model.name_y = Set(layout.name_y);
        active_model.name_max_width = Set(layout.name_max_width);
        active_model.font_family = Set(layout.font_family.clone());
        active_model.font_size = Set(layout.font_size);
        active_model.font_color_hex = Set(layout.font_color_hex.clone());
        active_model.text_align = Set(layout.text_align.clone());
        active_model.auto_shrink = Set(layout.auto_shrink);
        active_model.updated_at = Set(now);
        active_model
            .update(db)
            .await
            .map_err(|err| AppError::Internal(err.into()))?;
    } else {
        template_layouts::ActiveModel {
            id: Set(Uuid::new_v4()),
            template_id: Set(template_id),
            page_width: Set(layout.page_width),
            page_height: Set(layout.page_height),
            name_x: Set(layout.name_x),
            name_y: Set(layout.name_y),
            name_max_width: Set(layout.name_max_width),
            font_family: Set(layout.font_family.clone()),
            font_size: Set(layout.font_size),
            font_color_hex: Set(layout.font_color_hex.clone()),
            text_align: Set(layout.text_align.clone()),
            auto_shrink: Set(layout.auto_shrink),
            created_at: Set(now),
            updated_at: Set(now),
        }
        .insert(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;
    }

    Ok(layout)
}

pub async fn preview_template_pdf(
    db: &DatabaseConnection,
    storage: &StorageService,
    template_id: Uuid,
    preview_name: &str,
) -> Result<Vec<u8>, AppError> {
    let template = CertificateTemplates::find_by_id(template_id)
        .one(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?
        .ok_or_else(|| AppError::NotFound("template not found".to_owned()))?;
    let layout = TemplateLayouts::find()
        .filter(template_layouts::Column::TemplateId.eq(template_id))
        .one(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?
        .ok_or_else(|| {
            AppError::ServiceUnavailable("template layout is not configured".to_owned())
        })?;

    let participant = entity::participants::Model {
        id: Uuid::new_v4(),
        event_code: "preview".to_owned(),
        email: "preview@example.com".to_owned(),
        email_normalized: "preview@example.com".to_owned(),
        full_name: preview_name.trim().to_owned(),
        category: None,
        metadata: serde_json::json!({}),
        imported_at: Utc::now(),
        created_at: Utc::now(),
        updated_at: Utc::now(),
    };
    let issue = entity::certificate_issues::Model {
        id: Uuid::new_v4(),
        certificate_id: format!("preview-{}", template.id),
        verification_code: format!("preview-code-{}", template.id),
        participant_id: participant.id,
        template_id: template.id,
        generated_pdf_path: String::new(),
        download_count: 0,
        last_downloaded_at: None,
        created_at: Utc::now(),
    };

    let pdf = certificates::render_certificate_pdf(&participant, &template, &layout, &issue)
        .map_err(AppError::Internal)?;

    let preview_path = storage.template_preview_path(&template.id.to_string());
    if let Some(parent) = preview_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .with_context(|| format!("failed to create preview directory: {}", parent.display()))
            .map_err(AppError::Internal)?;
    }
    tokio::fs::write(&preview_path, &pdf)
        .await
        .with_context(|| {
            format!(
                "failed to write template preview: {}",
                preview_path.display()
            )
        })
        .map_err(AppError::Internal)?;

    let mut active_model: certificate_templates::ActiveModel = template.into();
    active_model.preview_path = Set(Some(preview_path.display().to_string()));
    active_model.updated_at = Set(Utc::now());
    active_model
        .update(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;

    Ok(pdf)
}

fn to_detail(
    template: certificate_templates::Model,
    layout: Option<&template_layouts::Model>,
) -> TemplateDetail {
    TemplateDetail {
        template: TemplateSummary {
            id: template.id,
            name: template.name,
            source_kind: template.source_kind,
            is_active: template.is_active,
            has_layout: layout.is_some(),
            created_at: template.created_at,
            updated_at: template.updated_at,
        },
        layout: layout.map(to_layout_data),
    }
}

fn to_layout_data(layout: &template_layouts::Model) -> TemplateLayoutData {
    TemplateLayoutData {
        page_width: layout.page_width,
        page_height: layout.page_height,
        name_x: layout.name_x,
        name_y: layout.name_y,
        name_max_width: layout.name_max_width,
        font_family: layout.font_family.clone(),
        font_size: layout.font_size,
        font_color_hex: layout.font_color_hex.clone(),
        text_align: layout.text_align.clone(),
        auto_shrink: layout.auto_shrink,
    }
}

impl TemplateLayoutData {
    pub fn default_for_template() -> Self {
        Self {
            page_width: 1920,
            page_height: 1080,
            name_x: 420,
            name_y: 520,
            name_max_width: 1080,
            font_family: "Outfit".to_owned(),
            font_size: 54,
            font_color_hex: "#111827".to_owned(),
            text_align: "center".to_owned(),
            auto_shrink: true,
        }
    }
}

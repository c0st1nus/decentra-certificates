use std::collections::HashMap;
use std::path::Path;

use anyhow::Context;
use chrono::Utc;
use entity::{
    certificate_issues, certificate_templates, participants,
    prelude::{CertificateTemplates, TemplateCategories, TemplateLayouts},
    template_categories, template_layouts,
};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, PaginatorTrait, QueryFilter,
    QueryOrder, Set,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    error::AppError,
    services::{scene_renderer, storage::StorageService},
};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TemplateLayoutData {
    pub page_width: i32,
    pub page_height: i32,
    pub name_x: i32,
    pub name_y: i32,
    pub name_max_width: i32,
    pub name_box_height: i32,
    pub font_family: String,
    pub font_size: i32,
    pub font_color_hex: String,
    pub text_align: String,
    pub vertical_align: String,
    pub auto_shrink: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub canvas: Option<TemplateCanvasData>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TemplateCanvasData {
    pub version: i32,
    pub layers: Vec<TemplateCanvasLayer>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TemplateCanvasLayer {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub role: Option<String>,
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    pub rotation: i32,
    pub opacity: i32,
    pub visible: bool,
    pub locked: bool,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<TemplateCanvasText>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub image: Option<TemplateCanvasImage>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TemplateCanvasText {
    pub content: String,
    pub binding: Option<String>,
    pub font_family: String,
    pub font_size: i32,
    pub font_color_hex: String,
    pub text_align: String,
    pub vertical_align: String,
    pub auto_shrink: bool,
    pub font_weight: i32,
    pub letter_spacing: i32,
    pub line_height: i32,
    pub background_color_hex: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TemplateCanvasImage {
    pub src: String,
    pub fit: String,
    pub border_radius: i32,
}

#[derive(Clone, Debug, Serialize)]
pub struct FontFamilyOption {
    pub label: String,
    pub value: String,
}

const FONT_FAMILY_OPTIONS: &[(&str, &str, &str)] = &[
    // Modern Google Fonts
    ("Outfit", "Outfit", "Helvetica"),
    ("Inter", "Inter", "Helvetica"),
    ("Roboto", "Roboto", "Helvetica"),
    ("Montserrat", "Montserrat", "Helvetica"),
    ("Open Sans", "Open Sans", "Helvetica"),
    ("Playfair Display", "Playfair Display", "Times-Roman"),
    ("Oswald", "Oswald", "Helvetica"),
    ("Lato", "Lato", "Helvetica"),
    ("Raleway", "Raleway", "Helvetica"),
    ("Merriweather", "Merriweather", "Times-Roman"),
    ("Nunito", "Nunito", "Helvetica"),
    ("Poppins", "Poppins", "Helvetica"),
    // System Fonts
    ("Arial", "Arial", "Helvetica"),
    ("Helvetica", "Helvetica", "Helvetica"),
    ("Helvetica Neue", "Helvetica Neue", "Helvetica"),
    ("Times New Roman", "Times New Roman", "Times-Roman"),
    ("Times", "Times", "Times-Roman"),
    ("Georgia", "Georgia", "Times-Roman"),
    ("Courier New", "Courier New", "Courier"),
    ("Courier", "Courier", "Courier"),
    ("Verdana", "Verdana", "Helvetica"),
    ("Trebuchet MS", "Trebuchet MS", "Helvetica"),
    ("Impact", "Impact", "Helvetica-Bold"),
    ("Arial Black", "Arial Black", "Helvetica-Bold"),
    ("Symbol", "Symbol", "Symbol"),
    ("Zapf Dingbats", "Zapf Dingbats", "ZapfDingbats"),
];

#[derive(Clone, Debug, Serialize)]
pub struct TemplateSummary {
    pub id: Uuid,
    pub name: String,
    pub source_kind: String,
    pub is_active: bool,
    pub has_layout: bool,
    pub category_count: u64,
    pub participant_count: u64,
    pub issued_count: u64,
    pub created_at: chrono::DateTime<Utc>,
    pub updated_at: chrono::DateTime<Utc>,
}

#[derive(Clone, Debug, Serialize)]
pub struct TemplateDetail {
    pub template: TemplateSummary,
    pub layout: Option<TemplateLayoutData>,
    pub categories: Vec<crate::services::categories::CategorySummary>,
}

#[derive(Clone, Debug, Serialize)]
pub struct TemplateStats {
    pub category_count: u64,
    pub participant_count: u64,
    pub issued_count: u64,
}

#[derive(Clone, Debug)]
pub struct TemplatePreviewAsset {
    pub bytes: Vec<u8>,
    pub content_type: String,
}

#[derive(Clone, Debug)]
pub struct StoredTemplatePreview {
    pub preview_path: String,
}

#[derive(Clone, Debug)]
pub struct TemplateSourceFile {
    pub bytes: Vec<u8>,
    pub content_type: String,
    pub file_name: String,
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
    let categories = TemplateCategories::find()
        .all(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?
        .into_iter()
        .fold(
            HashMap::<Uuid, Vec<template_categories::Model>>::new(),
            |mut acc, category| {
                acc.entry(category.template_id).or_default().push(category);
                acc
            },
        );

    let mut details = Vec::with_capacity(templates.len());
    for template in templates {
        let layout = layouts_by_template_id.get(&template.id);
        let stats = load_template_stats(db, &template).await?;
        let template_categories = categories
            .get(&template.id)
            .map(Vec::as_slice)
            .unwrap_or(&[]);
        details.push(to_detail(template, template_categories, layout, stats));
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
    let categories = TemplateCategories::find()
        .filter(template_categories::Column::TemplateId.eq(id))
        .order_by_desc(template_categories::Column::IsActive)
        .order_by_asc(template_categories::Column::Name)
        .all(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;
    let stats = load_template_stats(db, &template).await?;

    Ok(to_detail(template, &categories, layout.as_ref(), stats))
}

pub fn available_font_families() -> Vec<FontFamilyOption> {
    FONT_FAMILY_OPTIONS
        .iter()
        .map(|(label, value, _description)| FontFamilyOption {
            label: (*label).to_owned(),
            value: (*value).to_owned(),
        })
        .collect()
}

pub async fn get_template_source(
    db: &DatabaseConnection,
    storage: &StorageService,
    id: Uuid,
) -> Result<TemplateSourceFile, AppError> {
    let template = CertificateTemplates::find_by_id(id)
        .one(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?
        .ok_or_else(|| AppError::NotFound("template not found".to_owned()))?;

    let bytes = storage
        .get_object(&template.source_path)
        .await
        .map_err(|err| {
            let message = err.to_string().to_ascii_lowercase();
            if message.contains("not found")
                || message.contains("no such key")
                || message.contains("404")
            {
                AppError::NotFound("template source file not found".to_owned())
            } else {
                AppError::Internal(anyhow::anyhow!(
                    "failed to read template source object {}: {err}",
                    template.source_path
                ))
            }
        })?;

    let file_name = Path::new(&template.source_path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("template.bin")
        .to_owned();

    Ok(TemplateSourceFile {
        bytes,
        content_type: template_source_content_type(&template.source_path, &template.source_kind),
        file_name,
    })
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
    let source_key = storage.template_file_key(&template_id.to_string(), &file_name);
    let content_type = template_source_content_type(&source_key, &source_kind);

    storage
        .put_object(&source_key, bytes, Some(&content_type))
        .await
        .with_context(|| format!("failed to write template object: {source_key}"))
        .map_err(AppError::Internal)?;

    let now = Utc::now();
    let template = certificate_templates::ActiveModel {
        id: Set(template_id),
        name: Set(name),
        source_kind: Set(source_kind),
        source_path: Set(source_key),
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
    source_kind: Option<String>,
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
    if let Some(source_kind) = source_kind {
        active_model.source_kind = Set(source_kind);
    }

    if let Some(file_bytes) = file_bytes {
        if let Some(file_name) = file_name {
            let new_source_key = storage.template_file_key(&id.to_string(), &file_name);
            let effective_source_kind = active_model.source_kind.as_ref().clone();
            let content_type =
                template_source_content_type(&new_source_key, &effective_source_kind);
            storage
                .put_object(&new_source_key, file_bytes, Some(&content_type))
                .await
                .with_context(|| format!("failed to write template object: {new_source_key}"))
                .map_err(AppError::Internal)?;
            if model.source_path != new_source_key {
                storage
                    .delete_object(&model.source_path)
                    .await
                    .with_context(|| {
                        format!(
                            "failed to remove previous template object: {}",
                            model.source_path
                        )
                    })
                    .map_err(AppError::Internal)?;
            }
            active_model.source_path = Set(new_source_key);
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

pub async fn deactivate_template(
    db: &DatabaseConnection,
    id: Uuid,
) -> Result<TemplateDetail, AppError> {
    let template = CertificateTemplates::find_by_id(id)
        .one(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?
        .ok_or_else(|| AppError::NotFound("template not found".to_owned()))?;

    let mut active_model: certificate_templates::ActiveModel = template.into();
    active_model.is_active = Set(false);
    active_model.updated_at = Set(Utc::now());
    active_model
        .update(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;

    get_template(db, id).await
}

pub async fn delete_template(
    db: &DatabaseConnection,
    storage: &StorageService,
    id: Uuid,
) -> Result<(), AppError> {
    let template = CertificateTemplates::find_by_id(id)
        .one(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?
        .ok_or_else(|| AppError::NotFound("template not found".to_owned()))?;

    storage
        .delete_object(&template.source_path)
        .await
        .map_err(|err| {
            AppError::Internal(anyhow::anyhow!(
                "failed to remove template object {}: {err}",
                template.source_path
            ))
        })?;

    if let Some(preview_path) = template.preview_path.as_deref() {
        storage.delete_object(preview_path).await.map_err(|err| {
            AppError::Internal(anyhow::anyhow!(
                "failed to remove template preview object {}: {err}",
                preview_path
            ))
        })?;
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
    let canvas_data = serialize_canvas_data(layout.canvas.as_ref())?;

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
        active_model.name_box_height = Set(layout.name_box_height);
        active_model.font_family = Set(layout.font_family.clone());
        active_model.font_size = Set(layout.font_size);
        active_model.font_color_hex = Set(layout.font_color_hex.clone());
        active_model.text_align = Set(layout.text_align.clone());
        active_model.vertical_align = Set(layout.vertical_align.clone());
        active_model.auto_shrink = Set(layout.auto_shrink);
        active_model.canvas_data = Set(canvas_data.clone());
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
            name_box_height: Set(layout.name_box_height),
            font_family: Set(layout.font_family.clone()),
            font_size: Set(layout.font_size),
            font_color_hex: Set(layout.font_color_hex.clone()),
            text_align: Set(layout.text_align.clone()),
            vertical_align: Set(layout.vertical_align.clone()),
            auto_shrink: Set(layout.auto_shrink),
            canvas_data: Set(canvas_data),
            created_at: Set(now),
            updated_at: Set(now),
        }
        .insert(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;
    }

    Ok(layout)
}

pub async fn preview_template_asset(
    state: &crate::state::AppState,
    template_id: Uuid,
    preview_name: &str,
    layout_override: Option<TemplateLayoutData>,
) -> Result<TemplatePreviewAsset, AppError> {
    let (_template, png) =
        render_template_preview_png(state, template_id, preview_name, layout_override).await?;

    Ok(TemplatePreviewAsset {
        bytes: png,
        content_type: "image/png".to_owned(),
    })
}

pub async fn save_template_snapshot(
    state: &crate::state::AppState,
    template_id: Uuid,
    preview_name: &str,
    layout_override: Option<TemplateLayoutData>,
) -> Result<StoredTemplatePreview, AppError> {
    let (template, png) =
        render_template_preview_png(state, template_id, preview_name, layout_override).await?;

    let preview_key = state.storage.template_preview_key(&template.id.to_string());
    state
        .storage
        .put_object(&preview_key, png, Some("image/png"))
        .await
        .with_context(|| format!("failed to write template preview object: {preview_key}"))
        .map_err(AppError::Internal)?;

    let mut active_model: certificate_templates::ActiveModel = template.into();
    active_model.preview_path = Set(Some(preview_key.clone()));
    active_model.updated_at = Set(Utc::now());
    active_model
        .update(&state.db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;

    Ok(StoredTemplatePreview {
        preview_path: preview_key,
    })
}

async fn render_template_preview_png(
    state: &crate::state::AppState,
    template_id: Uuid,
    preview_name: &str,
    layout_override: Option<TemplateLayoutData>,
) -> Result<(certificate_templates::Model, Vec<u8>), AppError> {
    let template = CertificateTemplates::find_by_id(template_id)
        .one(&state.db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?
        .ok_or_else(|| AppError::NotFound("template not found".to_owned()))?;
    let layout = match layout_override {
        Some(layout) => layout,
        None => TemplateLayouts::find()
            .filter(template_layouts::Column::TemplateId.eq(template_id))
            .one(&state.db)
            .await
            .map_err(|err| AppError::Internal(err.into()))?
            .ok_or_else(|| {
                AppError::ServiceUnavailable("template layout is not configured".to_owned())
            })
            .map(|model| model_to_layout_data(&model))?,
    };
    let png = scene_renderer::render_scene_png(
        state,
        &template,
        &layout,
        preview_name,
        build_preview_binding_values(&template, preview_name),
    )
    .await
    .map_err(AppError::Internal)?;

    Ok((template, png))
}

fn to_detail(
    template: certificate_templates::Model,
    categories: &[template_categories::Model],
    layout: Option<&template_layouts::Model>,
    stats: TemplateStats,
) -> TemplateDetail {
    let template_name = template.name.clone();
    TemplateDetail {
        template: TemplateSummary {
            id: template.id,
            name: template.name,
            source_kind: template.source_kind,
            is_active: template.is_active,
            has_layout: layout.is_some(),
            category_count: stats.category_count,
            participant_count: stats.participant_count,
            issued_count: stats.issued_count,
            created_at: template.created_at,
            updated_at: template.updated_at,
        },
        layout: layout.map(model_to_layout_data),
        categories: categories
            .iter()
            .map(|c| crate::services::categories::to_summary(c.clone(), &template_name))
            .collect(),
    }
}

async fn load_template_stats(
    db: &DatabaseConnection,
    template: &certificate_templates::Model,
) -> Result<TemplateStats, AppError> {
    let event_code = template.id.to_string();
    let category_count = TemplateCategories::find()
        .filter(template_categories::Column::TemplateId.eq(template.id))
        .count(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;
    let participant_count = participants::Entity::find()
        .filter(participants::Column::EventCode.eq(&event_code))
        .count(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;
    let issued_count = certificate_issues::Entity::find()
        .filter(certificate_issues::Column::TemplateId.eq(template.id))
        .count(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;

    Ok(TemplateStats {
        category_count,
        participant_count,
        issued_count,
    })
}

pub fn model_to_layout_data(layout: &template_layouts::Model) -> TemplateLayoutData {
    let mut data = TemplateLayoutData {
        page_width: layout.page_width,
        page_height: layout.page_height,
        name_x: layout.name_x,
        name_y: layout.name_y,
        name_max_width: layout.name_max_width,
        name_box_height: layout.name_box_height,
        font_family: layout.font_family.clone(),
        font_size: layout.font_size,
        font_color_hex: layout.font_color_hex.clone(),
        text_align: layout.text_align.clone(),
        vertical_align: layout.vertical_align.clone(),
        auto_shrink: layout.auto_shrink,
        canvas: deserialize_canvas_data(layout.canvas_data.as_ref()),
    };
    if data.canvas.is_none() {
        data.canvas = Some(default_canvas_for_layout(&data));
    }
    data
}

impl TemplateLayoutData {
    pub fn default_for_template() -> Self {
        let mut layout = Self {
            page_width: 1920,
            page_height: 1080,
            name_x: 420,
            name_y: 520,
            name_max_width: 1080,
            name_box_height: 81,
            font_family: "Outfit".to_owned(),
            font_size: 54,
            font_color_hex: "#111827".to_owned(),
            text_align: "center".to_owned(),
            vertical_align: "center".to_owned(),
            auto_shrink: true,
            canvas: None,
        };
        layout.canvas = Some(default_canvas_for_layout(&layout));
        layout
    }
}

fn serialize_canvas_data(
    canvas: Option<&TemplateCanvasData>,
) -> Result<Option<serde_json::Value>, AppError> {
    canvas
        .map(serde_json::to_value)
        .transpose()
        .map_err(|err| AppError::Internal(err.into()))
}

fn deserialize_canvas_data(canvas: Option<&serde_json::Value>) -> Option<TemplateCanvasData> {
    canvas.and_then(|value| serde_json::from_value(value.clone()).ok())
}

pub(crate) fn default_canvas_for_layout(layout: &TemplateLayoutData) -> TemplateCanvasData {
    TemplateCanvasData {
        version: 1,
        layers: vec![TemplateCanvasLayer {
            id: "legacy-name-layer".to_owned(),
            name: "Participant name".to_owned(),
            kind: "text".to_owned(),
            role: Some("legacy_name".to_owned()),
            x: layout.name_x,
            y: layout.name_y - layout.name_box_height,
            width: layout.name_max_width,
            height: layout.name_box_height,
            rotation: 0,
            opacity: 100,
            visible: true,
            locked: false,
            text: Some(TemplateCanvasText {
                content: "{{participant.full_name}}".to_owned(),
                binding: Some("participant.full_name".to_owned()),
                font_family: layout.font_family.clone(),
                font_size: layout.font_size,
                font_color_hex: layout.font_color_hex.clone(),
                text_align: layout.text_align.clone(),
                vertical_align: layout.vertical_align.clone(),
                auto_shrink: layout.auto_shrink,
                font_weight: 500,
                letter_spacing: 0,
                line_height: 120,
                background_color_hex: None,
            }),
            image: None,
        }],
    }
}

fn template_source_content_type(source_path: &str, source_kind: &str) -> String {
    let extension = Path::new(source_path)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_lowercase();

    match extension.as_str() {
        "png" => "image/png".to_owned(),
        "jpg" | "jpeg" => "image/jpeg".to_owned(),
        "pdf" => "application/pdf".to_owned(),
        _ => match source_kind.to_lowercase().as_str() {
            "png" => "image/png".to_owned(),
            "jpg" | "jpeg" => "image/jpeg".to_owned(),
            "pdf" => "application/pdf".to_owned(),
            _ => "application/octet-stream".to_owned(),
        },
    }
}

pub fn build_preview_binding_values(
    template: &certificate_templates::Model,
    preview_name: &str,
) -> HashMap<String, String> {
    let name = preview_name.trim();
    let preview_name_value = if name.is_empty() {
        "Preview Participant"
    } else {
        name
    };

    HashMap::from([
        (
            "participant.full_name".to_owned(),
            preview_name_value.to_owned(),
        ),
        ("full_name".to_owned(), preview_name_value.to_owned()),
        ("name".to_owned(), preview_name_value.to_owned()),
        (
            "participant.category".to_owned(),
            "Preview track".to_owned(),
        ),
        ("track_name".to_owned(), "Preview track".to_owned()),
        ("template.name".to_owned(), template.name.clone()),
        ("certificate_type".to_owned(), template.name.clone()),
        (
            "issue.certificate_id".to_owned(),
            "cert-preview-0001".to_owned(),
        ),
        ("certificate_id".to_owned(), "cert-preview-0001".to_owned()),
        (
            "issue.issue_date".to_owned(),
            chrono::Utc::now().format("%Y-%m-%d").to_string(),
        ),
        (
            "issue.verification_code".to_owned(),
            "verify-preview-0001".to_owned(),
        ),
    ])
}

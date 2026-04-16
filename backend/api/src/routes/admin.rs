use std::collections::HashMap;

use actix_multipart::Multipart;
use actix_web::{HttpResponse, delete, get, patch, post, put, web};
use entity::{
    certificate_templates,
    prelude::{CertificateTemplates, Participants, TemplateLayouts},
    template_layouts,
};
use futures_util::StreamExt;
use sea_orm::{ColumnTrait, EntityTrait, PaginatorTrait, QueryFilter, QueryOrder};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;

use crate::{
    error::AppError,
    middleware::auth::AdminAuth,
    services::{
        audit,
        auth::{AuthService, RefreshTokenRequest, SessionResponse},
        participants as participant_service, settings,
        templates::{self, TemplateLayoutData},
    },
    state::AppState,
};

#[derive(Debug, Deserialize, Validate)]
pub struct LoginRequest {
    #[validate(length(min = 3))]
    pub login: String,
    #[validate(length(min = 8))]
    pub password: String,
}

#[derive(Debug, Deserialize, Validate)]
pub struct UpdateIssuanceStatusRequest {
    pub enabled: bool,
}

#[derive(Debug, Serialize)]
pub struct IssuanceStatusResponse {
    pub enabled: bool,
    pub has_active_template: bool,
    pub active_template_name: Option<String>,
    pub participant_count: u64,
    pub has_layout: bool,
    pub ready_to_enable: bool,
}

#[derive(Debug, Deserialize, Validate)]
pub struct TemplateLayoutRequest {
    pub page_width: i32,
    pub page_height: i32,
    pub name_x: i32,
    pub name_y: i32,
    pub name_max_width: i32,
    pub name_box_height: i32,
    #[validate(length(min = 1))]
    pub font_family: String,
    pub font_size: i32,
    #[validate(length(min = 4))]
    pub font_color_hex: String,
    #[validate(length(min = 1))]
    pub text_align: String,
    #[validate(length(min = 1))]
    pub vertical_align: String,
    pub auto_shrink: bool,
}

#[derive(Debug, Deserialize, Validate)]
pub struct TemplatePreviewRequest {
    pub preview_name: Option<String>,
    pub layout: Option<TemplateLayoutRequest>,
}

#[derive(Debug, Deserialize)]
pub struct ParticipantListQuery {
    pub event_code: Option<String>,
    pub email: Option<String>,
    pub category: Option<String>,
    pub page: Option<u64>,
    pub page_size: Option<u64>,
}

#[derive(Debug, Deserialize)]
pub struct DeleteParticipantsQuery {
    pub event_code: String,
}

#[derive(Default)]
struct MultipartForm {
    fields: HashMap<String, String>,
    files: Vec<UploadedFile>,
}

struct UploadedFile {
    field_name: String,
    file_name: Option<String>,
    content_type: Option<String>,
    bytes: Vec<u8>,
}

#[post("/login")]
async fn login(
    state: web::Data<AppState>,
    payload: web::Json<LoginRequest>,
) -> Result<HttpResponse, AppError> {
    payload
        .validate()
        .map_err(|err| AppError::BadRequest(err.to_string()))?;

    let response = AuthService::login(
        &state.db,
        &state.redis,
        &state.settings.jwt,
        &payload.login,
        &payload.password,
    )
    .await?;

    audit::log_admin_action(
        &state.db,
        response.admin.id,
        "admin.login",
        "admin_session",
        Some(response.admin.id.to_string()),
        serde_json::json!({
            "login": &response.admin.login,
            "role": &response.admin.role,
        }),
    )
    .await;

    Ok(HttpResponse::Ok().json(response))
}

#[post("/refresh")]
async fn refresh(
    state: web::Data<AppState>,
    payload: web::Json<RefreshTokenRequest>,
) -> Result<HttpResponse, AppError> {
    let response =
        AuthService::refresh(&state.db, &state.settings.jwt, &payload.refresh_token).await?;

    Ok(HttpResponse::Ok().json(response))
}

#[post("/logout")]
async fn logout(
    state: web::Data<AppState>,
    payload: web::Json<RefreshTokenRequest>,
    auth: AdminAuth,
) -> Result<HttpResponse, AppError> {
    AuthService::logout(&state.db, &state.settings.jwt, &payload.refresh_token).await?;
    audit::log_admin_action(
        &state.db,
        auth.0.id,
        "admin.logout",
        "admin_session",
        Some(auth.0.id.to_string()),
        serde_json::json!({
            "login": &auth.0.login,
            "role": auth.0.role.as_str(),
        }),
    )
    .await;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "status": "ok"
    })))
}

#[get("/me")]
async fn me(auth: AdminAuth) -> Result<HttpResponse, AppError> {
    Ok(HttpResponse::Ok().json(SessionResponse {
        admin: crate::services::auth::AdminProfile {
            id: auth.0.id,
            login: auth.0.login,
            role: auth.0.role.as_str().to_owned(),
        },
    }))
}

#[get("/issuance/status")]
async fn get_issuance_status(state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    let status = issuance_status(&state).await?;
    Ok(HttpResponse::Ok().json(status))
}

#[patch("/issuance/status")]
async fn update_issuance_status(
    state: web::Data<AppState>,
    auth: AdminAuth,
    payload: web::Json<UpdateIssuanceStatusRequest>,
) -> Result<HttpResponse, AppError> {
    auth.require_role(crate::services::auth::AdminRole::SuperAdmin)?;

    let status = issuance_status(&state).await?;
    if payload.enabled && !status.enabled && !status.ready_to_enable {
        return Err(AppError::ServiceUnavailable(
            "system is not ready for issuance".to_owned(),
        ));
    }

    let issuance = settings::update_issuance_setting(&state.db, payload.enabled)
        .await
        .map_err(AppError::Internal)?;

    audit::log_admin_action(
        &state.db,
        auth.0.id,
        "issuance.update",
        "issuance_setting",
        Some("issuance_enabled".to_owned()),
        serde_json::json!({
            "enabled": issuance.enabled,
            "ready_to_enable": status.ready_to_enable,
            "has_active_template": status.has_active_template,
            "participant_count": status.participant_count,
            "has_layout": status.has_layout,
        }),
    )
    .await;

    Ok(HttpResponse::Ok().json(IssuanceStatusResponse {
        enabled: issuance.enabled,
        has_active_template: status.has_active_template,
        active_template_name: status.active_template_name,
        participant_count: status.participant_count,
        has_layout: status.has_layout,
        ready_to_enable: status.ready_to_enable,
    }))
}

#[get("/templates")]
async fn list_templates(state: web::Data<AppState>) -> Result<HttpResponse, AppError> {
    let templates = templates::list_templates(&state.db).await?;
    Ok(HttpResponse::Ok().json(templates))
}

#[post("/templates")]
async fn create_template(
    state: web::Data<AppState>,
    auth: AdminAuth,
    payload: Multipart,
) -> Result<HttpResponse, AppError> {
    let form = collect_multipart(payload).await?;
    let name = required_field(&form.fields, "name")?.to_owned();
    let file = required_file(&form.files, "file")?;
    let file_name = file
        .file_name
        .clone()
        .ok_or_else(|| AppError::BadRequest("template file name is required".to_owned()))?;
    let source_kind = infer_source_kind(
        form.fields.get("source_kind").map(String::as_str),
        file.content_type.as_deref(),
        &file_name,
    )?;

    let template = templates::create_template(
        &state.db,
        &state.storage,
        name,
        source_kind,
        file_name,
        file.bytes.clone(),
    )
    .await?;

    audit::log_admin_action(
        &state.db,
        auth.0.id,
        "template.create",
        "certificate_template",
        Some(template.template.id.to_string()),
        serde_json::json!({
            "name": &template.template.name,
            "source_kind": &template.template.source_kind,
            "has_layout": template.layout.is_some(),
        }),
    )
    .await;

    Ok(HttpResponse::Ok().json(template))
}

#[get("/templates/{id}")]
async fn get_template(
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let template = templates::get_template(&state.db, path.into_inner()).await?;
    Ok(HttpResponse::Ok().json(template))
}

#[get("/templates/{id}/source")]
async fn get_template_source(
    state: web::Data<AppState>,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let source =
        templates::get_template_source(&state.db, &state.storage, path.into_inner()).await?;
    Ok(HttpResponse::Ok()
        .insert_header(("Content-Type", source.content_type))
        .insert_header((
            "Content-Disposition",
            format!("inline; filename=\"{}\"", source.file_name),
        ))
        .insert_header(("Cache-Control", "no-store"))
        .body(source.bytes))
}

#[patch("/templates/{id}")]
async fn update_template(
    state: web::Data<AppState>,
    auth: AdminAuth,
    path: web::Path<Uuid>,
    payload: Multipart,
) -> Result<HttpResponse, AppError> {
    let form = collect_multipart(payload).await?;
    let template_id = path.into_inner();
    let template = templates::update_template(
        &state.db,
        &state.storage,
        template_id,
        form.fields.get("name").cloned(),
        required_file(&form.files, "file")
            .ok()
            .and_then(|file| file.file_name.clone()),
        required_file(&form.files, "file")
            .ok()
            .map(|file| file.bytes.clone()),
    )
    .await?;

    audit::log_admin_action(
        &state.db,
        auth.0.id,
        "template.update",
        "certificate_template",
        Some(template.template.id.to_string()),
        serde_json::json!({
            "name": &template.template.name,
            "source_kind": &template.template.source_kind,
            "has_layout": template.layout.is_some(),
        }),
    )
    .await;

    Ok(HttpResponse::Ok().json(template))
}

#[post("/templates/{id}/activate")]
async fn activate_template(
    state: web::Data<AppState>,
    auth: AdminAuth,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let template = templates::activate_template(&state.db, path.into_inner()).await?;
    audit::log_admin_action(
        &state.db,
        auth.0.id,
        "template.activate",
        "certificate_template",
        Some(template.template.id.to_string()),
        serde_json::json!({
            "name": &template.template.name,
            "is_active": template.template.is_active,
        }),
    )
    .await;
    Ok(HttpResponse::Ok().json(template))
}

#[delete("/templates/{id}")]
async fn delete_template(
    state: web::Data<AppState>,
    auth: AdminAuth,
    path: web::Path<Uuid>,
) -> Result<HttpResponse, AppError> {
    let template_id = path.into_inner();
    templates::delete_template(&state.db, &state.storage, template_id).await?;
    audit::log_admin_action(
        &state.db,
        auth.0.id,
        "template.delete",
        "certificate_template",
        Some(template_id.to_string()),
        serde_json::json!({}),
    )
    .await;
    Ok(HttpResponse::Ok().json(serde_json::json!({ "status": "ok" })))
}

#[put("/templates/{id}/layout")]
async fn save_template_layout(
    state: web::Data<AppState>,
    auth: AdminAuth,
    path: web::Path<Uuid>,
    payload: web::Json<TemplateLayoutRequest>,
) -> Result<HttpResponse, AppError> {
    let template_id = path.into_inner();
    payload
        .validate()
        .map_err(|err| AppError::BadRequest(err.to_string()))?;

    let layout = templates::save_layout(
        &state.db,
        template_id,
        TemplateLayoutData {
            page_width: payload.page_width,
            page_height: payload.page_height,
            name_x: payload.name_x,
            name_y: payload.name_y,
            name_max_width: payload.name_max_width,
            name_box_height: payload.name_box_height,
            font_family: payload.font_family.clone(),
            font_size: payload.font_size,
            font_color_hex: payload.font_color_hex.clone(),
            text_align: payload.text_align.clone(),
            vertical_align: payload.vertical_align.clone(),
            auto_shrink: payload.auto_shrink,
        },
    )
    .await?;

    audit::log_admin_action(
        &state.db,
        auth.0.id,
        "template.layout.update",
        "template_layout",
        Some(template_id.to_string()),
        serde_json::json!({
            "page_width": layout.page_width,
            "page_height": layout.page_height,
            "name_x": layout.name_x,
            "name_y": layout.name_y,
            "name_max_width": layout.name_max_width,
            "name_box_height": layout.name_box_height,
            "font_family": &layout.font_family,
            "font_size": layout.font_size,
            "text_align": &layout.text_align,
            "vertical_align": &layout.vertical_align,
            "auto_shrink": layout.auto_shrink,
        }),
    )
    .await;

    Ok(HttpResponse::Ok().json(layout))
}

#[post("/templates/{id}/preview")]
async fn preview_template(
    state: web::Data<AppState>,
    auth: AdminAuth,
    path: web::Path<Uuid>,
    payload: web::Json<TemplatePreviewRequest>,
) -> Result<HttpResponse, AppError> {
    let template_id = path.into_inner();
    let preview_name = payload
        .preview_name
        .as_deref()
        .unwrap_or("Preview Participant");
    let preview = templates::preview_template_pdf(
        &state,
        template_id,
        preview_name,
        payload
            .layout
            .as_ref()
            .map(|layout| templates::TemplateLayoutData {
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
            }),
    )
    .await?;
    let diagnostics_header =
        serde_json::to_string(&preview.diagnostics).map_err(|err| AppError::Internal(err.into()))?;

    audit::log_admin_action(
        &state.db,
        auth.0.id,
        "template.preview",
        "certificate_template",
        Some(template_id.to_string()),
        serde_json::json!({
            "preview_name": preview_name,
        }),
    )
    .await;

    Ok(HttpResponse::Ok()
        .insert_header(("Content-Type", "application/pdf"))
        .insert_header((
            "Content-Disposition",
            "inline; filename=\"template-preview.pdf\"",
        ))
        .insert_header(("X-Template-Preview-Diagnostics", diagnostics_header))
        .body(preview.pdf))
}

#[post("/participants/import")]
async fn import_participants(
    state: web::Data<AppState>,
    auth: AdminAuth,
    payload: Multipart,
) -> Result<HttpResponse, AppError> {
    let form = collect_multipart(payload).await?;
    let file = required_file(&form.files, "file")?;
    let default_event_code = form
        .fields
        .get("event_code")
        .cloned()
        .unwrap_or_else(|| "main".to_owned());

    if !is_supported_participant_import(file.file_name.as_deref(), file.content_type.as_deref()) {
        return Err(AppError::BadRequest(
            "participant imports currently support CSV and XLSX files".to_owned(),
        ));
    }

    let result = if is_xlsx_file(file.file_name.as_deref(), file.content_type.as_deref()) {
        participant_service::import_xlsx(&state.db, &file.bytes, &default_event_code).await?
    } else {
        participant_service::import_csv(&state.db, &file.bytes, &default_event_code).await?
    };

    audit::log_admin_action(
        &state.db,
        auth.0.id,
        "participants.import",
        "participants",
        Some(default_event_code.clone()),
        serde_json::json!({
            "event_code": default_event_code,
            "total_rows": result.total_rows,
            "inserted": result.inserted,
            "updated": result.updated,
            "skipped": result.skipped,
            "errors": result.errors.len(),
        }),
    )
    .await;
    Ok(HttpResponse::Ok().json(result))
}

#[get("/participants")]
async fn list_participants(
    state: web::Data<AppState>,
    query: web::Query<ParticipantListQuery>,
) -> Result<HttpResponse, AppError> {
    let response = participant_service::list_participants(
        &state.db,
        query.event_code.clone(),
        query.email.clone(),
        query.category.clone(),
        query.page.unwrap_or(1),
        query.page_size.unwrap_or(20),
    )
    .await?;

    Ok(HttpResponse::Ok().json(response))
}

#[delete("/participants")]
async fn delete_participants(
    state: web::Data<AppState>,
    auth: AdminAuth,
    query: web::Query<DeleteParticipantsQuery>,
) -> Result<HttpResponse, AppError> {
    let deleted = participant_service::delete_participants(&state.db, &query.event_code).await?;
    audit::log_admin_action(
        &state.db,
        auth.0.id,
        "participants.delete",
        "participants",
        Some(query.event_code.clone()),
        serde_json::json!({
            "event_code": &query.event_code,
            "deleted": deleted,
        }),
    )
    .await;
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "status": "ok",
        "deleted": deleted
    })))
}

#[get("/fonts")]
async fn list_fonts() -> Result<HttpResponse, AppError> {
    Ok(HttpResponse::Ok().json(templates::available_font_families()))
}

pub fn configure_public_auth(cfg: &mut web::ServiceConfig) {
    cfg.service(login).service(refresh);
}

pub fn configure_protected(cfg: &mut web::ServiceConfig) {
    cfg.service(logout)
        .service(me)
        .service(get_issuance_status)
        .service(update_issuance_status)
        .service(list_templates)
        .service(create_template)
        .service(get_template)
        .service(get_template_source)
        .service(update_template)
        .service(activate_template)
        .service(delete_template)
        .service(save_template_layout)
        .service(preview_template)
        .service(list_fonts)
        .service(import_participants)
        .service(list_participants)
        .service(delete_participants);
}

async fn collect_multipart(mut payload: Multipart) -> Result<MultipartForm, AppError> {
    let mut form = MultipartForm::default();

    while let Some(item) = payload.next().await {
        let mut field =
            item.map_err(|err| AppError::BadRequest(format!("invalid multipart body: {err}")))?;
        let disposition = field.content_disposition().cloned().ok_or_else(|| {
            AppError::BadRequest("multipart field is missing disposition".to_owned())
        })?;
        let field_name = disposition
            .get_name()
            .map(ToOwned::to_owned)
            .ok_or_else(|| AppError::BadRequest("multipart field is missing name".to_owned()))?;
        let file_name = disposition.get_filename().map(ToOwned::to_owned);
        let content_type = field.content_type().map(|value| value.to_string());
        let mut bytes = Vec::new();

        while let Some(chunk) = field.next().await {
            let chunk = chunk.map_err(|err| {
                AppError::BadRequest(format!(
                    "failed to read multipart field `{field_name}`: {err}"
                ))
            })?;
            bytes.extend_from_slice(&chunk);
        }

        if file_name.is_some() {
            form.files.push(UploadedFile {
                field_name,
                file_name,
                content_type,
                bytes,
            });
            continue;
        }

        let value = String::from_utf8(bytes).map_err(|_| {
            AppError::BadRequest(format!("multipart field `{field_name}` is not valid utf-8"))
        })?;
        form.fields.insert(field_name, value.trim().to_owned());
    }

    Ok(form)
}

fn required_field<'a>(
    fields: &'a HashMap<String, String>,
    name: &str,
) -> Result<&'a str, AppError> {
    fields
        .get(name)
        .map(String::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::BadRequest(format!("missing required field `{name}`")))
}

fn required_file<'a>(
    files: &'a [UploadedFile],
    field_name: &str,
) -> Result<&'a UploadedFile, AppError> {
    files
        .iter()
        .find(|file| file.field_name == field_name)
        .ok_or_else(|| AppError::BadRequest(format!("missing required file `{field_name}`")))
}

fn infer_source_kind(
    explicit_source_kind: Option<&str>,
    content_type: Option<&str>,
    file_name: &str,
) -> Result<String, AppError> {
    if let Some(source_kind) = explicit_source_kind.filter(|value| !value.is_empty()) {
        return Ok(source_kind.to_lowercase());
    }

    let extension = std::path::Path::new(file_name)
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_lowercase();

    let inferred = match extension.as_str() {
        "png" => "png",
        "jpg" | "jpeg" => "jpeg",
        "pdf" => "pdf",
        _ => match content_type.unwrap_or("") {
            "image/png" => "png",
            "image/jpeg" => "jpeg",
            "application/pdf" => "pdf",
            _ => "",
        },
    };

    if inferred.is_empty() {
        return Err(AppError::BadRequest(
            "template file must be PNG, JPG, JPEG or PDF".to_owned(),
        ));
    }

    Ok(inferred.to_owned())
}

fn is_supported_participant_import(file_name: Option<&str>, content_type: Option<&str>) -> bool {
    is_csv_file(file_name, content_type) || is_xlsx_file(file_name, content_type)
}

fn is_csv_file(file_name: Option<&str>, content_type: Option<&str>) -> bool {
    match file_name
        .and_then(|value| std::path::Path::new(value).extension())
        .and_then(|value| value.to_str())
        .map(|value| value.to_lowercase())
    {
        Some(extension) if extension == "csv" => true,
        _ => matches!(content_type, Some("text/csv") | Some("application/csv")),
    }
}

fn is_xlsx_file(file_name: Option<&str>, content_type: Option<&str>) -> bool {
    match file_name
        .and_then(|value| std::path::Path::new(value).extension())
        .and_then(|value| value.to_str())
        .map(|value| value.to_lowercase())
    {
        Some(extension) if extension == "xlsx" => true,
        _ => matches!(
            content_type,
            Some("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        ),
    }
}

async fn issuance_status(state: &AppState) -> Result<IssuanceStatusResponse, AppError> {
    let issuance =
        settings::get_issuance_setting(&state.db, state.settings.issuance_enabled_default)
            .await
            .map_err(AppError::Internal)?;
    let participant_count = Participants::find()
        .count(&state.db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;
    let active_template = CertificateTemplates::find()
        .filter(certificate_templates::Column::IsActive.eq(true))
        .order_by_desc(certificate_templates::Column::UpdatedAt)
        .one(&state.db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;
    let has_layout = if let Some(template) = &active_template {
        TemplateLayouts::find()
            .filter(template_layouts::Column::TemplateId.eq(template.id))
            .one(&state.db)
            .await
            .map_err(|err| AppError::Internal(err.into()))?
            .is_some()
    } else {
        false
    };
    let ready_to_enable = active_template.is_some() && has_layout && participant_count > 0;

    Ok(IssuanceStatusResponse {
        enabled: issuance.enabled,
        has_active_template: active_template.is_some(),
        active_template_name: active_template.map(|template| template.name),
        participant_count,
        has_layout,
        ready_to_enable,
    })
}

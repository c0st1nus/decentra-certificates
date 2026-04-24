use std::collections::HashMap;

use actix_multipart::Multipart;
use futures_util::StreamExt;

use crate::error::AppError;

#[derive(Default)]
pub struct MultipartForm {
    pub fields: HashMap<String, String>,
    pub files: Vec<UploadedFile>,
}

pub struct UploadedFile {
    pub field_name: String,
    pub file_name: Option<String>,
    pub content_type: Option<String>,
    pub bytes: Vec<u8>,
}

pub async fn collect_multipart(mut payload: Multipart) -> Result<MultipartForm, AppError> {
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

pub fn required_field<'a>(
    fields: &'a HashMap<String, String>,
    name: &str,
) -> Result<&'a str, AppError> {
    fields
        .get(name)
        .map(String::as_str)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::BadRequest(format!("missing required field `{name}`")))
}

pub fn required_file<'a>(
    files: &'a [UploadedFile],
    field_name: &str,
) -> Result<&'a UploadedFile, AppError> {
    files
        .iter()
        .find(|file| file.field_name == field_name)
        .ok_or_else(|| AppError::BadRequest(format!("missing required file `{field_name}`")))
}

pub fn infer_source_kind(
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

pub fn is_supported_participant_import(
    file_name: Option<&str>,
    content_type: Option<&str>,
) -> bool {
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

pub fn is_xlsx_file(file_name: Option<&str>, content_type: Option<&str>) -> bool {
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

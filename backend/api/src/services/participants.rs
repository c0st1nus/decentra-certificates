use std::collections::{HashMap, HashSet};
use std::io::Cursor;

use calamine::{Data, Reader, open_workbook_auto_from_rs};
use chrono::Utc;
use entity::{participants, prelude::Participants};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, PaginatorTrait, QueryFilter,
    QueryOrder, Set,
};
use serde::Serialize;
use uuid::Uuid;

use crate::{
    error::AppError,
    services::{categories as category_service, normalization::normalize_email},
};

#[derive(Clone, Debug, Serialize)]
pub struct ParticipantSummary {
    pub id: Uuid,
    pub event_code: String,
    pub email: String,
    pub full_name: String,
    pub category: Option<String>,
    pub imported_at: chrono::DateTime<Utc>,
    pub certificate_status: String,
    pub certificate_id: Option<String>,
    pub attempts: Option<i32>,
    pub last_error: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
pub struct ParticipantListResponse {
    pub items: Vec<ParticipantSummary>,
    pub total: u64,
    pub page: u64,
    pub page_size: u64,
}

#[derive(Clone, Debug, Serialize)]
pub struct ImportError {
    pub row_number: usize,
    pub email: String,
    pub message: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct ImportResponse {
    pub total_rows: u64,
    pub inserted: u64,
    pub updated: u64,
    pub skipped: u64,
    pub created_categories: Vec<String>,
    pub errors: Vec<ImportError>,
    #[serde(skip_serializing)]
    pub affected_participant_ids: Vec<Uuid>,
}

#[derive(Clone, Debug)]
pub struct UpdateParticipantInput {
    pub full_name: String,
    pub category: Option<String>,
}

#[derive(Clone, Debug)]
pub struct UpdateParticipantResult {
    pub content_changed: bool,
    pub event_code: String,
}

#[derive(Clone, Debug)]
struct ImportRow {
    event_code: String,
    email: String,
    email_normalized: String,
    full_name: String,
    category: Option<String>,
    metadata: serde_json::Value,
}

pub async fn list_participants(
    db: &DatabaseConnection,
    event_code: Option<String>,
    email: Option<String>,
    category: Option<String>,
    page: u64,
    page_size: u64,
) -> Result<ParticipantListResponse, AppError> {
    let page = page.max(1);
    let page_size = page_size.clamp(1, 100);
    let mut query = Participants::find();

    if let Some(event_code) = event_code {
        query = query.filter(participants::Column::EventCode.eq(event_code));
    }
    if let Some(email) = email {
        let normalized = normalize_email(&email);
        query = query.filter(participants::Column::EmailNormalized.contains(normalized));
    }
    if let Some(category) = category {
        query = query.filter(participants::Column::Category.eq(category));
    }

    let paginator = query
        .order_by_desc(participants::Column::ImportedAt)
        .paginate(db, page_size);
    let total = paginator
        .num_items()
        .await
        .map_err(|err| AppError::Internal(err.into()))?;
    let items = paginator
        .fetch_page(page.saturating_sub(1))
        .await
        .map_err(|err| AppError::Internal(err.into()))?;

    let participant_ids: Vec<Uuid> = items.iter().map(|p| p.id).collect();
    let issues = if participant_ids.is_empty() {
        vec![]
    } else {
        entity::certificate_issues::Entity::find()
            .filter(entity::certificate_issues::Column::ParticipantId.is_in(participant_ids))
            .all(db)
            .await
            .map_err(|err| AppError::Internal(err.into()))?
    };
    let issue_map: HashMap<Uuid, &entity::certificate_issues::Model> = issues
        .iter()
        .map(|issue| (issue.participant_id, issue))
        .collect();

    Ok(ParticipantListResponse {
        items: items
            .into_iter()
            .map(|p| to_summary(&p, issue_map.get(&p.id).copied()))
            .collect(),
        total,
        page,
        page_size,
    })
}

pub async fn delete_participants(
    db: &DatabaseConnection,
    event_code: &str,
) -> Result<u64, AppError> {
    let result = Participants::delete_many()
        .filter(participants::Column::EventCode.eq(event_code))
        .exec(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;

    Ok(result.rows_affected)
}

pub async fn get_participant(
    db: &DatabaseConnection,
    id: Uuid,
) -> Result<ParticipantSummary, AppError> {
    let model = Participants::find_by_id(id)
        .one(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?
        .ok_or_else(|| AppError::NotFound("participant not found".to_owned()))?;
    let issue = entity::certificate_issues::Entity::find()
        .filter(entity::certificate_issues::Column::ParticipantId.eq(model.id))
        .one(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;

    Ok(to_summary(&model, issue.as_ref()))
}

pub async fn update_participant(
    db: &DatabaseConnection,
    id: Uuid,
    input: UpdateParticipantInput,
) -> Result<UpdateParticipantResult, AppError> {
    let model = Participants::find_by_id(id)
        .one(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?
        .ok_or_else(|| AppError::NotFound("participant not found".to_owned()))?;

    let full_name = normalize_required_text(&input.full_name, "full_name")?;
    let category = normalize_optional_text(input.category);

    if let Some(category_name) = category.as_deref()
        && model.category.as_deref() != Some(category_name)
        && let Ok(template_id) = Uuid::parse_str(&model.event_code)
        && !category_service::category_exists_by_name(db, template_id, category_name).await?
    {
        return Err(AppError::BadRequest(
            "category does not exist for this template".to_owned(),
        ));
    }

    let content_changed = model.full_name != full_name || model.category != category;
    let event_code = model.event_code.clone();
    let mut active_model: participants::ActiveModel = model.into();
    active_model.full_name = Set(full_name);
    active_model.category = Set(category);
    active_model.updated_at = Set(Utc::now());

    active_model
        .update(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;

    Ok(UpdateParticipantResult {
        content_changed,
        event_code,
    })
}

pub async fn import_csv(
    db: &DatabaseConnection,
    bytes: &[u8],
    default_event_code: &str,
) -> Result<ImportResponse, AppError> {
    let mut reader = csv::ReaderBuilder::new()
        .trim(csv::Trim::All)
        .flexible(true)
        .from_reader(bytes);
    let headers = reader
        .headers()
        .map_err(|err| AppError::BadRequest(format!("invalid csv headers: {err}")))?
        .clone();

    let mut seen = HashSet::new();
    let mut parsed_rows = Vec::new();
    let mut errors = Vec::new();
    let mut total_rows = 0u64;
    let mut row_number = 1usize;

    for record in reader.records() {
        row_number += 1;
        total_rows += 1;
        let record = record
            .map_err(|err| AppError::BadRequest(format!("invalid csv row {row_number}: {err}")))?;
        if record.iter().all(|value| value.trim().is_empty()) {
            continue;
        }

        match parse_csv_row(&headers, &record, default_event_code) {
            Ok(Some(row)) => {
                let key = (row.event_code.clone(), row.email_normalized.clone());
                if !seen.insert(key) {
                    errors.push(ImportError {
                        row_number,
                        email: row.email.clone(),
                        message: "duplicate row in import file".to_owned(),
                    });
                    continue;
                }

                parsed_rows.push((row_number, row));
            }
            Ok(None) => {}
            Err(error) => errors.push(ImportError {
                row_number,
                email: String::new(),
                message: error.to_string(),
            }),
        }
    }

    import_rows(db, parsed_rows, total_rows, errors).await
}

pub async fn import_xlsx(
    db: &DatabaseConnection,
    bytes: &[u8],
    default_event_code: &str,
) -> Result<ImportResponse, AppError> {
    let cursor = Cursor::new(bytes.to_vec());
    let mut workbook = open_workbook_auto_from_rs(cursor)
        .map_err(|err| AppError::BadRequest(format!("invalid xlsx workbook: {err}")))?;
    let sheet_name = workbook
        .sheet_names()
        .first()
        .cloned()
        .ok_or_else(|| AppError::BadRequest("xlsx workbook has no worksheets".to_owned()))?;
    let range = workbook
        .worksheet_range(&sheet_name)
        .map_err(|err| AppError::BadRequest(format!("failed to read xlsx worksheet: {err}")))?;

    let mut rows = range.rows();
    let headers = rows
        .next()
        .ok_or_else(|| AppError::BadRequest("xlsx sheet is empty".to_owned()))?
        .iter()
        .map(cell_to_string)
        .collect::<Vec<_>>();

    if headers.iter().all(|value| value.trim().is_empty()) {
        return Err(AppError::BadRequest(
            "xlsx file is missing a header row".to_owned(),
        ));
    }

    let mut seen = HashSet::new();
    let mut parsed_rows = Vec::new();
    let mut errors = Vec::new();
    let mut total_rows = 0u64;
    let mut row_number = 1usize;

    for row in rows {
        row_number += 1;
        total_rows += 1;
        let values = row.iter().map(cell_to_string).collect::<Vec<_>>();
        if values.iter().all(|value| value.trim().is_empty()) {
            continue;
        }

        match parse_row_from_cells(&headers, &values, default_event_code) {
            Ok(Some(row)) => {
                let key = (row.event_code.clone(), row.email_normalized.clone());
                if !seen.insert(key) {
                    errors.push(ImportError {
                        row_number,
                        email: row.email.clone(),
                        message: "duplicate row in import file".to_owned(),
                    });
                    continue;
                }

                parsed_rows.push((row_number, row));
            }
            Ok(None) => {}
            Err(error) => errors.push(ImportError {
                row_number,
                email: String::new(),
                message: error.to_string(),
            }),
        }
    }

    import_rows(db, parsed_rows, total_rows, errors).await
}

async fn import_rows(
    db: &DatabaseConnection,
    rows: Vec<(usize, ImportRow)>,
    total_rows: u64,
    errors: Vec<ImportError>,
) -> Result<ImportResponse, AppError> {
    let mut inserted = 0u64;
    let mut updated = 0u64;
    let mut affected_participant_ids = Vec::with_capacity(rows.len());
    let created_categories = ensure_import_categories(db, &rows).await?;

    for (_, row) in rows {
        let existing = Participants::find()
            .filter(participants::Column::EventCode.eq(&row.event_code))
            .filter(participants::Column::EmailNormalized.eq(&row.email_normalized))
            .one(db)
            .await
            .map_err(|err| AppError::Internal(err.into()))?;

        if let Some(model) = existing {
            let participant_id = model.id;
            let mut active_model: participants::ActiveModel = model.into();
            active_model.email = Set(row.email.clone());
            active_model.email_normalized = Set(row.email_normalized.clone());
            active_model.full_name = Set(row.full_name.clone());
            active_model.category = Set(row.category.clone());
            active_model.metadata = Set(row.metadata.clone());
            active_model.updated_at = Set(Utc::now());
            active_model
                .update(db)
                .await
                .map_err(|err| AppError::Internal(err.into()))?;
            updated += 1;
            affected_participant_ids.push(participant_id);
        } else {
            let model = participants::ActiveModel {
                id: Set(Uuid::new_v4()),
                event_code: Set(row.event_code.clone()),
                email: Set(row.email.clone()),
                email_normalized: Set(row.email_normalized.clone()),
                full_name: Set(row.full_name.clone()),
                category: Set(row.category.clone()),
                metadata: Set(row.metadata.clone()),
                imported_at: Set(Utc::now()),
                created_at: Set(Utc::now()),
                updated_at: Set(Utc::now()),
            }
            .insert(db)
            .await
            .map_err(|err| AppError::Internal(err.into()))?;
            inserted += 1;
            affected_participant_ids.push(model.id);
        }
    }

    let skipped = total_rows.saturating_sub(inserted + updated + errors.len() as u64);

    Ok(ImportResponse {
        total_rows,
        inserted,
        updated,
        skipped,
        created_categories,
        errors,
        affected_participant_ids,
    })
}

async fn ensure_import_categories(
    db: &DatabaseConnection,
    rows: &[(usize, ImportRow)],
) -> Result<Vec<String>, AppError> {
    let mut categories_by_template: HashMap<Uuid, Vec<String>> = HashMap::new();

    for (_, row) in rows {
        let Some(category) = row.category.as_ref() else {
            continue;
        };
        let Ok(template_id) = Uuid::parse_str(&row.event_code) else {
            continue;
        };
        categories_by_template
            .entry(template_id)
            .or_default()
            .push(category.clone());
    }

    let mut created = Vec::new();
    for (template_id, names) in categories_by_template {
        created.extend(
            category_service::ensure_categories_for_template(db, template_id, names)
                .await?
                .into_iter()
                .map(|category| category.name),
        );
    }

    created.sort();
    created.dedup();
    Ok(created)
}

fn parse_csv_row(
    headers: &csv::StringRecord,
    record: &csv::StringRecord,
    default_event_code: &str,
) -> Result<Option<ImportRow>, AppError> {
    let headers = headers
        .iter()
        .map(|value| value.trim().to_owned())
        .collect::<Vec<_>>();
    let values = record
        .iter()
        .map(|value| value.trim().to_owned())
        .collect::<Vec<_>>();

    parse_row_from_cells(&headers, &values, default_event_code)
}

fn parse_row_from_cells(
    headers: &[String],
    values: &[String],
    default_event_code: &str,
) -> Result<Option<ImportRow>, AppError> {
    if values.iter().all(|value| value.trim().is_empty()) {
        return Ok(None);
    }

    let mut row = HashMap::new();
    for (header, value) in headers.iter().zip(values.iter()) {
        row.insert(header.trim().to_lowercase(), value.trim().to_owned());
    }

    let email = row
        .get("email")
        .filter(|value| !value.is_empty())
        .cloned()
        .ok_or_else(|| AppError::BadRequest("csv row is missing `email`".to_owned()))?;
    let full_name = row
        .get("full_name")
        .or_else(|| row.get("fullname"))
        .filter(|value| !value.is_empty())
        .cloned()
        .ok_or_else(|| AppError::BadRequest("csv row is missing `full_name`".to_owned()))?;

    let event_code = row
        .get("event_code")
        .filter(|value| !value.is_empty())
        .cloned()
        .unwrap_or_else(|| default_event_code.to_owned());
    let category = row
        .get("category")
        .filter(|value| !value.is_empty())
        .cloned();

    let mut metadata = serde_json::Map::new();
    if let Some(raw_metadata) = row.get("metadata").filter(|value| !value.is_empty())
        && let Ok(value) = serde_json::from_str::<serde_json::Value>(raw_metadata)
        && let Some(object) = value.as_object()
    {
        for (key, value) in object {
            metadata.insert(key.clone(), value.clone());
        }
    }

    for (key, value) in row {
        if matches!(
            key.as_str(),
            "email" | "full_name" | "fullname" | "event_code" | "category" | "metadata"
        ) {
            continue;
        }
        if !value.is_empty() {
            metadata.insert(key, serde_json::Value::String(value));
        }
    }

    Ok(Some(ImportRow {
        event_code,
        email: email.clone(),
        email_normalized: normalize_email(&email),
        full_name,
        category,
        metadata: serde_json::Value::Object(metadata),
    }))
}

fn cell_to_string(cell: &Data) -> String {
    cell.to_string().trim().to_owned()
}

fn normalize_required_text(value: &str, field: &str) -> Result<String, AppError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(AppError::BadRequest(format!("{field} is required")));
    }

    Ok(trimmed.to_owned())
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value.and_then(|text| {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_owned())
        }
    })
}

fn to_summary(
    model: &participants::Model,
    issue: Option<&entity::certificate_issues::Model>,
) -> ParticipantSummary {
    let (status, cert_id, attempts, last_error) = match issue {
        Some(i) => (
            i.status.clone(),
            Some(i.certificate_id.clone()),
            Some(i.attempts),
            i.error_message.clone(),
        ),
        None => ("not_created".to_owned(), None, None, None),
    };
    ParticipantSummary {
        id: model.id,
        event_code: model.event_code.clone(),
        email: model.email.clone(),
        full_name: model.full_name.clone(),
        category: model.category.clone(),
        imported_at: model.imported_at,
        certificate_status: status,
        certificate_id: cert_id,
        attempts,
        last_error,
    }
}

#[cfg(test)]
mod tests {
    use super::parse_row_from_cells;

    #[test]
    fn keeps_extra_import_columns_in_metadata() {
        let headers = vec![
            "email".to_owned(),
            "full_name".to_owned(),
            "track_name".to_owned(),
            "certificate_type".to_owned(),
            "issue_date".to_owned(),
        ];
        let values = vec![
            "aigerim.sadykova@gmail.com".to_owned(),
            "Aigerim Sadykova".to_owned(),
            "AI Track".to_owned(),
            "Participant".to_owned(),
            "2026-04-20".to_owned(),
        ];

        let parsed = parse_row_from_cells(&headers, &values, "main")
            .expect("row should parse")
            .expect("row should not be empty");

        assert_eq!(parsed.email, "aigerim.sadykova@gmail.com");
        assert_eq!(parsed.full_name, "Aigerim Sadykova");
        assert_eq!(parsed.event_code, "main");
        assert_eq!(parsed.metadata["track_name"], "AI Track");
        assert_eq!(parsed.metadata["certificate_type"], "Participant");
        assert_eq!(parsed.metadata["issue_date"], "2026-04-20");
    }
}

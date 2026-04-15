use std::collections::{HashMap, HashSet};

use chrono::Utc;
use entity::{participants, prelude::Participants};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, PaginatorTrait, QueryFilter,
    QueryOrder, Set,
};
use serde::Serialize;
use uuid::Uuid;

use crate::error::AppError;

#[derive(Clone, Debug, Serialize)]
pub struct ParticipantSummary {
    pub id: Uuid,
    pub event_code: String,
    pub email: String,
    pub full_name: String,
    pub category: Option<String>,
    pub imported_at: chrono::DateTime<Utc>,
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
    pub errors: Vec<ImportError>,
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

    Ok(ParticipantListResponse {
        items: items.into_iter().map(to_summary).collect(),
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
    let mut rows = Vec::new();
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

        match parse_row(&headers, &record, default_event_code) {
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

                rows.push((row_number, row));
            }
            Ok(None) => {}
            Err(error) => errors.push(ImportError {
                row_number,
                email: String::new(),
                message: error.to_string(),
            }),
        }
    }

    let mut inserted = 0u64;
    let mut updated = 0u64;
    for (_, row) in rows {
        let existing = Participants::find()
            .filter(participants::Column::EventCode.eq(&row.event_code))
            .filter(participants::Column::EmailNormalized.eq(&row.email_normalized))
            .one(db)
            .await
            .map_err(|err| AppError::Internal(err.into()))?;

        if let Some(model) = existing {
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
        } else {
            participants::ActiveModel {
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
        }
    }

    let skipped = total_rows.saturating_sub(inserted + updated + errors.len() as u64);

    Ok(ImportResponse {
        total_rows,
        inserted,
        updated,
        skipped,
        errors,
    })
}

fn parse_row(
    headers: &csv::StringRecord,
    record: &csv::StringRecord,
    default_event_code: &str,
) -> Result<Option<ImportRow>, AppError> {
    let mut row = HashMap::new();
    for (header, value) in headers.iter().zip(record.iter()) {
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

fn normalize_email(email: &str) -> String {
    email.trim().to_lowercase()
}

fn to_summary(model: participants::Model) -> ParticipantSummary {
    ParticipantSummary {
        id: model.id,
        event_code: model.event_code,
        email: model.email,
        full_name: model.full_name,
        category: model.category,
        imported_at: model.imported_at,
    }
}

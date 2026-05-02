use std::collections::HashSet;

use chrono::Utc;
use entity::{
    certificate_templates,
    prelude::{CertificateTemplates, TemplateCategories},
    template_categories,
};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, QueryOrder, Set,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppError;

#[derive(Clone, Debug, Serialize)]
pub struct CategorySummary {
    pub id: Uuid,
    pub template_id: Uuid,
    pub template_name: String,
    pub name: String,
    pub slug: String,
    pub description: Option<String>,
    pub is_active: bool,
    pub created_at: chrono::DateTime<Utc>,
    pub updated_at: chrono::DateTime<Utc>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct UpsertCategoryInput {
    pub name: String,
    pub description: Option<String>,
    pub is_active: bool,
}

pub async fn list_categories(
    db: &DatabaseConnection,
    template_id: Uuid,
) -> Result<Vec<CategorySummary>, AppError> {
    let template = load_template(db, template_id).await?;
    let items = TemplateCategories::find()
        .filter(template_categories::Column::TemplateId.eq(template_id))
        .order_by_desc(template_categories::Column::IsActive)
        .order_by_asc(template_categories::Column::Name)
        .all(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;

    Ok(items
        .into_iter()
        .map(|model| to_summary(model, &template.name))
        .collect())
}

pub async fn list_all_categories(
    db: &DatabaseConnection,
) -> Result<Vec<CategorySummary>, AppError> {
    let items = TemplateCategories::find()
        .order_by_asc(template_categories::Column::TemplateId)
        .order_by_desc(template_categories::Column::IsActive)
        .order_by_asc(template_categories::Column::Name)
        .all(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;

    let template_ids: Vec<Uuid> = items.iter().map(|m| m.template_id).collect();
    let templates = CertificateTemplates::find()
        .filter(entity::certificate_templates::Column::Id.is_in(template_ids))
        .all(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;

    let template_map: std::collections::HashMap<Uuid, String> =
        templates.into_iter().map(|t| (t.id, t.name)).collect();

    Ok(items
        .into_iter()
        .map(|model| {
            let template_name = template_map
                .get(&model.template_id)
                .cloned()
                .unwrap_or_else(|| "Unknown template".to_owned());
            to_summary(model, &template_name)
        })
        .collect())
}

pub async fn create_category(
    db: &DatabaseConnection,
    template_id: Uuid,
    input: UpsertCategoryInput,
) -> Result<CategorySummary, AppError> {
    let template = load_template(db, template_id).await?;
    let name = normalize_name(&input.name)?;
    let slug = ensure_unique_slug(db, template_id, &slugify(&name), None).await?;
    let now = Utc::now();

    let model = template_categories::ActiveModel {
        id: Set(Uuid::new_v4()),
        template_id: Set(template_id),
        name: Set(name),
        slug: Set(slug),
        description: Set(normalize_optional_text(input.description)),
        is_active: Set(input.is_active),
        created_at: Set(now),
        updated_at: Set(now),
    }
    .insert(db)
    .await
    .map_err(|err| AppError::Internal(err.into()))?;

    Ok(to_summary(model, &template.name))
}

pub async fn ensure_categories_for_template(
    db: &DatabaseConnection,
    template_id: Uuid,
    names: impl IntoIterator<Item = String>,
) -> Result<Vec<CategorySummary>, AppError> {
    let template = load_template(db, template_id).await?;
    let existing = TemplateCategories::find()
        .filter(template_categories::Column::TemplateId.eq(template_id))
        .all(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;

    let mut known_names = existing
        .iter()
        .map(|category| normalize_name_key(&category.name))
        .collect::<HashSet<_>>();
    let mut pending_names = Vec::new();
    let mut seen_pending = HashSet::new();

    for name in names {
        let name = normalize_name(&name)?;
        let key = normalize_name_key(&name);
        if known_names.contains(&key) || !seen_pending.insert(key.clone()) {
            continue;
        }
        pending_names.push((name, key));
    }

    let now = Utc::now();
    let mut created = Vec::with_capacity(pending_names.len());

    for (name, key) in pending_names {
        let slug = ensure_unique_slug(db, template_id, &slugify(&name), None).await?;
        let model = template_categories::ActiveModel {
            id: Set(Uuid::new_v4()),
            template_id: Set(template_id),
            name: Set(name),
            slug: Set(slug),
            description: Set(None),
            is_active: Set(true),
            created_at: Set(now),
            updated_at: Set(now),
        }
        .insert(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;

        known_names.insert(key);
        created.push(to_summary(model, &template.name));
    }

    Ok(created)
}

pub async fn category_exists_by_name(
    db: &DatabaseConnection,
    template_id: Uuid,
    name: &str,
) -> Result<bool, AppError> {
    let name = normalize_name(name)?;
    let key = normalize_name_key(&name);
    let categories = TemplateCategories::find()
        .filter(template_categories::Column::TemplateId.eq(template_id))
        .all(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;

    Ok(categories
        .iter()
        .any(|category| normalize_name_key(&category.name) == key))
}

pub async fn update_category(
    db: &DatabaseConnection,
    template_id: Uuid,
    id: Uuid,
    input: UpsertCategoryInput,
) -> Result<CategorySummary, AppError> {
    let existing = TemplateCategories::find_by_id(id)
        .filter(template_categories::Column::TemplateId.eq(template_id))
        .one(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?
        .ok_or_else(|| AppError::NotFound("category not found".to_owned()))?;

    let template = load_template(db, template_id).await?;

    let name = normalize_name(&input.name)?;
    let slug = ensure_unique_slug(db, template_id, &slugify(&name), Some(id)).await?;
    let mut active_model: template_categories::ActiveModel = existing.into();
    active_model.name = Set(name);
    active_model.slug = Set(slug);
    active_model.description = Set(normalize_optional_text(input.description));
    active_model.is_active = Set(input.is_active);
    active_model.updated_at = Set(Utc::now());

    let model = active_model
        .update(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;

    Ok(to_summary(model, &template.name))
}

pub async fn delete_category(
    db: &DatabaseConnection,
    template_id: Uuid,
    id: Uuid,
) -> Result<(), AppError> {
    let result = TemplateCategories::delete_many()
        .filter(template_categories::Column::TemplateId.eq(template_id))
        .filter(template_categories::Column::Id.eq(id))
        .exec(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;
    if result.rows_affected == 0 {
        return Err(AppError::NotFound("category not found".to_owned()));
    }

    Ok(())
}

async fn load_template(
    db: &DatabaseConnection,
    template_id: Uuid,
) -> Result<certificate_templates::Model, AppError> {
    CertificateTemplates::find_by_id(template_id)
        .one(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?
        .ok_or_else(|| AppError::NotFound("template not found".to_owned()))
}

async fn ensure_unique_slug(
    db: &DatabaseConnection,
    template_id: Uuid,
    base_slug: &str,
    current_id: Option<Uuid>,
) -> Result<String, AppError> {
    let base_slug = if base_slug.is_empty() {
        "category"
    } else {
        base_slug
    };
    let mut attempt = 0usize;

    loop {
        let candidate = if attempt == 0 {
            base_slug.to_owned()
        } else {
            format!("{base_slug}-{}", attempt + 1)
        };

        let mut query = TemplateCategories::find()
            .filter(template_categories::Column::TemplateId.eq(template_id))
            .filter(template_categories::Column::Slug.eq(candidate.clone()));
        if let Some(current_id) = current_id {
            query = query.filter(template_categories::Column::Id.ne(current_id));
        }

        let exists = query
            .one(db)
            .await
            .map_err(|err| AppError::Internal(err.into()))?
            .is_some();
        if !exists {
            return Ok(candidate);
        }

        attempt += 1;
    }
}

fn normalize_name(value: &str) -> Result<String, AppError> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(AppError::BadRequest("category name is required".to_owned()));
    }

    Ok(trimmed.to_owned())
}

fn normalize_name_key(value: &str) -> String {
    value.trim().to_lowercase()
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

fn slugify(value: &str) -> String {
    let mut slug = String::with_capacity(value.len());
    let mut prev_dash = false;

    for ch in value.chars().flat_map(char::to_lowercase) {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch);
            prev_dash = false;
            continue;
        }

        if !prev_dash {
            slug.push('-');
            prev_dash = true;
        }
    }

    slug.trim_matches('-').to_owned()
}

pub fn to_summary(model: template_categories::Model, template_name: &str) -> CategorySummary {
    CategorySummary {
        id: model.id,
        template_id: model.template_id,
        template_name: template_name.to_owned(),
        name: model.name,
        slug: model.slug,
        description: model.description,
        is_active: model.is_active,
        created_at: model.created_at,
        updated_at: model.updated_at,
    }
}

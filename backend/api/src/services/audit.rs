use chrono::Utc;
use entity::admin_audit_logs;
use sea_orm::{ActiveModelTrait, DatabaseConnection, Set};
use serde_json::Value;
use uuid::Uuid;

use crate::error::AppError;

pub async fn log_admin_action(
    db: &DatabaseConnection,
    admin_id: Uuid,
    action: &str,
    resource_type: &str,
    resource_id: Option<String>,
    metadata: Value,
) {
    if let Err(err) =
        insert_admin_action(db, admin_id, action, resource_type, resource_id, metadata).await
    {
        tracing::warn!(error = %err, action, resource_type, "failed to write admin audit log");
    }
}

async fn insert_admin_action(
    db: &DatabaseConnection,
    admin_id: Uuid,
    action: &str,
    resource_type: &str,
    resource_id: Option<String>,
    metadata: Value,
) -> Result<(), AppError> {
    admin_audit_logs::ActiveModel {
        id: Set(Uuid::new_v4()),
        admin_id: Set(admin_id),
        action: Set(action.to_owned()),
        resource_type: Set(resource_type.to_owned()),
        resource_id: Set(resource_id),
        metadata: Set(metadata),
        created_at: Set(Utc::now()),
    }
    .insert(db)
    .await
    .map_err(|err| AppError::Internal(err.into()))?;

    Ok(())
}

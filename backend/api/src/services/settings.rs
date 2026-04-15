use anyhow::Result;
use entity::app_settings;
use sea_orm::{ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, Set};
use serde::{Deserialize, Serialize};

const ISSUANCE_ENABLED_KEY: &str = "issuance_enabled";

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct IssuanceSetting {
    pub enabled: bool,
}

pub async fn ensure_defaults(db: &DatabaseConnection, default_enabled: bool) -> Result<()> {
    if app_settings::Entity::find_by_id(ISSUANCE_ENABLED_KEY)
        .one(db)
        .await?
        .is_none()
    {
        app_settings::ActiveModel {
            key: Set(ISSUANCE_ENABLED_KEY.to_owned()),
            value: Set(serde_json::to_value(IssuanceSetting {
                enabled: default_enabled,
            })?),
            updated_at: Set(chrono::Utc::now()),
        }
        .insert(db)
        .await?;
    }

    Ok(())
}

pub async fn get_issuance_setting(
    db: &DatabaseConnection,
    default_enabled: bool,
) -> Result<IssuanceSetting> {
    if let Some(model) = app_settings::Entity::find_by_id(ISSUANCE_ENABLED_KEY)
        .one(db)
        .await?
    {
        return Ok(serde_json::from_value(model.value)?);
    }

    ensure_defaults(db, default_enabled).await?;

    Ok(IssuanceSetting {
        enabled: default_enabled,
    })
}

pub async fn update_issuance_setting(
    db: &DatabaseConnection,
    enabled: bool,
) -> Result<IssuanceSetting> {
    let value = serde_json::to_value(IssuanceSetting { enabled })?;

    if let Some(model) = app_settings::Entity::find()
        .filter(app_settings::Column::Key.eq(ISSUANCE_ENABLED_KEY))
        .one(db)
        .await?
    {
        let mut active_model: app_settings::ActiveModel = model.into();
        active_model.value = Set(value);
        active_model.updated_at = Set(chrono::Utc::now());
        active_model.update(db).await?;
    } else {
        app_settings::ActiveModel {
            key: Set(ISSUANCE_ENABLED_KEY.to_owned()),
            value: Set(value),
            updated_at: Set(chrono::Utc::now()),
        }
        .insert(db)
        .await?;
    }

    Ok(IssuanceSetting { enabled })
}

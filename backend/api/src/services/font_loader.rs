use std::path::Path;
use std::sync::Arc;

use anyhow::{Context, Result};
use fontdb::Database;

/// Font database wrapper for managing loaded fonts.
pub struct FontDatabase {
    pub db: Arc<Database>,
}

impl FontDatabase {
    pub fn new() -> Self {
        let mut db = Database::new();
        db.load_system_fonts();

        Self { db: Arc::new(db) }
    }

    pub async fn with_custom_fonts(fonts_dir: &Path) -> Result<Self> {
        let mut db = Database::new();
        db.load_system_fonts();

        if fonts_dir.exists() {
            for entry in std::fs::read_dir(fonts_dir).context("Failed to read fonts directory")? {
                let entry = entry.context("Failed to read font entry")?;
                let path = entry.path();
                if !path.is_file() || !looks_like_font_file(&path) {
                    continue;
                }

                let _ = db.load_font_file(&path);
            }
        }

        Ok(Self { db: Arc::new(db) })
    }
}

fn looks_like_font_file(path: &Path) -> bool {
    let Some(ext) = path.extension().and_then(|value| value.to_str()) else {
        return false;
    };

    if !matches!(ext.to_ascii_lowercase().as_str(), "ttf" | "otf" | "ttc") {
        return false;
    }

    let Ok(bytes) = std::fs::read(path) else {
        return false;
    };

    if bytes.starts_with(b"<!DOCTYPE html")
        || bytes.starts_with(b"<html")
        || bytes.starts_with(b"<!doctype html")
    {
        return false;
    }

    bytes.starts_with(&[0x00, 0x01, 0x00, 0x00])
        || bytes.starts_with(b"OTTO")
        || bytes.starts_with(b"ttcf")
}

#[cfg(test)]
mod tests {
    use super::FontDatabase;

    #[test]
    fn loads_some_system_fonts() {
        let db = FontDatabase::new();
        assert!(db.db.faces().next().is_some());
    }
}

pub use sea_orm_migration::prelude::*;

mod migrations;

pub struct Migrator;

#[async_trait::async_trait]
impl MigratorTrait for Migrator {
    fn migrations() -> Vec<Box<dyn MigrationTrait>> {
        vec![
            Box::new(migrations::m20260415_000001_create_initial_schema::Migration),
            Box::new(migrations::m20260415_000002_convert_timestamps_to_timestamptz::Migration),
            Box::new(migrations::m20260416_000003_add_ops_hardening::Migration),
            Box::new(migrations::m20260416_000004_add_layout_box_geometry::Migration),
            Box::new(migrations::m20260417_000005_add_template_roster_indexes::Migration),
            Box::new(migrations::m20260417_000006_add_template_canvas_data::Migration),
            Box::new(migrations::m20260420_000007_add_categories_and_template_category::Migration),
            Box::new(migrations::m20260420_000008_fix_categories_to_be_template_scoped::Migration),
            Box::new(migrations::m20260421_000009_add_certificate_issue_status::Migration),
            Box::new(migrations::m20260422_000010_add_issue_template_version::Migration),
        ]
    }
}

use std::time::Instant;

use anyhow::Result;
use decentra_certificates_api::services::participants as participant_service;
use decentra_certificates_api::state::AppState;

pub async fn run(state: &AppState) -> Result<()> {
    let sizes = vec![1000, 5000, 10000];

    println!("--- CSV Import Benchmark ---");
    for size in sizes {
        let path = format!("stress-tests/fixtures/participants-{size}.csv");
        let bytes = tokio::fs::read(&path).await?;

        // Clear existing participants for event_code "import-bench" to get clean numbers
        use entity::prelude::*;
        use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};
        let _ = Participants::delete_many()
            .filter(entity::participants::Column::EventCode.eq("import-bench"))
            .exec(&state.db)
            .await;

        let start = Instant::now();
        let result = participant_service::import_csv(&state.db, &bytes, "import-bench").await?;
        let elapsed = start.elapsed();

        let throughput = result.total_rows as f64 / elapsed.as_secs_f64();
        println!(
            "  {:>5} rows: total={:?} | throughput={:.1} rows/sec | inserted={} updated={} skipped={} errors={}",
            result.total_rows,
            elapsed,
            throughput,
            result.inserted,
            result.updated,
            result.skipped,
            result.errors.len()
        );
    }

    Ok(())
}

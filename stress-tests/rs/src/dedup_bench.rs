use std::sync::Arc;
use std::time::Instant;

use anyhow::{Context, Result};
use decentra_certificates_api::services::certificates::find_or_create_issue_record;
use decentra_certificates_api::state::AppState;
use sea_orm::{ColumnTrait, EntityTrait, PaginatorTrait, QueryFilter};

use crate::bench::{ensure_test_participant, ensure_test_template};

pub async fn run(state: &AppState) -> Result<()> {
    let template = ensure_test_template(state).await?;
    let participant = ensure_test_participant(state, template.id, "dedup").await?;

    // Clean up any existing issue for this participant/template
    use entity::certificate_issues;
    let _ = certificate_issues::Entity::delete_many()
        .filter(certificate_issues::Column::ParticipantId.eq(participant.id))
        .filter(certificate_issues::Column::TemplateId.eq(template.id))
        .exec(&state.db)
        .await;

    let concurrent_tasks = 50;
    println!("Spawning {concurrent_tasks} concurrent find_or_create_issue_record tasks...");

    let start = Instant::now();
    let state = Arc::new(state.clone());
    let template = Arc::new(template);
    let participant = Arc::new(participant);

    let handles: Vec<_> = (0..concurrent_tasks)
        .map(|_| {
            let state = Arc::clone(&state);
            let template = Arc::clone(&template);
            let participant = Arc::clone(&participant);
            tokio::spawn(async move {
                find_or_create_issue_record(&state, &participant, &template).await
            })
        })
        .collect();

    let mut results = Vec::with_capacity(concurrent_tasks);
    for h in handles {
        results.push(h.await.context("task panicked")??);
    }
    let elapsed = start.elapsed();

    // Verify all got the same issue record
    let first_id = results[0].id;
    let all_same = results.iter().all(|r| r.id == first_id);

    // Count actual rows in DB
    let count = certificate_issues::Entity::find()
        .filter(certificate_issues::Column::ParticipantId.eq(participant.id))
        .filter(certificate_issues::Column::TemplateId.eq(template.id))
        .count(&state.db)
        .await?;

    println!("  Completed in {:?}", elapsed);
    println!("  All tasks returned same issue ID: {all_same}");
    println!("  Issue records in DB: {count} (expected 1)");

    if !all_same || count != 1 {
        println!("  WARNING: Race condition detected!");
    } else {
        println!("  OK: No race conditions detected.");
    }

    Ok(())
}

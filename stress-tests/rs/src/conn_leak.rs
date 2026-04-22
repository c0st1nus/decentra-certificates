use std::time::Instant;

use anyhow::Result;
use decentra_certificates_api::services::certificates::check_available_certificates;
use decentra_certificates_api::state::AppState;

use crate::bench::ensure_test_participant;

pub async fn run(state: &AppState) -> Result<()> {
    let participant = ensure_test_participant(state, uuid::Uuid::nil(), "conn-leak").await?;

    let rapid_requests = 1000;
    println!("Sending {rapid_requests} rapid check_available_certificates requests...");

    let db_before = count_db_connections(state).await?;
    println!("  DB connections before: {db_before}");

    let start = Instant::now();
    for i in 0..rapid_requests {
        let _ = check_available_certificates(state, &participant.email).await?;
        if i > 0 && i % 100 == 0 {
            let db_current = count_db_connections(state).await?;
            println!("  After {i} requests: DB connections = {db_current}");
        }
    }
    let elapsed = start.elapsed();

    // Wait a bit for connections to be returned
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

    let db_after = count_db_connections(state).await?;
    println!("  DB connections after: {db_after}");
    println!(
        "  Total time: {:?} ({:.1} req/sec)",
        elapsed,
        rapid_requests as f64 / elapsed.as_secs_f64()
    );

    if db_after > db_before + 5 {
        println!(
            "  WARNING: Connection pool may be leaking (before={db_before}, after={db_after})"
        );
    } else {
        println!("  OK: Connections returned to pool properly.");
    }

    Ok(())
}

async fn count_db_connections(state: &AppState) -> Result<i64> {
    use sea_orm::ConnectionTrait;
    use sea_orm::sea_query::{Expr, Query};

    let select = Query::select()
        .expr(Expr::cust("count(*)::bigint"))
        .from("pg_stat_activity")
        .and_where(Expr::cust("datname = current_database()"))
        .to_owned();

    let result = state
        .db
        .query_one(&select)
        .await?
        .map(|qr| qr.try_get_by_index::<i64>(0).unwrap_or(0))
        .unwrap_or(0);
    Ok(result)
}

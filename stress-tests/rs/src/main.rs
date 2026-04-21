use std::env;
use std::time::Instant;

use anyhow::{Context, Result};
use decentra_certificates_api::config::Settings;
use decentra_certificates_api::state::AppState;
use dotenvy::dotenv;
use sea_orm::Database;

mod bench;
mod conn_leak;
mod dedup_bench;
mod import_bench;
mod render_bench;

#[tokio::main]
async fn main() -> Result<()> {
    dotenv().ok();

    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        print_usage();
        return Ok(());
    }

    let command = args[1].as_str();
    match command {
        "render" => run_render_bench().await?,
        "import" => run_import_bench().await?,
        "dedup" => run_dedup_bench().await?,
        "conn-leak" => run_conn_leak().await?,
        "all" => {
            run_render_bench().await?;
            run_import_bench().await?;
            run_dedup_bench().await?;
            run_conn_leak().await?;
        }
        _ => {
            eprintln!("Unknown command: {command}");
            print_usage();
        }
    }

    Ok(())
}

fn print_usage() {
    eprintln!(
        "Usage: stress-tests <command>

Commands:
  render     - Benchmark certificate rendering (PNG + PDF)
  import     - Benchmark participant import (CSV)
  dedup      - Test race conditions in find_or_create_issue_record
  conn-leak  - Test connection pool behavior under load
  all        - Run all benchmarks
"
    );
}

async fn init_state() -> Result<AppState> {
    let settings = Settings::from_env().context("failed to load settings")?;
    let db = Database::connect(&settings.database_url)
        .await
        .context("failed to connect to database")?;
    let state = AppState::try_new(settings, db)
        .await
        .context("failed to create app state")?;
    Ok(state)
}

async fn run_render_bench() -> Result<()> {
    println!("\n========== RENDER BENCHMARK ==========");
    let state = init_state().await?;
    let start = Instant::now();
    render_bench::run(&state).await?;
    println!("Total time: {:?}", start.elapsed());
    Ok(())
}

async fn run_import_bench() -> Result<()> {
    println!("\n========== IMPORT BENCHMARK ==========");
    let state = init_state().await?;
    let start = Instant::now();
    import_bench::run(&state).await?;
    println!("Total time: {:?}", start.elapsed());
    Ok(())
}

async fn run_dedup_bench() -> Result<()> {
    println!("\n========== DEDUP RACE TEST ==========");
    let state = init_state().await?;
    let start = Instant::now();
    dedup_bench::run(&state).await?;
    println!("Total time: {:?}", start.elapsed());
    Ok(())
}

async fn run_conn_leak() -> Result<()> {
    println!("\n========== CONNECTION LEAK TEST ==========");
    let state = init_state().await?;
    let start = Instant::now();
    conn_leak::run(&state).await?;
    println!("Total time: {:?}", start.elapsed());
    Ok(())
}

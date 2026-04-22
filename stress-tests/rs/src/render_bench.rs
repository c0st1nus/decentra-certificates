use std::collections::HashMap;
use std::time::Instant;

use anyhow::Result;
use decentra_certificates_api::services::scene_renderer;
use decentra_certificates_api::services::templates::{TemplateLayoutData, model_to_layout_data};
use decentra_certificates_api::state::AppState;
use entity::prelude::*;
use entity::template_layouts;
use sea_orm::{ColumnTrait, EntityTrait, QueryFilter};

use crate::bench::{build_test_bindings, ensure_test_participant, ensure_test_template};

pub async fn run(state: &AppState) -> Result<()> {
    let template = ensure_test_template(state).await?;
    let layout_model: template_layouts::Model = TemplateLayouts::find()
        .filter(template_layouts::Column::TemplateId.eq(template.id))
        .one(&state.db)
        .await?
        .expect("layout not found");
    let layout = model_to_layout_data(&layout_model);
    let participant = ensure_test_participant(state, template.id, "render").await?;
    let bindings = build_test_bindings(&participant.full_name);

    println!("Template: {} ({})", template.name, template.id);
    println!("Layout: {}x{}", layout.page_width, layout.page_height);
    println!("Participant: {}", participant.full_name);

    // Warmup
    println!("\n--- Warmup (1 PNG + 1 PDF) ---");
    let _ = scene_renderer::render_scene_png(
        state,
        &template,
        &layout,
        &participant.full_name,
        bindings.clone(),
    )
    .await?;
    let _ = scene_renderer::render_scene_pdf(state, &template, &layout, bindings.clone()).await?;
    println!("Warmup complete");

    // PNG benchmark
    benchmark_render_png(state, &template, &layout, &participant.full_name, &bindings).await?;

    // PDF benchmark
    benchmark_render_pdf(state, &template, &layout, &bindings).await?;

    // Concurrent render test (saturate semaphore)
    println!("\n--- Concurrent saturation test (10 parallel PDF renders) ---");
    let start = Instant::now();
    let handles: Vec<_> = (0..10)
        .map(|_| {
            let state = state.clone();
            let template = template.clone();
            let layout = layout.clone();
            let bindings = bindings.clone();
            tokio::spawn(async move {
                scene_renderer::render_scene_pdf(&state, &template, &layout, bindings).await
            })
        })
        .collect();

    for h in handles {
        h.await??;
    }
    let elapsed = start.elapsed();
    println!(
        "10 concurrent PDF renders: {:?} total, {:?} avg/render",
        elapsed,
        elapsed / 10
    );

    Ok(())
}

async fn benchmark_render_png(
    state: &AppState,
    template: &entity::certificate_templates::Model,
    layout: &TemplateLayoutData,
    preview_name: &str,
    bindings: &HashMap<String, String>,
) -> Result<()> {
    println!("\n--- PNG sequential render benchmark ---");
    for n in [1, 5, 10, 25] {
        let start = Instant::now();
        for _ in 0..n {
            let _ = scene_renderer::render_scene_png(
                state,
                template,
                layout,
                preview_name,
                bindings.clone(),
            )
            .await?;
        }
        let elapsed = start.elapsed();
        let avg = elapsed / n as u32;
        let throughput = n as f64 / elapsed.as_secs_f64();
        println!(
            "  {:>2} renders: total={:?} | avg={:?} | throughput={:.1} renders/sec",
            n, elapsed, avg, throughput
        );
    }
    Ok(())
}

async fn benchmark_render_pdf(
    state: &AppState,
    template: &entity::certificate_templates::Model,
    layout: &TemplateLayoutData,
    bindings: &HashMap<String, String>,
) -> Result<()> {
    println!("\n--- PDF sequential render benchmark ---");
    for n in [1, 5, 10, 25] {
        let start = Instant::now();
        for _ in 0..n {
            let _ =
                scene_renderer::render_scene_pdf(state, template, layout, bindings.clone()).await?;
        }
        let elapsed = start.elapsed();
        let avg = elapsed / n as u32;
        let throughput = n as f64 / elapsed.as_secs_f64();
        println!(
            "  {:>2} renders: total={:?} | avg={:?} | throughput={:.1} renders/sec",
            n, elapsed, avg, throughput
        );
    }
    Ok(())
}

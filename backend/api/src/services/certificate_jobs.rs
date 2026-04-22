use anyhow::{Context, Result};
use chrono::Utc;
use entity::{
    certificate_issues, certificate_templates, participants,
    prelude::{CertificateIssues, CertificateTemplates, Participants, TemplateLayouts},
    template_layouts,
};
use sea_orm::{ActiveModelTrait, ColumnTrait, DatabaseConnection, EntityTrait, QueryFilter, Set};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    services::{certificates, settings},
    state::AppState,
};

const CERTIFICATE_QUEUE_KEY: &str = "certificates:queue";
const JOB_TTL_SECONDS: usize = 60 * 60 * 24;
const PRIORITY_BOOST_MILLIS: i64 = 5 * 60 * 1000;
const RETRY_DELAY_MILLIS: i64 = 5_000;
const QUEUE_IDLE_WAIT_SECONDS: u64 = 30;
const MAX_ATTEMPTS: u32 = 3;

#[derive(Clone, Copy, Debug)]
pub enum JobPriority {
    Bulk,
    UserRequested,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CertificateJobStatus {
    pub job_id: String,
    pub certificate_id: String,
    pub verification_code: Option<String>,
    pub status: String,
    pub message: String,
    pub full_name: String,
    pub template_name: String,
    pub download_url: Option<String>,
    pub verification_url: Option<String>,
    pub attempts: u32,
    pub updated_at: String,
}

impl CertificateJobStatus {
    pub fn is_ready(&self) -> bool {
        self.status == "completed"
    }

    pub fn is_processing(&self) -> bool {
        matches!(self.status.as_str(), "queued" | "processing")
    }
}

pub fn spawn_workers(state: AppState) {
    for worker_index in 0..state.settings.certificate_workers.max(1) {
        let worker_state = state.clone();
        tokio::spawn(async move {
            loop {
                match worker_state
                    .redis
                    .dequeue_ready_scored(
                        CERTIFICATE_QUEUE_KEY,
                        Utc::now().timestamp_millis() as f64,
                    )
                    .await
                {
                    Ok(Some(job_id)) => {
                        if let Err(err) = process_job(&worker_state, &job_id).await {
                            tracing::error!(worker = worker_index, job_id, error = %err, "certificate worker failed");
                        }
                    }
                    Ok(None) => {
                        match worker_state
                            .redis
                            .next_scored_score(CERTIFICATE_QUEUE_KEY)
                            .await
                        {
                            Ok(next_score) => {
                                let wait_duration = next_queue_wait_duration(next_score);
                                tokio::select! {
                                    _ = worker_state.certificate_queue_notify.notified() => {}
                                    _ = tokio::time::sleep(wait_duration) => {}
                                }
                            }
                            Err(err) => {
                                tracing::error!(worker = worker_index, error = %err, "certificate worker failed to inspect queue");
                                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                            }
                        }
                    }
                    Err(err) => {
                        tracing::error!(worker = worker_index, error = %err, "certificate worker redis dequeue failed");
                        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
                    }
                }
            }
        });
    }
}

pub async fn get_job_status(
    state: &AppState,
    job_id: &str,
) -> Result<Option<CertificateJobStatus>> {
    let key = job_status_key(job_id);
    if let Some(status) = state.redis.get_json::<CertificateJobStatus>(&key).await? {
        return Ok(Some(status));
    }

    let Ok(issue_id) = Uuid::parse_str(job_id) else {
        return Ok(None);
    };
    let Some(issue) = CertificateIssues::find_by_id(issue_id)
        .one(&state.db)
        .await
        .with_context(|| format!("failed to load issue for job {job_id}"))?
    else {
        return Ok(None);
    };

    let participant = Participants::find_by_id(issue.participant_id)
        .one(&state.db)
        .await
        .context("failed to load participant for job")?;
    let template = CertificateTemplates::find_by_id(issue.template_id)
        .one(&state.db)
        .await
        .context("failed to load template for job")?;

    let status = match issue.status.as_str() {
        "completed" => {
            let participant = participant.context("participant not found for completed job")?;
            let template = template.context("template not found for completed job")?;
            completed_status(&issue, &participant, &template, "Сертификат готов")
        }
        "failed" => {
            let participant = participant.context("participant not found for failed job")?;
            let template = template.context("template not found for failed job")?;
            failed_status(&issue, &participant, &template)
        }
        "processing" => {
            let participant = participant.context("participant not found for processing job")?;
            let template = template.context("template not found for processing job")?;
            processing_status(&issue, &participant, &template)
        }
        _ => {
            let participant = participant.context("participant not found for queued job")?;
            let template = template.context("template not found for queued job")?;
            queued_status(
                &issue,
                &participant,
                &template,
                "Сертификат поставлен в очередь",
            )
        }
    };
    write_job_status(state, &status).await?;

    Ok(Some(status))
}

pub async fn enqueue_issue(
    state: &AppState,
    issue: &certificate_issues::Model,
    participant: &participants::Model,
    template: &certificate_templates::Model,
    priority: JobPriority,
) -> Result<CertificateJobStatus> {
    let template_changed = issue
        .template_updated_at
        .map(|ts| ts < template.updated_at)
        .unwrap_or(true);

    let has_file = if template_changed {
        if state
            .storage
            .object_exists(&issue.generated_pdf_path)
            .await
            .unwrap_or(false)
        {
            let _ = state.storage.delete_object(&issue.generated_pdf_path).await;
        }
        false
    } else {
        state
            .storage
            .object_exists(&issue.generated_pdf_path)
            .await
            .unwrap_or(false)
    };

    if has_file && !template_changed {
        if issue.status != "completed" {
            update_issue_status(&state.db, issue, "completed", 0, None, None).await?;
        }
        let status = completed_status(issue, participant, template, "Certificate ready");
        write_job_status(state, &status).await?;
        return Ok(status);
    }

    let job_id = issue.id.to_string();
    let key = job_status_key(&job_id);
    let mut status = state
        .redis
        .get_json::<CertificateJobStatus>(&key)
        .await?
        .unwrap_or_else(|| {
            queued_status(
                issue,
                participant,
                template,
                "Сертификат поставлен в очередь",
            )
        });

    if status.status == "processing" {
        status.message = "Сертификат уже генерируется. Подождите, это скоро закончится.".to_owned();
        status.updated_at = Utc::now().to_rfc3339();
        write_job_status(state, &status).await?;
        return Ok(status);
    }

    if status.is_ready() {
        if has_file {
            return Ok(status);
        }
        status = queued_status(issue, participant, template, "Перегенерируем сертификат");
    }

    if matches!(priority, JobPriority::UserRequested) {
        status.message = "Запрос принят. Поднимаем сертификат в приоритетную очередь.".to_owned();
    }

    status.status = "queued".to_owned();
    status.updated_at = Utc::now().to_rfc3339();
    write_job_status(state, &status).await?;
    update_issue_status(&state.db, issue, "queued", 0, None, None).await?;
    state
        .redis
        .enqueue_scored(CERTIFICATE_QUEUE_KEY, &job_id, queue_score(priority, 0))
        .await?;
    state.notify_certificate_workers();

    Ok(status)
}

pub async fn enqueue_participants_for_template(
    state: &AppState,
    template_id: Uuid,
    participant_ids: &[Uuid],
    priority: JobPriority,
) -> Result<usize> {
    if participant_ids.is_empty() {
        return Ok(0);
    }

    let template = CertificateTemplates::find_by_id(template_id)
        .one(&state.db)
        .await
        .context("failed to load template for queueing")?
        .context("template not found for queueing")?;

    ensure_layout_exists(&state.db, template_id).await?;

    let participants = Participants::find()
        .filter(participants::Column::Id.is_in(participant_ids.to_vec()))
        .all(&state.db)
        .await
        .context("failed to load participants for queueing")?;

    let mut queued = 0usize;
    for participant in participants {
        if participant.event_code != template.id.to_string() {
            continue;
        }
        let issue =
            certificates::find_or_create_issue_record(state, &participant, &template).await?;
        enqueue_issue(state, &issue, &participant, &template, priority).await?;
        queued += 1;
    }

    Ok(queued)
}

pub async fn enqueue_all_for_template(
    state: &AppState,
    template_id: Uuid,
    priority: JobPriority,
) -> Result<usize> {
    let event_code = template_id.to_string();
    let participant_ids = Participants::find()
        .filter(participants::Column::EventCode.eq(event_code))
        .all(&state.db)
        .await
        .context("failed to load participants for bulk queue")?
        .into_iter()
        .map(|participant| participant.id)
        .collect::<Vec<_>>();

    enqueue_participants_for_template(state, template_id, &participant_ids, priority).await
}

pub async fn enqueue_imported_participants_if_needed(
    state: &AppState,
    event_code: &str,
    participant_ids: &[Uuid],
) -> Result<usize> {
    if participant_ids.is_empty() {
        return Ok(0);
    }

    let issuance =
        settings::get_issuance_setting(&state.db, state.settings.issuance_enabled_default).await?;
    if !issuance.enabled {
        return Ok(0);
    }

    let Some(template) = CertificateTemplates::find()
        .filter(certificate_templates::Column::IsActive.eq(true))
        .one(&state.db)
        .await
        .context("failed to load active template for import queue")?
    else {
        return Ok(0);
    };

    if template.id.to_string() != event_code {
        return Ok(0);
    }

    enqueue_participants_for_template(state, template.id, participant_ids, JobPriority::Bulk).await
}

pub async fn enqueue_active_template_if_enabled(state: &AppState) -> Result<usize> {
    let issuance =
        settings::get_issuance_setting(&state.db, state.settings.issuance_enabled_default).await?;
    if !issuance.enabled {
        return Ok(0);
    }

    let Some(template) = CertificateTemplates::find()
        .filter(certificate_templates::Column::IsActive.eq(true))
        .one(&state.db)
        .await
        .context("failed to load active template for automatic queue")?
    else {
        return Ok(0);
    };

    enqueue_all_for_template(state, template.id, JobPriority::Bulk).await
}

async fn process_job(state: &AppState, job_id: &str) -> Result<()> {
    let issue_id = Uuid::parse_str(job_id).with_context(|| format!("invalid job id {job_id}"))?;
    let issue = CertificateIssues::find_by_id(issue_id)
        .one(&state.db)
        .await
        .context("failed to load issue for processing")?
        .context("issue not found for processing")?;
    let participant = Participants::find_by_id(issue.participant_id)
        .one(&state.db)
        .await
        .context("failed to load participant for processing")?
        .context("participant not found for processing")?;
    let template = CertificateTemplates::find_by_id(issue.template_id)
        .one(&state.db)
        .await
        .context("failed to load template for processing")?
        .context("template not found for processing")?;
    let layout = TemplateLayouts::find()
        .filter(template_layouts::Column::TemplateId.eq(template.id))
        .one(&state.db)
        .await
        .context("failed to load layout for processing")?
        .context("template layout is not configured")?;

    let mut status = get_job_status(state, job_id).await?.unwrap_or_else(|| {
        queued_status(
            &issue,
            &participant,
            &template,
            "Сертификат поставлен в очередь",
        )
    });
    status.status = "processing".to_owned();
    status.message = "Генерируем сертификат на сервере".to_owned();
    status.updated_at = Utc::now().to_rfc3339();
    status.attempts += 1;
    write_job_status(state, &status).await?;
    update_issue_status(&state.db, &issue, "processing", 1, None, None).await?;

    let result =
        certificates::render_issue_pdf(state, &issue, &participant, &template, &layout).await;
    match result {
        Ok(()) => {
            update_issue_status(
                &state.db,
                &issue,
                "completed",
                0,
                None,
                Some(template.updated_at),
            )
            .await?;
            let completed = completed_status(&issue, &participant, &template, "Сертификат готов");
            write_job_status(state, &completed).await?;
            Ok(())
        }
        Err(err) => {
            if status.attempts < MAX_ATTEMPTS {
                let mut retry = status;
                retry.status = "queued".to_owned();
                retry.message = "Повторяем генерацию после временной ошибки".to_owned();
                retry.updated_at = Utc::now().to_rfc3339();
                write_job_status(state, &retry).await?;
                update_issue_status(&state.db, &issue, "queued", 0, None, None).await?;
                state
                    .redis
                    .enqueue_scored(
                        CERTIFICATE_QUEUE_KEY,
                        job_id,
                        queue_score(JobPriority::Bulk, RETRY_DELAY_MILLIS),
                    )
                    .await?;
                state.notify_certificate_workers();
                tracing::warn!(job_id, error = %err, attempts = retry.attempts, "retrying certificate generation");
                return Ok(());
            }

            let err_msg = err.to_string();
            update_issue_status(&state.db, &issue, "failed", 0, Some(err_msg.clone()), None)
                .await?;
            let failed = CertificateJobStatus {
                job_id: issue.id.to_string(),
                certificate_id: issue.certificate_id.clone(),
                verification_code: Some(issue.verification_code.clone()),
                status: "failed".to_owned(),
                message: "Не удалось сгенерировать сертификат. Попробуйте еще раз чуть позже."
                    .to_owned(),
                full_name: participant.full_name.clone(),
                template_name: template.name.clone(),
                download_url: None,
                verification_url: None,
                attempts: status.attempts,
                updated_at: Utc::now().to_rfc3339(),
            };
            write_job_status(state, &failed).await?;
            Err(err)
        }
    }
}

async fn ensure_layout_exists(db: &DatabaseConnection, template_id: Uuid) -> Result<()> {
    let has_layout = TemplateLayouts::find()
        .filter(template_layouts::Column::TemplateId.eq(template_id))
        .one(db)
        .await
        .context("failed to load template layout")?
        .is_some();

    if has_layout {
        return Ok(());
    }

    Err(anyhow::anyhow!("template layout is not configured"))
}

async fn write_job_status(state: &AppState, status: &CertificateJobStatus) -> Result<()> {
    state
        .redis
        .set_json(&job_status_key(&status.job_id), status, JOB_TTL_SECONDS)
        .await
}

async fn update_issue_status(
    db: &DatabaseConnection,
    issue: &certificate_issues::Model,
    status: &str,
    attempts_delta: i32,
    error_message: Option<String>,
    template_updated_at: Option<chrono::DateTime<Utc>>,
) -> Result<()> {
    let now = Utc::now();
    let mut active: certificate_issues::ActiveModel = issue.clone().into();
    active.status = Set(status.to_owned());
    active.attempts = Set(issue.attempts + attempts_delta);
    active.updated_at = Set(now);
    if let Some(msg) = error_message {
        active.error_message = Set(Some(msg));
    }
    if let Some(ts) = template_updated_at {
        active.template_updated_at = Set(Some(ts));
    }
    match status {
        "queued" => active.queued_at = Set(Some(now)),
        "processing" => active.processing_at = Set(Some(now)),
        "completed" => active.completed_at = Set(Some(now)),
        "failed" => active.failed_at = Set(Some(now)),
        _ => {}
    }
    active
        .update(db)
        .await
        .with_context(|| format!("failed to update certificate issue status for {}", issue.id))?;
    Ok(())
}

fn queue_score(priority: JobPriority, delay_millis: i64) -> f64 {
    let base = Utc::now().timestamp_millis() + delay_millis;
    let adjusted = match priority {
        JobPriority::Bulk => base,
        JobPriority::UserRequested => base - PRIORITY_BOOST_MILLIS,
    };
    adjusted as f64
}

fn job_status_key(job_id: &str) -> String {
    format!("certificate:job:{job_id}")
}

fn next_queue_wait_duration(next_score: Option<f64>) -> std::time::Duration {
    let fallback = std::time::Duration::from_secs(QUEUE_IDLE_WAIT_SECONDS);
    let Some(next_score) = next_score else {
        return fallback;
    };

    let now = Utc::now().timestamp_millis() as f64;
    if next_score <= now {
        return std::time::Duration::from_millis(0);
    }

    let wait_millis = (next_score - now).min((QUEUE_IDLE_WAIT_SECONDS * 1000) as f64) as u64;
    std::time::Duration::from_millis(wait_millis)
}

fn processing_status(
    issue: &certificate_issues::Model,
    participant: &participants::Model,
    template: &certificate_templates::Model,
) -> CertificateJobStatus {
    CertificateJobStatus {
        job_id: issue.id.to_string(),
        certificate_id: issue.certificate_id.clone(),
        verification_code: Some(issue.verification_code.clone()),
        status: "processing".to_owned(),
        message: "Генерируем сертификат на сервере".to_owned(),
        full_name: participant.full_name.clone(),
        template_name: template.name.clone(),
        download_url: None,
        verification_url: Some(format!(
            "/api/v1/public/certificates/verify/{}",
            issue.verification_code
        )),
        attempts: issue.attempts as u32,
        updated_at: Utc::now().to_rfc3339(),
    }
}

fn failed_status(
    issue: &certificate_issues::Model,
    participant: &participants::Model,
    template: &certificate_templates::Model,
) -> CertificateJobStatus {
    CertificateJobStatus {
        job_id: issue.id.to_string(),
        certificate_id: issue.certificate_id.clone(),
        verification_code: Some(issue.verification_code.clone()),
        status: "failed".to_owned(),
        message: issue
            .error_message
            .clone()
            .unwrap_or_else(|| "Не удалось сгенерировать сертификат".to_owned()),
        full_name: participant.full_name.clone(),
        template_name: template.name.clone(),
        download_url: None,
        verification_url: Some(format!(
            "/api/v1/public/certificates/verify/{}",
            issue.verification_code
        )),
        attempts: issue.attempts as u32,
        updated_at: issue
            .failed_at
            .map(|t| t.to_rfc3339())
            .unwrap_or_else(|| Utc::now().to_rfc3339()),
    }
}

fn queued_status(
    issue: &certificate_issues::Model,
    participant: &participants::Model,
    template: &certificate_templates::Model,
    message: &str,
) -> CertificateJobStatus {
    CertificateJobStatus {
        job_id: issue.id.to_string(),
        certificate_id: issue.certificate_id.clone(),
        verification_code: Some(issue.verification_code.clone()),
        status: "queued".to_owned(),
        message: message.to_owned(),
        full_name: participant.full_name.clone(),
        template_name: template.name.clone(),
        download_url: None,
        verification_url: Some(format!(
            "/api/v1/public/certificates/verify/{}",
            issue.verification_code
        )),
        attempts: 0,
        updated_at: Utc::now().to_rfc3339(),
    }
}

fn completed_status(
    issue: &certificate_issues::Model,
    participant: &participants::Model,
    template: &certificate_templates::Model,
    message: &str,
) -> CertificateJobStatus {
    CertificateJobStatus {
        job_id: issue.id.to_string(),
        certificate_id: issue.certificate_id.clone(),
        verification_code: Some(issue.verification_code.clone()),
        status: "completed".to_owned(),
        message: message.to_owned(),
        full_name: participant.full_name.clone(),
        template_name: template.name.clone(),
        download_url: Some(format!(
            "/api/v1/public/certificates/{}/download",
            issue.certificate_id
        )),
        verification_url: Some(format!(
            "/api/v1/public/certificates/verify/{}",
            issue.verification_code
        )),
        attempts: 1,
        updated_at: Utc::now().to_rfc3339(),
    }
}

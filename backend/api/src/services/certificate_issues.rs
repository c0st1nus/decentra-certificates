use chrono::Utc;
use entity::{
    certificate_issues, certificate_templates, participants,
    prelude::{CertificateIssues, CertificateTemplates, Participants},
};
use sea_orm::{
    ActiveModelTrait, ColumnTrait, Condition, DatabaseConnection, EntityTrait, PaginatorTrait,
    QueryFilter, QueryOrder, Set,
};
use serde::Serialize;
use uuid::Uuid;

use crate::{error::AppError, services::certificate_jobs, state::AppState};

#[derive(Clone, Debug, Serialize)]
pub struct IssueSummary {
    pub id: Uuid,
    pub certificate_id: String,
    pub verification_code: String,
    pub participant_id: Uuid,
    pub participant_name: String,
    pub participant_email: String,
    pub template_id: Uuid,
    pub template_name: String,
    pub status: String,
    pub attempts: i32,
    pub error_message: Option<String>,
    pub queued_at: Option<String>,
    pub processing_at: Option<String>,
    pub completed_at: Option<String>,
    pub failed_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Clone, Debug, Serialize)]
pub struct IssueListResponse {
    pub items: Vec<IssueSummary>,
    pub total: u64,
    pub page: u64,
    pub page_size: u64,
}

#[derive(Clone, Debug, Serialize)]
pub struct GenerationProgress {
    pub total: i64,
    pub not_created: i64,
    pub queued: i64,
    pub processing: i64,
    pub completed: i64,
    pub failed: i64,
}

pub async fn list_issues(
    db: &DatabaseConnection,
    template_id: Option<Uuid>,
    status: Option<String>,
    page: u64,
    page_size: u64,
) -> Result<IssueListResponse, AppError> {
    let page = page.max(1);
    let page_size = page_size.clamp(1, 100);

    let mut condition = Condition::all();
    if let Some(tid) = template_id {
        condition = condition.add(certificate_issues::Column::TemplateId.eq(tid));
    }
    if let Some(s) = status {
        condition = condition.add(certificate_issues::Column::Status.eq(s));
    }

    let query = CertificateIssues::find()
        .filter(condition)
        .order_by_desc(certificate_issues::Column::UpdatedAt);

    let paginator = query.paginate(db, page_size);
    let total = paginator
        .num_items()
        .await
        .map_err(|err| AppError::Internal(err.into()))?;
    let items = paginator
        .fetch_page(page.saturating_sub(1))
        .await
        .map_err(|err| AppError::Internal(err.into()))?;

    let participant_ids: Vec<Uuid> = items.iter().map(|i| i.participant_id).collect();
    let template_ids: Vec<Uuid> = items.iter().map(|i| i.template_id).collect();

    let participants = if participant_ids.is_empty() {
        vec![]
    } else {
        Participants::find()
            .filter(participants::Column::Id.is_in(participant_ids))
            .all(db)
            .await
            .map_err(|err| AppError::Internal(err.into()))?
    };
    let templates = if template_ids.is_empty() {
        vec![]
    } else {
        CertificateTemplates::find()
            .filter(certificate_templates::Column::Id.is_in(template_ids))
            .all(db)
            .await
            .map_err(|err| AppError::Internal(err.into()))?
    };

    let participant_map: std::collections::HashMap<Uuid, &participants::Model> =
        participants.iter().map(|p| (p.id, p)).collect();
    let template_map: std::collections::HashMap<Uuid, &certificate_templates::Model> =
        templates.iter().map(|t| (t.id, t)).collect();

    let summaries = items
        .into_iter()
        .map(|issue| {
            let participant = participant_map.get(&issue.participant_id);
            let template = template_map.get(&issue.template_id);
            IssueSummary {
                id: issue.id,
                certificate_id: issue.certificate_id.clone(),
                verification_code: issue.verification_code.clone(),
                participant_id: issue.participant_id,
                participant_name: participant.map(|p| p.full_name.clone()).unwrap_or_default(),
                participant_email: participant.map(|p| p.email.clone()).unwrap_or_default(),
                template_id: issue.template_id,
                template_name: template.map(|t| t.name.clone()).unwrap_or_default(),
                status: issue.status.clone(),
                attempts: issue.attempts,
                error_message: issue.error_message.clone(),
                queued_at: issue.queued_at.map(|t| t.to_rfc3339()),
                processing_at: issue.processing_at.map(|t| t.to_rfc3339()),
                completed_at: issue.completed_at.map(|t| t.to_rfc3339()),
                failed_at: issue.failed_at.map(|t| t.to_rfc3339()),
                created_at: issue.created_at.to_rfc3339(),
                updated_at: issue.updated_at.to_rfc3339(),
            }
        })
        .collect();

    Ok(IssueListResponse {
        items: summaries,
        total,
        page,
        page_size,
    })
}

pub async fn requeue_issue(state: &AppState, issue_id: Uuid) -> Result<(), AppError> {
    let issue = CertificateIssues::find_by_id(issue_id)
        .one(&state.db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?
        .ok_or_else(|| AppError::NotFound("certificate issue not found".to_owned()))?;

    let participant = Participants::find_by_id(issue.participant_id)
        .one(&state.db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?
        .ok_or_else(|| AppError::NotFound("participant not found".to_owned()))?;
    let template = CertificateTemplates::find_by_id(issue.template_id)
        .one(&state.db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?
        .ok_or_else(|| AppError::NotFound("template not found".to_owned()))?;

    let issue = reset_to_queued(issue, Some(template.updated_at))
        .update(&state.db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;

    certificate_jobs::enqueue_issue(
        state,
        &issue,
        &participant,
        &template,
        certificate_jobs::JobPriority::UserRequested,
    )
    .await
    .map_err(AppError::Internal)?;

    Ok(())
}

pub async fn requeue_failed_for_template(
    state: &AppState,
    template_id: Uuid,
) -> Result<usize, AppError> {
    let failed_issues = CertificateIssues::find()
        .filter(certificate_issues::Column::TemplateId.eq(template_id))
        .filter(certificate_issues::Column::Status.eq("failed"))
        .all(&state.db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;

    let mut requeued = 0usize;
    for issue in failed_issues {
        let participant = match Participants::find_by_id(issue.participant_id)
            .one(&state.db)
            .await
        {
            Ok(Some(p)) => p,
            _ => continue,
        };
        let template = match CertificateTemplates::find_by_id(issue.template_id)
            .one(&state.db)
            .await
        {
            Ok(Some(t)) => t,
            _ => continue,
        };

        let issue = match reset_to_queued(issue, Some(template.updated_at))
            .update(&state.db)
            .await
        {
            Ok(i) => i,
            Err(err) => {
                tracing::warn!(error = %err, "failed to reset failed issue status");
                continue;
            }
        };

        if let Err(err) = certificate_jobs::enqueue_issue(
            state,
            &issue,
            &participant,
            &template,
            certificate_jobs::JobPriority::Bulk,
        )
        .await
        {
            tracing::warn!(error = %err, "failed to enqueue requeued issue");
            continue;
        }
        requeued += 1;
    }

    Ok(requeued)
}

pub async fn invalidate_completed_issues_for_template(
    state: &AppState,
    template_id: Uuid,
) -> Result<usize, AppError> {
    let completed_issues = CertificateIssues::find()
        .filter(certificate_issues::Column::TemplateId.eq(template_id))
        .filter(certificate_issues::Column::Status.eq("completed"))
        .all(&state.db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;

    let mut invalidated = 0usize;
    for issue in completed_issues {
        if let Err(err) = state.storage.delete_object(&issue.generated_pdf_path).await {
            tracing::warn!(
                issue_id = %issue.id,
                path = %issue.generated_pdf_path,
                error = %err,
                "failed to delete stale certificate pdf"
            );
        }

        let issue_id = issue.id;
        let active = reset_to_queued(issue, None);

        if let Err(err) = active.update(&state.db).await {
            tracing::warn!(
                issue_id = %issue_id,
                error = %err,
                "failed to reset invalidated issue status"
            );
            continue;
        }
        invalidated += 1;
    }

    Ok(invalidated)
}

fn reset_to_queued(
    issue: certificate_issues::Model,
    template_updated_at: Option<chrono::DateTime<Utc>>,
) -> certificate_issues::ActiveModel {
    let now = Utc::now();
    let mut active: certificate_issues::ActiveModel = issue.into();
    active.status = Set("queued".to_owned());
    active.attempts = Set(0);
    active.error_message = Set(None);
    active.queued_at = Set(Some(now));
    active.processing_at = Set(None);
    active.completed_at = Set(None);
    active.failed_at = Set(None);
    active.updated_at = Set(now);
    if let Some(template_updated_at) = template_updated_at {
        active.template_updated_at = Set(Some(template_updated_at));
    }
    active
}

pub async fn get_generation_progress(
    db: &DatabaseConnection,
    template_id: Uuid,
) -> Result<GenerationProgress, AppError> {
    let issues = CertificateIssues::find()
        .filter(certificate_issues::Column::TemplateId.eq(template_id))
        .all(db)
        .await
        .map_err(|err| AppError::Internal(err.into()))?;

    let mut counts = GenerationProgress {
        total: 0,
        not_created: 0,
        queued: 0,
        processing: 0,
        completed: 0,
        failed: 0,
    };

    for issue in issues {
        counts.total += 1;
        match issue.status.as_str() {
            "not_created" => counts.not_created += 1,
            "queued" => counts.queued += 1,
            "processing" => counts.processing += 1,
            "completed" => counts.completed += 1,
            "failed" => counts.failed += 1,
            _ => {}
        }
    }

    Ok(counts)
}

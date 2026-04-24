pub fn certificate_download_url(certificate_id: &str) -> String {
    format!("/api/v1/public/certificates/{certificate_id}/download")
}

pub fn certificate_verification_url(verification_code: &str) -> String {
    format!("/api/v1/public/certificates/verify/{verification_code}")
}

pub fn certificate_job_events_url(job_id: &str) -> String {
    format!("/api/v1/public/certificates/jobs/{job_id}/events")
}

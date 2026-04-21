// Load test: on-demand certificate generation
// Precondition: participants exist but generated PDFs were cleared
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API_BASE, randomInt } from './common.js';

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '1m', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(50)<500', 'p(95)<5000', 'p(99)<15000'],
    http_req_failed: ['rate<0.05'],
  },
};

const MAX_POLL_ATTEMPTS = 60;

export default function () {
  const email = `participant${randomInt(1, 1000)}@example.com`;

  // Step 1: Request certificate
  const requestRes = http.post(`${API_BASE}/api/v1/public/certificates/request`, JSON.stringify({
    email: email,
  }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'public_request_queued' },
  });

  check(requestRes, {
    'request status is 200 or 202': (r) => r.status === 200 || r.status === 202,
  });

  if (requestRes.status === 200) {
    // Already ready (maybe cache hit or regenerated)
    const certId = requestRes.json('certificate_id');
    if (certId) {
      const downloadRes = http.get(`${API_BASE}/api/v1/public/certificates/${certId}/download`, {
        tags: { name: 'public_download_after_ready' },
      });
      check(downloadRes, {
        'download status is 200': (r) => r.status === 200,
      });
    }
    return;
  }

  if (requestRes.status === 202) {
    const jobId = requestRes.json('job_id');
    const certId = requestRes.json('certificate_id');

    if (jobId) {
      // Step 2: Poll job status
      let ready = false;
      for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
        const statusRes = http.get(`${API_BASE}/api/v1/public/certificates/jobs/${jobId}`, {
          tags: { name: 'public_job_status_poll' },
        });

        if (statusRes.status === 200) {
          const status = statusRes.json('status');
          if (status === 'completed') {
            ready = true;
            break;
          }
          if (status === 'failed') {
            console.warn(`Job ${jobId} failed`);
            break;
          }
        }
        sleep(1);
      }

      if (ready && certId) {
        // Step 3: Download
        const downloadRes = http.get(`${API_BASE}/api/v1/public/certificates/${certId}/download`, {
          tags: { name: 'public_download_after_queue' },
        });
        check(downloadRes, {
          'download after queue status is 200': (r) => r.status === 200,
        });
      }
    }
  }

  sleep(Math.random() * 2);
}

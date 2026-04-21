// Load test: 1000 concurrent users requesting pre-generated certificates
// Precondition: all certificates have been generated via seed-http-data.sh
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API_BASE, randomInt } from './common.js';

export const options = {
  stages: [
    { duration: '30s', target: 100 },
    { duration: '1m', target: 500 },
    { duration: '1m', target: 1000 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(50)<200', 'p(95)<1000', 'p(99)<3000'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const email = `participant${randomInt(1, 1000)}@example.com`;

  // Step 1: Check
  const checkRes = http.post(`${API_BASE}/api/v1/public/certificates/check`, JSON.stringify({
    email: email,
  }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'public_check' },
  });
  check(checkRes, {
    'check status is 200': (r) => r.status === 200,
  });

  // Step 2: Request (should return Ready since pre-generated)
  const requestRes = http.post(`${API_BASE}/api/v1/public/certificates/request`, JSON.stringify({
    email: email,
  }), {
    headers: { 'Content-Type': 'application/json' },
    tags: { name: 'public_request_ready' },
  });
  check(requestRes, {
    'request returns 200 (ready)': (r) => r.status === 200,
  });

  if (requestRes.status === 200) {
    const certId = requestRes.json('certificate_id');
    if (certId) {
      // Step 3: Download
      const downloadRes = http.get(`${API_BASE}/api/v1/public/certificates/${certId}/download`, {
        tags: { name: 'public_download' },
      });
      check(downloadRes, {
        'download status is 200': (r) => r.status === 200,
        'download returns PDF': (r) => r.headers['Content-Type'] === 'application/pdf',
      });
    }
  }

  sleep(Math.random() * 2);
}

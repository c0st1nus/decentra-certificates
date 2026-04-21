// Smoke test: sanity check all public endpoints with 1-2 VUs
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API_BASE, randomInt } from './common.js';

export const options = {
  vus: 2,
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const email = `participant${randomInt(1, 1000)}@example.com`;

  // 1. Check certificates
  const checkRes = http.post(`${API_BASE}/api/v1/public/certificates/check`, JSON.stringify({
    email: email,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
  check(checkRes, {
    'check status is 200': (r) => r.status === 200,
  });

  // 2. Request certificate
  const requestRes = http.post(`${API_BASE}/api/v1/public/certificates/request`, JSON.stringify({
    email: email,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
  check(requestRes, {
    'request status is 200 or 202': (r) => r.status === 200 || r.status === 202,
  });

  // If ready (200), try download
  if (requestRes.status === 200) {
    const certId = requestRes.json('certificate_id');
    if (certId) {
      const downloadRes = http.get(`${API_BASE}/api/v1/public/certificates/${certId}/download`);
      check(downloadRes, {
        'download status is 200': (r) => r.status === 200,
        'download content-type is pdf': (r) => r.headers['Content-Type'] === 'application/pdf',
      });
    }
  }

  sleep(1);
}

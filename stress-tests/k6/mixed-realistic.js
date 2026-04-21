// Mixed realistic load: simulates actual hackathon usage patterns
// 80% check, 15% request, 5% download, occasional verify
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API_BASE, randomInt } from './common.js';

export const options = {
  stages: [
    { duration: '30s', target: 100 },
    { duration: '2m', target: 500 },
    { duration: '1m', target: 1000 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(50)<300', 'p(95)<2000', 'p(99)<10000'],
    http_req_failed: ['rate<0.02'],
  },
};

export default function () {
  const email = `participant${randomInt(1, 1000)}@example.com`;
  const roll = Math.random();

  if (roll < 0.80) {
    // 80%: Just check availability
    const res = http.post(`${API_BASE}/api/v1/public/certificates/check`, JSON.stringify({
      email: email,
    }), {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'mixed_check' },
    });
    check(res, {
      'check status is 200': (r) => r.status === 200,
    });
  } else if (roll < 0.95) {
    // 15%: Request certificate
    const res = http.post(`${API_BASE}/api/v1/public/certificates/request`, JSON.stringify({
      email: email,
    }), {
      headers: { 'Content-Type': 'application/json' },
      tags: { name: 'mixed_request' },
    });
    check(res, {
      'request status is 200 or 202': (r) => r.status === 200 || r.status === 202,
    });

    if (res.status === 200) {
      const certId = res.json('certificate_id');
      if (certId) {
        // 20% of request users also download immediately
        if (Math.random() < 0.20) {
          const dl = http.get(`${API_BASE}/api/v1/public/certificates/${certId}/download`, {
            tags: { name: 'mixed_download' },
          });
          check(dl, {
            'download status is 200': (r) => r.status === 200,
          });
        }
      }
    }
  } else {
    // 5%: Verify random code
    // Use a random verification code pattern (will mostly 404, which is realistic)
    const code = `verify${randomInt(1, 10000)}`;
    const res = http.get(`${API_BASE}/api/v1/public/certificates/verify/${code}`, {
      tags: { name: 'mixed_verify' },
    });
    check(res, {
      'verify status is 200 or 404': (r) => r.status === 200 || r.status === 404,
    });
  }

  sleep(Math.random() * 3);
}

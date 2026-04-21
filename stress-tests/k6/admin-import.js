// Import benchmark: sequential CSV uploads with increasing size
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API_BASE, loginAdmin } from './common.js';

export const options = {
  vus: 1,
  iterations: 3,
  thresholds: {
    http_req_duration: ['p(95)<30000'],
    http_req_failed: ['rate<0.01'],
  },
};

const files = [
  { name: 'participants-1000.csv', data: open('/fixtures/participants-1000.csv') },
  { name: 'participants-5000.csv', data: open('/fixtures/participants-5000.csv') },
  { name: 'participants-10000.csv', data: open('/fixtures/participants-10000.csv') },
];

export function setup() {
  const token = loginAdmin();
  return { token };
}

export default function (data) {
  const token = data.token;
  const fileIndex = (__ITER || 0) % files.length;
  const file = files[fileIndex];

  const formData = {
    file: http.file(file.data, file.name, 'text/csv'),
    event_code: `import-bench-${fileIndex}`,
  };

  const start = Date.now();
  const res = http.post(`${API_BASE}/api/v1/admin/participants/import`, formData, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
    tags: { name: `admin_import_${file.name.replace('.csv', '')}` },
  });
  const elapsed = Date.now() - start;

  check(res, {
    'import status is 200': (r) => r.status === 200,
  });

  if (res.status === 200) {
    const body = res.json();
    console.log(`Import ${file.name}: ${elapsed}ms, inserted=${body.inserted}, updated=${body.updated}, errors=${body.errors.length}`);
  } else {
    console.error(`Import ${file.name} failed: ${res.status} ${res.body}`);
  }

  sleep(2);
}

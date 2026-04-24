// Saturation test: concurrent template preview renders
// This hits the render_semaphore hard
import http from 'k6/http';
import { check, sleep } from 'k6';
import { API_BASE, loginAdmin } from './common.js';

export const options = {
  stages: [
    { duration: '10s', target: 10 },
    { duration: '30s', target: 25 },
    { duration: '30s', target: 50 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(50)<2000', 'p(95)<5000', 'p(99)<10000'],
    http_req_failed: ['rate<0.05'],
  },
};

let accessToken = null;
let templateId = null;

export function setup() {
  const token = loginAdmin();

  // Find the active stress-test-template created by seed-http-data.sh.
  const listRes = http.get(`${API_BASE}/api/v1/admin/templates`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  let tid = null;
  if (listRes.status === 200) {
    const items = listRes.json();
    for (let i = 0; i < items.length; i++) {
      if (items[i].template && items[i].template.name === 'stress-test-template' && items[i].template.is_active) {
        tid = items[i].template.id;
        break;
      }
    }
    if (!tid) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].template && items[i].template.name === 'stress-test-template') {
          tid = items[i].template.id;
          break;
        }
      }
    }
  }

  if (!tid) {
    throw new Error('stress-test-template not found. Run seed-http-data.sh first.');
  }

  return { token, templateId: tid };
}

export default function (data) {
  const token = data.token;
  const tid = data.templateId;

  const res = http.post(`${API_BASE}/api/v1/admin/templates/${tid}/preview`, JSON.stringify({
    preview_name: 'Stress Test Participant',
    layout: {
      page_width: 1920,
      page_height: 1080,
      name_x: 420,
      name_y: 520,
      name_max_width: 1080,
      name_box_height: 81,
      font_family: 'Outfit',
      font_size: 54,
      font_color_hex: '#111827',
      text_align: 'center',
      vertical_align: 'center',
      auto_shrink: true,
    },
  }), {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    tags: { name: 'admin_preview' },
  });

  check(res, {
    'preview status is 200': (r) => r.status === 200,
    'preview returns PNG': (r) => r.headers['Content-Type'] === 'image/png',
  });

  sleep(0.5);
}

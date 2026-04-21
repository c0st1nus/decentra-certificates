// Common utilities for k6 stress tests
import http from 'k6/http';
import { check } from 'k6';

export const API_BASE = __ENV.API_BASE || 'http://127.0.0.1:8080';
export const ADMIN_LOGIN = __ENV.ADMIN_LOGIN || 'admin';
export const ADMIN_PASSWORD = __ENV.ADMIN_PASSWORD || 'strong-password';

export function loginAdmin() {
  const res = http.post(`${API_BASE}/api/v1/admin/auth/login`, JSON.stringify({
    login: ADMIN_LOGIN,
    password: ADMIN_PASSWORD,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });

  check(res, {
    'admin login status is 200': (r) => r.status === 200,
    'admin login returns token': (r) => r.json('access_token') !== undefined,
  });

  return res.json('access_token');
}

export function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function randomEmail(index) {
  return `participant${index}@example.com`;
}

export function buildParticipantEmails(count) {
  const emails = [];
  for (let i = 1; i <= count; i++) {
    emails.push(`participant${i}@example.com`);
  }
  return emails;
}

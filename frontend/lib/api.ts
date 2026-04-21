export interface CertificateRequestSuccess {
  status: "success";
  message: string;
  certificate_id: string;
  verification_code: string;
  download_url: string;
  verification_url: string;
  full_name: string;
  template_name: string;
}

export interface CertificateRequestQueued {
  status: "queued";
  message: string;
  job_id: string;
  certificate_id: string;
  events_url: string;
  verification_url: string;
  full_name: string;
  template_name: string;
}

export interface CertificateJobStatus {
  job_id: string;
  certificate_id: string;
  verification_code: string | null;
  status: "queued" | "processing" | "completed" | "failed";
  message: string;
  full_name: string;
  template_name: string;
  download_url: string | null;
  verification_url: string | null;
  attempts: number;
  updated_at: string;
}

export interface AvailableCertificate {
  template_id: string;
  template_name: string;
  full_name: string;
  category: string | null;
  already_issued: boolean;
  generation_status: "ready" | "queued" | "processing" | "failed" | "not_requested";
  certificate_id: string | null;
  download_url: string | null;
  verification_url: string | null;
}

export interface AvailableCertificatesResponse {
  full_name: string | null;
  certificates: AvailableCertificate[];
}

export interface ApiErrorBody {
  error: string;
  message: string;
}

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8080";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_BASE_URL;

export function buildApiUrl(path: string) {
  return new URL(path, API_BASE_URL).toString();
}

export async function requestCertificate(email: string, templateId?: string) {
  const response = await fetch(buildApiUrl("/api/v1/public/certificates/request"), {
    body: JSON.stringify({ email, template_id: templateId }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  const data = await parseJson<ResponseBody>(response);

  return {
    data,
    response,
  };
}

export async function checkCertificates(email: string) {
  const response = await fetch(buildApiUrl("/api/v1/public/certificates/check"), {
    body: JSON.stringify({ email }),
    headers: {
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  const data = await parseJson<AvailableCertificatesResponse>(response);

  return {
    data,
    response,
  };
}

type ResponseBody = CertificateRequestSuccess | CertificateRequestQueued | ApiErrorBody;

async function parseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

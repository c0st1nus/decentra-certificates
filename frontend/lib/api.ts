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

export interface ApiErrorBody {
  error: string;
  message: string;
}

const DEFAULT_API_BASE_URL = "http://127.0.0.1:8080";

export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_BASE_URL;

export function buildApiUrl(path: string) {
  return new URL(path, API_BASE_URL).toString();
}

export async function requestCertificate(email: string) {
  const response = await fetch(buildApiUrl("/api/v1/public/certificates/request"), {
    body: JSON.stringify({ email }),
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

type ResponseBody = CertificateRequestSuccess | ApiErrorBody;

async function parseJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

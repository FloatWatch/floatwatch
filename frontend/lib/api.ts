export const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api";

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API_URL}${path}`, { ...init, headers, credentials: "include" });
  if (!response.ok) {
    let message = "요청을 처리하지 못했습니다.";
    try {
      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const body = await response.json();
        message = body.detail ?? message;
      } else {
        const body = (await response.text()).trim();
        if (body && body.length < 300) message = body;
        else if (response.status === 413) message = "업로드 파일이 서버의 요청 크기 제한을 초과했습니다.";
        else message = `요청을 처리하지 못했습니다. (HTTP ${response.status})`;
      }
    } catch {}
    throw new ApiError(message, response.status);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

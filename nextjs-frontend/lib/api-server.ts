// Server-side helper for calling the FastAPI backend with the signed-in user's token.
import { getAccessToken } from "@/lib/session";

export type ApiResult<T> = { data?: T; error?: string; detail?: unknown; status: number };

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<ApiResult<T>> {
  const auth = token ?? (await getAccessToken());
  if (!auth) return { error: "Not authenticated", status: 401 };
  try {
    const res = await fetch(`${process.env.API_BASE_URL}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${auth}`,
        ...init.headers,
      },
      cache: "no-store",
    });
    if (res.status === 204) return { status: 204 };
    const body = await res.json().catch(() => undefined);
    if (!res.ok) {
      const detail = body?.detail;
      return {
        status: res.status,
        detail,
        error: typeof detail === "string" ? detail : `Error ${res.status}`,
      };
    }
    return { data: body as T, status: res.status };
  } catch (error) {
    console.error(`API request ${path} failed`, error);
    return { error: "Request failed", status: 0 };
  }
}

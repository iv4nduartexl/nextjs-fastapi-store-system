"use server";

import { cookies } from "next/headers";

const API = process.env.API_BASE_URL;

async function getToken() {
  const cookieStore = await cookies();
  return cookieStore.get("accessToken")?.value;
}

export interface AIProviderPreset {
  id: string;
  label: string;
  base_url: string;
  default_model: string;
  requires_key: boolean;
}

export interface AISettings {
  provider: string;
  base_url: string;
  model: string;
  temperature: number | null;
  has_api_key: boolean;
  api_key_hint: string | null;
  is_custom: boolean;
  presets: AIProviderPreset[];
}

export interface AISettingsInput {
  provider: string;
  base_url: string;
  model: string;
  temperature: number | null;
  api_key?: string;
  clear_api_key?: boolean;
}

export interface AIConnectionDraft {
  provider?: string;
  base_url?: string;
  model?: string;
  api_key?: string;
}

async function call<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ data?: T; error?: string }> {
  const token = await getToken();
  if (!token) return { error: "Not authenticated" };
  try {
    const res = await fetch(`${API}/ai-settings${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return {
        error: typeof err.detail === "string" ? err.detail : `Error ${res.status}`,
      };
    }
    if (res.status === 204) return {};
    return { data: (await res.json()) as T };
  } catch (error) {
    console.error("AI settings request failed", error);
    return { error: "Request failed" };
  }
}

export async function fetchAISettings() {
  return call<AISettings>("");
}

export async function saveAISettings(input: AISettingsInput) {
  return call<AISettings>("", { method: "PUT", body: JSON.stringify(input) });
}

export async function resetAISettings() {
  return call<void>("", { method: "DELETE" });
}

export async function testAIConnection(draft: AIConnectionDraft) {
  return call<{ ok: boolean; error: string | null; detail: string | null }>(
    "/test",
    { method: "POST", body: JSON.stringify(draft) },
  );
}

export async function listAIModels(draft: AIConnectionDraft) {
  return call<{ models: string[]; error: string | null; detail: string | null }>(
    "/models",
    { method: "POST", body: JSON.stringify(draft) },
  );
}

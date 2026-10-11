"use server";

import { cookies } from "next/headers";

const API = process.env.API_BASE_URL;

async function getToken() {
  const cookieStore = await cookies();
  return cookieStore.get("accessToken")?.value;
}

export type ChatErrorCode =
  | "no_api_key"
  | "invalid_api_key"
  | "model_not_found"
  | "rate_limited"
  | "timeout"
  | "connection_error"
  | "bad_request"
  | "provider_error"
  | "too_many_steps"
  | "generic";

export interface PendingAction {
  status: "pending" | "approved" | "rejected";
  name: string;
  preview: Record<string, unknown>;
  result_ok?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "action";
  content: string | null;
  pending_action: PendingAction | null;
  created_at: string;
}

export interface ChatConversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatConversationDetail extends ChatConversation {
  messages: ChatMessage[];
}

export interface ChatResponse {
  conversation_id?: string;
  messages: ChatMessage[];
  error?: ChatErrorCode | null;
  error_detail?: string | null;
}

export interface ChatClientContext {
  locale: string;
  timezone?: string;
  currency_symbol?: string;
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<{ data?: T; status: number }> {
  const token = await getToken();
  if (!token) return { status: 401 };
  try {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...init.headers,
      },
      cache: "no-store",
    });
    if (!res.ok) return { status: res.status };
    if (res.status === 204) return { status: res.status };
    return { data: (await res.json()) as T, status: res.status };
  } catch (error) {
    console.error(`Chat request ${path} failed`, error);
    return { status: 0 };
  }
}

export async function sendMessage(
  message: string,
  conversationId: string | null,
  context: ChatClientContext,
): Promise<ChatResponse> {
  const { data } = await request<ChatResponse>("/chat", {
    method: "POST",
    body: JSON.stringify({
      message,
      conversation_id: conversationId,
      ...context,
    }),
  });
  return data ?? { messages: [], error: "generic" };
}

export async function resolveAction(
  conversationId: string,
  actionMessageId: string,
  approved: boolean,
  context: ChatClientContext,
): Promise<ChatResponse> {
  const { data } = await request<ChatResponse>("/chat/execute", {
    method: "POST",
    body: JSON.stringify({
      conversation_id: conversationId,
      action_message_id: actionMessageId,
      approved,
      ...context,
    }),
  });
  return data ?? { messages: [], error: "generic" };
}

export async function listConversations(): Promise<ChatConversation[]> {
  const { data } = await request<ChatConversation[]>("/chat/conversations");
  return data ?? [];
}

export async function getConversation(
  id: string,
): Promise<ChatConversationDetail | null> {
  const { data } = await request<ChatConversationDetail>(
    `/chat/conversations/${id}`,
  );
  return data ?? null;
}

export async function renameConversation(
  id: string,
  title: string,
): Promise<ChatConversation | null> {
  const { data } = await request<ChatConversation>(
    `/chat/conversations/${id}`,
    { method: "PATCH", body: JSON.stringify({ title }) },
  );
  return data ?? null;
}

export async function deleteConversation(id: string): Promise<boolean> {
  const { status } = await request(`/chat/conversations/${id}`, {
    method: "DELETE",
  });
  return status === 204;
}

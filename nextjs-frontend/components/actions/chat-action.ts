"use server";

import { cookies } from "next/headers";

const API = process.env.API_BASE_URL;

async function getToken() {
  const cookieStore = await cookies();
  return cookieStore.get("accessToken")?.value;
}

export async function sendMessage(message: string): Promise<{ reply: string; toolCall?: any; error?: string }> {
  const token = await getToken();
  if (!token) return { error: "Not authenticated", reply: "" };

  try {
    const res = await fetch(`${API}/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message }),
    });

    if (!res.ok) {
      return { error: `Error ${res.status}`, reply: "" };
    }

    return await res.json();
  } catch (error) {
    return { error: "Failed to send message", reply: "" };
  }
}

export async function executeTool(name: string, args: any): Promise<{ reply: string; result?: any; error?: string }> {
  const token = await getToken();
  if (!token) return { error: "Not authenticated", reply: "" };

  try {
    const res = await fetch(`${API}/chat/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ name, args }),
    });

    if (!res.ok) {
      return { error: `Error ${res.status}`, reply: "" };
    }

    const data = await res.json();
    return { reply: data.reply || "Operación completada.", result: data.result, error: data.error };
  } catch (error) {
    return { error: "Failed to execute tool", reply: "" };
  }
}

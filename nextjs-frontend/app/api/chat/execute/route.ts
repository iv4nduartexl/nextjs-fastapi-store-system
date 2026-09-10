import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const API = process.env.API_BASE_URL;

async function getToken() {
  const cookieStore = await cookies();
  return cookieStore.get("accessToken")?.value;
}

export async function POST(request: NextRequest) {
  const token = await getToken();
  if (!token) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const res = await fetch(`${API}/chat/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.error("Chat Execute API ~ error: ", err);
      return NextResponse.json(
        { error: typeof err.detail === "string" ? err.detail : `Error ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json({ data });
  } catch (error) {
    console.error("Chat Execute API ~ error: ", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
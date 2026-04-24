import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

const API_BASE_URL = process.env.API_BASE_URL;

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;
  if (!token) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const size = searchParams.get("size") ?? "10";
  const page = searchParams.get("page") ?? "1";

  const params = new URLSearchParams({ page, size });
  if (q) params.set("q", q);

  const res = await fetch(`${API_BASE_URL}/customers/?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  if (!res.ok) return NextResponse.json({ error: "Upstream error" }, { status: res.status });
  return NextResponse.json(await res.json());
}

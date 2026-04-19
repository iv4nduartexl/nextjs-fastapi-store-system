import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;

  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const size = request.nextUrl.searchParams.get("size") ?? "500";
  const page = request.nextUrl.searchParams.get("page") ?? "1";
  const q = request.nextUrl.searchParams.get("q");

  const url = new URL(`${process.env.API_BASE_URL}/items/`);
  url.searchParams.set("page", page);
  url.searchParams.set("size", size);
  if (q) url.searchParams.set("q", q);

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });

  const data = await res.json();
  return NextResponse.json(data, { status: res.status });
}

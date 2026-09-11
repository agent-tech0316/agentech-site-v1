import { NextResponse } from "next/server";
import { clearSignedAccountSessionCookie } from "@/lib/server-account-session";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  clearSignedAccountSessionCookie(response);
  return response;
}

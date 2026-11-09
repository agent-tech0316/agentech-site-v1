import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({ error: "Master motion bookings start automatically at their scheduled time." }, { status: 410 });
}

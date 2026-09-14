import { DataPacket_Kind, RoomServiceClient } from "livekit-server-sdk";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAccountRecord, spendAccountCredits } from "@/lib/account-records";
import { isAgentechCompanyEmail } from "@/lib/company-accounts";
import { isValidAccountIdentifier, normalizeEmail } from "@/lib/prototype-auth";
import { getServerAccountEmail } from "@/lib/server-account-session";

export const dynamic = "force-dynamic";

const defaultRoomName = process.env.LIVEKIT_ROOM_NAME || "aegis-lab-1";
const captureTopic = "agentech.capture-image";
const maxImageBytes = 8 * 1024 * 1024;
const base64ChunkSize = 10_000;
const captureBucket = "robot-captures";
const configuredDisplayCaptureCredits = Number(process.env.AGENTECH_CAPTURE_DISPLAY_CREDITS || 10);
const displayCaptureCredits = Number.isFinite(configuredDisplayCaptureCredits)
  ? Math.max(1, Math.floor(configuredDisplayCaptureCredits))
  : 10;

type LocalCapture = {
  captureId: string;
  createdAt: string;
  dataUrl: string;
};

const localCaptureStore = globalThis as typeof globalThis & {
  agentechLatestCapture?: LocalCapture;
  agentechCaptureHistory?: LocalCapture[];
};

type StoredCaptureObject = {
  name: string;
  created_at?: string;
  metadata?: { mimetype?: string };
};

function storageConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "").replace(/\/rest\/v1$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase storage is not configured.");
  return { url, key };
}

function accountCapturePrefix(email: string) {
  return createHash("sha256").update(normalizeEmail(email)).digest("hex");
}

function captureExtensionForMime(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
}

async function uploadStoredCapture(path: string, image: Buffer, mimeType: string) {
  const { url, key } = storageConfig();
  const response = await fetch(`${url}/storage/v1/object/${captureBucket}/${path}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": mimeType, "x-upsert": "false" },
    body: image,
    cache: "no-store"
  });
  if (!response.ok) throw new Error(await response.text() || "Capture storage upload failed.");
}

async function listStoredCaptures(email: string) {
  const { url, key } = storageConfig();
  const prefix = accountCapturePrefix(email);
  const response = await fetch(`${url}/storage/v1/object/list/${captureBucket}`, {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ prefix, limit: 100, offset: 0, sortBy: { column: "created_at", order: "asc" } }),
    cache: "no-store"
  });
  if (!response.ok) throw new Error(await response.text() || "Capture storage listing failed.");
  const objects = await response.json() as StoredCaptureObject[];
  return objects.map((item) => {
    const captureId = item.name.replace(/\.[^.]+$/, "").split("_").pop() || item.name;
    const path = `${prefix}/${item.name}`;
    return {
      captureId,
      createdAt: item.created_at || new Date(0).toISOString(),
      dataUrl: `/api/agentech-capture?file=${encodeURIComponent(path)}`
    };
  });
}

async function readStoredCapture(path: string) {
  const { url, key } = storageConfig();
  const response = await fetch(`${url}/storage/v1/object/authenticated/${captureBucket}/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
    cache: "no-store"
  });
  if (!response.ok) return null;
  return { bytes: await response.arrayBuffer(), mimeType: response.headers.get("content-type") || "image/jpeg" };
}

function authorized(request: Request) {
  const secret = process.env.ROBOT_RUNNER_SECRET;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const derived = serviceRole
    ? createHmac("sha256", serviceRole).update("agentech-capture-upload-v1").digest("hex")
    : "";
  const expected = [secret, derived, process.env.NODE_ENV !== "production" ? "agentech-local-runner" : ""]
    .filter((value): value is string => Boolean(value));
  const provided = request.headers.get("x-robot-runner-secret")
    ?? request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    ?? "";
  return expected.some((value) => {
    const expectedBuffer = Buffer.from(value);
    const providedBuffer = Buffer.from(provided);
    return expectedBuffer.length === providedBuffer.length && timingSafeEqual(expectedBuffer, providedBuffer);
  });
}

export async function GET(request: NextRequest) {
  const email = await getServerAccountEmail(request, { allowLegacyCookie: true });
  if (!isValidAccountIdentifier(email)) {
    return NextResponse.json({ error: "Sign in to view saved robot captures." }, { status: 401 });
  }
  const file = new URL(request.url).searchParams.get("file");
  if (file) {
    const prefix = `${accountCapturePrefix(email)}/`;
    if (!file.startsWith(prefix) || file.includes("..")) {
      return NextResponse.json({ error: "Capture not found." }, { status: 404 });
    }
    const stored = await readStoredCapture(file);
    if (!stored) return NextResponse.json({ error: "Capture not found." }, { status: 404 });
    return new NextResponse(stored.bytes, {
      headers: { "Content-Type": stored.mimeType, "Cache-Control": "private, max-age=3600" }
    });
  }
  const captures = await listStoredCaptures(email);
  return NextResponse.json({
    capture: captures.at(-1) ?? localCaptureStore.agentechLatestCapture ?? null,
    captures: captures.length ? captures : localCaptureStore.agentechCaptureHistory ?? []
  });
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Robot runner authentication failed." }, { status: 401 });
  }

  const mimeType = request.headers.get("content-type")?.split(";")[0] || "image/jpeg";
  if (!new Set(["image/jpeg", "image/png", "image/webp"]).has(mimeType)) {
    return NextResponse.json({ error: "Capture must be JPEG, PNG, or WebP." }, { status: 415 });
  }

  const image = Buffer.from(await request.arrayBuffer());
  if (image.length === 0 || image.length > maxImageBytes) {
    return NextResponse.json({ error: "Capture must be between 1 byte and 8 MB." }, { status: 413 });
  }

  const accountEmail = normalizeEmail(request.headers.get("x-agentech-account-email"));
  if (!isValidAccountIdentifier(accountEmail)) {
    return NextResponse.json({ error: "The code runner did not provide a valid customer account." }, { status: 400 });
  }
  if (!isAgentechCompanyEmail(accountEmail)) {
    const account = await getAccountRecord(accountEmail);
    if (!account) {
      return NextResponse.json({ error: "Customer account not found." }, { status: 404 });
    }
    const spend = await spendAccountCredits(accountEmail, displayCaptureCredits);
    if (!spend || spend.rechargeRequired) {
      return NextResponse.json(
        { error: `Displaying a captured image requires ${displayCaptureCredits} credits.` },
        { status: 402 }
      );
    }
  }

  const roomName = request.headers.get("x-livekit-room")?.trim() || defaultRoomName;
  const captureId = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const encoded = image.toString("base64");
  const storedPath = `${accountCapturePrefix(accountEmail)}/${createdAt.replace(/[:.]/g, "-")}_${captureId}.${captureExtensionForMime(mimeType)}`;
  await uploadStoredCapture(storedPath, image, mimeType);
  if (process.env.NODE_ENV !== "production") {
    const capture = {
      captureId,
      createdAt,
      dataUrl: `data:${mimeType};base64,${encoded}`
    };
    localCaptureStore.agentechLatestCapture = capture;
    localCaptureStore.agentechCaptureHistory = [
      ...(localCaptureStore.agentechCaptureHistory ?? []),
      capture
    ];
  }

  const livekitUrl = process.env.LIVEKIT_URL || process.env.NEXT_PUBLIC_LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!livekitUrl || !apiKey || !apiSecret) {
    if (process.env.NODE_ENV !== "production") {
      return NextResponse.json({ ok: true, captureId, chunks: 0, creditsCharged: 0, transport: "local-preview" });
    }
    return NextResponse.json({ error: "LiveKit is not configured." }, { status: 500 });
  }
  const chunks = Array.from({ length: Math.ceil(encoded.length / base64ChunkSize) }, (_, index) =>
    encoded.slice(index * base64ChunkSize, (index + 1) * base64ChunkSize)
  );
  const client = new RoomServiceClient(livekitUrl, apiKey, apiSecret);
  try {
    await client.createRoom({ name: roomName, emptyTimeout: 10 * 60 });
  } catch (error) {
    const message = error instanceof Error ? error.message.toLowerCase() : "";
    if (!message.includes("already exists")) {
      throw error;
    }
  }

  for (const [index, data] of chunks.entries()) {
    const packet = new TextEncoder().encode(JSON.stringify({
      captureId,
      index,
      total: chunks.length,
      mimeType,
      createdAt,
      data
    }));
    await client.sendData(roomName, packet, DataPacket_Kind.RELIABLE, { topic: captureTopic });
  }

  return NextResponse.json({ ok: true, captureId, chunks: chunks.length, creditsCharged: isAgentechCompanyEmail(accountEmail) ? 0 : displayCaptureCredits });
}

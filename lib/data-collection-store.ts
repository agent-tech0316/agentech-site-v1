import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import type { BuyerWorkspaceData } from "./data-collection";

// Local review storage only. It must never silently become production storage.
const storageDirectory = path.join(process.cwd(), ".data-collection-local");
const queues = new Map<string, Promise<unknown>>();
export function buyerStorageKey(identity: string) { return createHash("sha256").update(identity.trim().toLowerCase()).digest("hex"); }
function fileFor(identity: string) {
  if (process.env.NODE_ENV !== "development") throw new Error("Buyer storage is available for local development only.");
  return path.join(storageDirectory, `${buyerStorageKey(identity)}.json`);
}
export async function readBuyerWorkspace(identity: string): Promise<BuyerWorkspaceData> {
  const file = fileFor(identity);
  try { return JSON.parse(await readFile(file, "utf8")) as BuyerWorkspaceData; }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { profile: null, briefs: [] };
    throw error;
  }
}
export async function updateBuyerWorkspace(identity: string, change: (data: BuyerWorkspaceData) => BuyerWorkspaceData) {
  const file = fileFor(identity);
  const previous = queues.get(file) ?? Promise.resolve();
  const operation = previous.catch(() => undefined).then(async () => {
    const data = change(await readBuyerWorkspace(identity));
    await mkdir(storageDirectory, { recursive: true });
    const temporary = `${file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(data, null, 2), { mode: 0o600 });
    await rename(temporary, file);
    return data;
  });
  queues.set(file, operation);
  try { return await operation; } finally { if (queues.get(file) === operation) queues.delete(file); }
}

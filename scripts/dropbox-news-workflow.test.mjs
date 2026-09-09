import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workflowPath = path.join(repoRoot, ".github", "workflows", "import-dropbox-news.yml");
const bashPath = process.platform === "win32" ? "C:\\Program Files\\Git\\bin\\bash.exe" : "bash";

async function git(cwd, ...args) {
  return execFileAsync("git", args, { cwd });
}

async function getCommitStepScript() {
  const workflow = (await fs.readFile(workflowPath, "utf8")).replace(/\r\n/g, "\n");
  const stepName = "      - name: Commit imported news and asset cleanup\n";
  const stepStart = workflow.indexOf(stepName);
  assert.notEqual(stepStart, -1, "workflow must contain the News commit step");

  const runStart = workflow.indexOf("        run: |\n", stepStart);
  assert.notEqual(runStart, -1, "News commit step must contain a shell block");

  const blockStart = runStart + "        run: |\n".length;
  const remainingLines = workflow.slice(blockStart).split("\n");
  const scriptLines = [];

  for (const line of remainingLines) {
    if (line && !line.startsWith("          ")) break;
    scriptLines.push(line.startsWith("          ") ? line.slice(10) : line);
  }

  return scriptLines.join("\n").trim();
}

async function createGitFixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "dropbox-news-workflow-"));
  const remote = path.join(root, "remote.git");
  const work = path.join(root, "work");

  await fs.mkdir(work, { recursive: true });
  await git(root, "init", "--bare", remote);
  await git(work, "init", "-b", "main");
  await git(work, "config", "user.name", "Fixture User");
  await git(work, "config", "user.email", "fixture@example.com");

  await fs.mkdir(path.join(work, "data"), { recursive: true });
  await fs.mkdir(path.join(work, "public", "assets", "news"), { recursive: true });
  await fs.writeFile(path.join(work, "data", "news-entries.json"), "[]\n");
  await fs.writeFile(path.join(work, "data", "news-imports.json"), "[]\n");
  await fs.writeFile(path.join(work, "public", "assets", "news", ".gitkeep"), "");
  await fs.writeFile(path.join(work, "next-env.d.ts"), "development types\n");
  await git(work, "add", ".");
  await git(work, "commit", "-m", "Initial fixture");
  await git(work, "remote", "add", "origin", remote);
  await git(work, "push", "-u", "origin", "main");

  return { root, remote, work };
}

async function runCommitStep(work) {
  const script = await getCommitStepScript();
  return execFileAsync(bashPath, ["-e", "-c", script], { cwd: work });
}

test("an unrelated Next.js generated-file change does not fail or create a News commit", async (t) => {
  const fixture = await createGitFixture();
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));

  await fs.writeFile(path.join(fixture.work, "next-env.d.ts"), "production types\n");

  await runCommitStep(fixture.work);

  const { stdout: commitCount } = await git(fixture.work, "rev-list", "--count", "HEAD");
  const { stdout: status } = await git(fixture.work, "status", "--short");
  assert.equal(commitCount.trim(), "1");
  assert.equal(status.trim(), "M next-env.d.ts");
});

test("a News data change is committed and pushed without including unrelated build output", async (t) => {
  const fixture = await createGitFixture();
  t.after(() => fs.rm(fixture.root, { recursive: true, force: true }));

  await fs.writeFile(path.join(fixture.work, "next-env.d.ts"), "production types\n");
  await fs.writeFile(path.join(fixture.work, "data", "news-entries.json"), "[{\"slug\":\"new-entry\"}]\n");

  await runCommitStep(fixture.work);

  const { stdout: changedFiles } = await git(fixture.work, "show", "--pretty=format:", "--name-only", "HEAD");
  const { stdout: localHead } = await git(fixture.work, "rev-parse", "HEAD");
  const { stdout: remoteHead } = await git(fixture.work, "rev-parse", "origin/main");
  const { stdout: status } = await git(fixture.work, "status", "--short");
  assert.equal(changedFiles.trim(), "data/news-entries.json");
  assert.equal(localHead.trim(), remoteHead.trim());
  assert.equal(status.trim(), "M next-env.d.ts");
});

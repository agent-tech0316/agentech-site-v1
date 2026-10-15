# Front Right Native Focus Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Front Right focus subscribe only to the robot's native `2064x1552` JPEG stream and publish that one camera to LiveKit at up to 30 FPS without intermediate resizing or JPEG re-encoding.

**Architecture:** The main website and Master Robot Vision publisher will both select the robot-native Front Right `CompressedImage` topic in focus mode. Existing relay focus ownership will suspend the four preview subscriptions, and the production canvas will switch to the selected camera's native dimensions before the existing single H.264 LiveKit encode. Wall mode and every non-Front-Right mode remain unchanged.

**Tech Stack:** Next.js 15, React 19, TypeScript, Node test runner, Vite, Foxglove WebSocket/CDR, browser Canvas, LiveKit WebRTC/H.264, PowerShell, AGENTECH01 scheduled tasks.

## Global Constraints

- Front Right focus resolution is exactly `2064x1552`.
- Front Right focus requests `/aima/hal/sensor/stereo_head_front_right/rgb_image/compressed`.
- Front Right focus targets 30 FPS and publishes one LiveKit track named `master-program`.
- Robot-to-relay JPEG bytes are not resized or re-encoded; only the Foxglove subscription ID may be rewritten.
- Wall mode remains the current four-camera `3840x2160` program.
- Front Main, Front Left, RGB-D Color, Aegis, and Navi behavior must not change.
- Superseded frames are dropped instead of queued.
- The final browser-to-LiveKit H.264 encode remains required.
- Only explicitly listed files are staged because both repositories contain pre-existing unrelated work.

---

## File map

### Main website repository: `mcam`

- `lib/master-live-camera.ts`: public camera topic and resolution metadata used by the local preview.
- `scripts/master-live-camera.test.mjs`: camera allowlist, topic, resolution, and resolver behavior.
- `docs/superpowers/specs/2026-08-13-front-right-native-focus.md`: approved behavior and measured network baseline.

### SDK repository: `mcam/.codex-runtime/agentech_sdk_main`

- `agentech/robots/master/master vision app/src/master-program/latest-frame.js`: production camera topic selection.
- `agentech/robots/master/master vision app/src/master-program/latest-frame.test.mjs`: production allowlist and topic-selection tests.
- `agentech/robots/master/master vision app/src/lib/RobotConnection.test.mjs`: exclusive focus subscription regression coverage.
- `agentech/robots/master/master vision app/src/lib/masterLivekitPublisher.js`: native output-size and one-camera layout helpers.
- `agentech/robots/master/master vision app/src/lib/masterLivekitPublisher.test.mjs`: output-size and layout tests.
- `agentech/robots/master/master vision app/src/master-program/MasterProgram.jsx`: dynamic canvas dimensions and one-to-one draw.
- `agentech/robots/master/master vision app/server/share-server.test.cjs`: relay payload-preservation regression coverage.

### AGENTECH01 deployment

- Local build input: `mcam/.codex-runtime/agentech_sdk_main/agentech/robots/master/master vision app/dist`.
- Remote application: `C:\Users\wesle\OneDrive\Documents\Agentech\agentech_sdk\agentech\robots\master\master vision app`.
- Remote task: `Agentech Master Production Publisher`.
- Hidden connection alias: `ssh agentech01`.

---

### Task 1: Select the native Front Right topic on the main website

**Files:**
- Modify: `lib/master-live-camera.ts:4-7`
- Test: `scripts/master-live-camera.test.mjs:34-45`

**Interfaces:**
- Consumes: `MASTER_LIVE_CAMERAS` and `resolveMasterCameraStream(cameraId, mode, advertisedTopics)`.
- Produces: Front Right metadata with `focusTopic: "/aima/hal/sensor/stereo_head_front_right/rgb_image/compressed"` and `focusResolution: "2064x1552 native"`.

- [ ] **Step 1: Write the failing metadata test**

Change the expected focus arrays and add a direct resolver assertion:

```js
assert.deepEqual(MASTER_LIVE_CAMERAS.map(({ focusTopic }) => focusTopic), [
  "/agentech/web/focus/front_main/compressed",
  "/agentech/web/focus/front_left/compressed",
  "/aima/hal/sensor/stereo_head_front_right/rgb_image/compressed",
  "/agentech/web/focus/rgbd_color/compressed",
]);
assert.deepEqual(MASTER_LIVE_CAMERAS.map(({ focusResolution }) => focusResolution), [
  "960x720 high resolution",
  "960x720 high resolution",
  "2064x1552 native",
  "640x480 native",
]);

const frontRight = MASTER_LIVE_CAMERAS.find(({ id }) => id === "front-right");
assert.deepEqual(
  resolveMasterCameraStream("front-right", "focus", [frontRight.wallTopic, frontRight.focusTopic]),
  { topic: frontRight.focusTopic, resolution: "2064x1552 native", quality: "focus" },
);
```

- [ ] **Step 2: Run the test and verify the red state**

Run: `npm run test:master-live-camera`

Expected: FAIL because Front Right still resolves to `/agentech/web/focus/front_right/compressed` and `960x720 high resolution`.

- [ ] **Step 3: Make the minimal metadata change**

Replace only the Front Right entry:

```ts
{
  id: "front-right",
  label: "Front Right",
  wallResolution: "480x360 low latency",
  wallTopic: "/agentech/web/front_right/compressed",
  focusResolution: "2064x1552 native",
  focusFrameRate: "up to 30 FPS",
  focusTopic: "/aima/hal/sensor/stereo_head_front_right/rgb_image/compressed",
},
```

- [ ] **Step 4: Run the focused test and verify green**

Run: `npm run test:master-live-camera`

Expected: all Master live camera tests PASS.

- [ ] **Step 5: Commit only the main-site metadata and test**

```bash
git add lib/master-live-camera.ts scripts/master-live-camera.test.mjs
git commit -m "feat: use native Front Right focus stream"
```

---

### Task 2: Make production focus exclusive and payload-preserving

**Files:**
- Modify: `agentech/robots/master/master vision app/src/master-program/latest-frame.js:5-22`
- Test: `agentech/robots/master/master vision app/src/master-program/latest-frame.test.mjs:18-34`
- Test: `agentech/robots/master/master vision app/src/lib/RobotConnection.test.mjs:37-47`
- Test: `agentech/robots/master/master vision app/server/share-server.test.cjs:89-176,503-509`

**Interfaces:**
- Consumes: `programTopics(selection)`, `RobotConnection.setFocus(cameraId)`, and the relay's `masterRobotMode: "focus"` ownership rule.
- Produces: one continuous native Front Right subscription after four wall unsubscribe messages, with relay payload bytes unchanged after the transport subscription ID.

- [ ] **Step 1: Write the failing native-topic and exclusivity tests**

Update the production topic expectation:

```js
assert.deepEqual(programTopics({ mode: "focus", cameraId: "front-right" }), [
  "/aima/hal/sensor/stereo_head_front_right/rgb_image/compressed",
]);
```

Strengthen the focus-switch test:

```js
const focusMessages = messages.slice(4);
assert.deepEqual(
  focusMessages.filter(({ op }) => op === "unsubscribe").map(({ subscriptionIds }) => subscriptionIds[0]),
  [1, 2, 3, 4],
);
const focusRequests = focusMessages.filter(({ op }) => op === "subscribe");
assert.equal(focusRequests.length, 1);
assert.equal(focusRequests[0].masterRobotMode, "focus");
assert.equal(focusRequests[0].subscriptions[0].channelId, 202);
```

Make `sendFrame` return its source buffer and compare bytes after the rewritten ID:

```js
const sourceFrame = sendFrame(robotSocket, globalId, 1);
const firstFrame = await first.nextFrame();
assert.equal(firstFrame.readUInt32LE(1), 11);
assert.deepEqual(firstFrame.subarray(5), sourceFrame.subarray(5));
```

```js
function sendFrame(socket, subscriptionId, marker) {
  const payload = Buffer.alloc(14);
  payload.writeUInt8(1, 0);
  payload.writeUInt32LE(subscriptionId, 1);
  payload.writeUInt8(marker, 13);
  socket.send(payload);
  return payload;
}
```

- [ ] **Step 2: Run the focused SDK tests and verify the red state**

Run from `agentech/robots/master/master vision app`:

`node --test src/master-program/latest-frame.test.mjs src/lib/RobotConnection.test.mjs server/share-server.test.cjs`

Expected: FAIL because the production Front Right focus topic is still the resized `/agentech/web/focus/front_right/compressed` topic.

- [ ] **Step 3: Change only the production Front Right focus topic**

In `PROGRAM_STREAMS`, use:

```js
"front-right": {
  previewTopic: "/agentech/web/front_right/compressed",
  focusTopic: "/aima/hal/sensor/stereo_head_front_right/rgb_image/compressed",
},
```

No relay implementation change is required: its existing focus-owner rule already makes preview routes ineligible while focus is active, and its binary routing code rewrites only bytes `1..4`.

- [ ] **Step 4: Run the focused SDK tests and verify green**

Run: `node --test src/master-program/latest-frame.test.mjs src/lib/RobotConnection.test.mjs server/share-server.test.cjs`

Expected: all selected SDK tests PASS.

- [ ] **Step 5: Commit only the SDK topic and regression tests**

```bash
git add "agentech/robots/master/master vision app/src/master-program/latest-frame.js" "agentech/robots/master/master vision app/src/master-program/latest-frame.test.mjs" "agentech/robots/master/master vision app/src/lib/RobotConnection.test.mjs" "agentech/robots/master/master vision app/server/share-server.test.cjs"
git commit -m "feat: focus native Front Right JPEG"
```

---

### Task 3: Publish Front Right with a native-size LiveKit canvas

**Files:**
- Modify: `agentech/robots/master/master vision app/src/lib/masterLivekitPublisher.js:3-17`
- Test: `agentech/robots/master/master vision app/src/lib/masterLivekitPublisher.test.mjs:1-24`
- Modify: `agentech/robots/master/master vision app/src/master-program/MasterProgram.jsx:5,15-83`
- Test: `agentech/robots/master/master vision app/src/master-program/latest-frame.test.mjs:42-53`

**Interfaces:**
- Consumes: normalized `{ mode: "wall" } | { mode: "focus", cameraId }` selection.
- Produces: `masterProgramOutputSize(selection): { width: number, height: number }` and a layout whose Front Right focus rectangle is exactly `2064x1552`.

- [ ] **Step 1: Write the failing output-size and layout tests**

Update the import and add assertions:

```js
import {
  masterProgramLayout,
  masterProgramOutputSize,
} from "./masterLivekitPublisher.js";

test("Front Right focus uses its native canvas while other modes stay 4K", () => {
  assert.deepEqual(masterProgramOutputSize({ mode: "wall" }), { width: 3840, height: 2160 });
  assert.deepEqual(
    masterProgramOutputSize({ mode: "focus", cameraId: "front-right" }),
    { width: 2064, height: 1552 },
  );
  assert.deepEqual(
    masterProgramOutputSize({ mode: "focus", cameraId: "front-main" }),
    { width: 3840, height: 2160 },
  );
  assert.deepEqual(masterProgramLayout({ mode: "focus", cameraId: "front-right" }), [
    { id: "front-right", x: 0, y: 0, width: 2064, height: 1552 },
  ]);
});
```

Strengthen the component source regression:

```js
assert.match(component, /masterProgramOutputSize/);
assert.match(component, /width=\{outputSize\.width\}/);
assert.match(component, /height=\{outputSize\.height\}/);
assert.doesNotMatch(component, /fillRect\(0, 0, 3840, 2160\)/);
```

- [ ] **Step 2: Run the output tests and verify the red state**

Run: `node --test src/lib/masterLivekitPublisher.test.mjs src/master-program/latest-frame.test.mjs`

Expected: FAIL because `masterProgramOutputSize` is not exported and Front Right focus still uses `3840x2160`.

- [ ] **Step 3: Implement the output-size helper and native layout**

Add to `masterLivekitPublisher.js`:

```js
const WALL_OUTPUT = Object.freeze({ width: 3840, height: 2160 });
const FRONT_RIGHT_OUTPUT = Object.freeze({ width: 2064, height: 1552 });

export function masterProgramOutputSize(selection) {
  return selection?.mode === "focus" && selection.cameraId === "front-right"
    ? FRONT_RIGHT_OUTPUT
    : WALL_OUTPUT;
}

export function masterProgramLayout(selection) {
  if (selection?.mode === "focus" && CAMERA_IDS.includes(selection.cameraId)) {
    const output = masterProgramOutputSize(selection);
    return [{ id: selection.cameraId, x: 0, y: 0, width: output.width, height: output.height }];
  }
  return CAMERA_IDS.map((id, index) => ({
    id,
    x: (index % 2) * 1920,
    y: Math.floor(index / 2) * 1080,
    width: 1920,
    height: 1080,
  }));
}
```

In `MasterProgram.jsx`, import the helper, derive `outputSize`, use the canvas's real dimensions when clearing, and bind native dimensions:

```jsx
const outputSize = masterProgramOutputSize(selection);

const output = outputRef.current;
const context = output?.getContext("2d", { alpha: false });
if (context && output) {
  context.fillStyle = "#05080d";
  context.fillRect(0, 0, output.width, output.height);
  for (const rect of masterProgramLayout(selection)) {
    const source = programRef.current?.querySelector(`[data-camera-id="${rect.id}"] canvas[data-capture-target]`);
    if (source?.width && source?.height) context.drawImage(source, rect.x, rect.y, rect.width, rect.height);
  }
}
```

```jsx
<canvas
  ref={outputRef}
  width={outputSize.width}
  height={outputSize.height}
  className="master-program-output"
  aria-hidden="true"
/>
```

Do not change `captureStream(30)`, `maxFramerate: 30`, `videoCodec: "h264"`, `simulcast: false`, or the `master-program` track name.

- [ ] **Step 4: Run the focused output tests and verify green**

Run: `node --test src/lib/masterLivekitPublisher.test.mjs src/master-program/latest-frame.test.mjs`

Expected: all selected output tests PASS.

- [ ] **Step 5: Commit only the SDK canvas files and tests**

```bash
git add "agentech/robots/master/master vision app/src/lib/masterLivekitPublisher.js" "agentech/robots/master/master vision app/src/lib/masterLivekitPublisher.test.mjs" "agentech/robots/master/master vision app/src/master-program/MasterProgram.jsx" "agentech/robots/master/master vision app/src/master-program/latest-frame.test.mjs"
git commit -m "feat: publish native Front Right canvas"
```

---

### Task 4: Build, deploy through the hidden AGENTECH01 connection, and measure

**Files:**
- Verify: all files changed in Tasks 1-3
- Build output: `agentech/robots/master/master vision app/dist`
- Remote replace: `C:\Users\wesle\OneDrive\Documents\Agentech\agentech_sdk\agentech\robots\master\master vision app\dist`

**Interfaces:**
- Consumes: passing main-site tests, passing SDK tests/build, `ssh agentech01`, and the existing scheduled production publisher.
- Produces: a running local preview and production publisher that select only native Front Right, plus measured source FPS, LiveKit FPS, and robot-to-AGENTECH01 traffic.

- [ ] **Step 1: Run all main-site verification**

Run from `mcam`:

```bash
npm run test:master-live-camera
npm run typecheck
npm run build
```

Expected: all commands exit `0`.

- [ ] **Step 2: Run all Master Vision verification and build**

Run from `mcam/.codex-runtime/agentech_sdk_main/agentech/robots/master/master vision app`:

```bash
npm test
npm run build
```

Expected: all tests PASS and Vite writes a successful `dist` build.

- [ ] **Step 3: Package and upload the verified build**

Create `mcam/.codex-runtime/master-front-right-native-dist.zip` from the verified `dist` directory with PowerShell `Compress-Archive`, then upload it through the hidden alias:

```powershell
Compress-Archive -LiteralPath '.\dist' -DestinationPath 'C:\Users\victo\OneDrive\Documents\ChatGPT\Main Site\mcam\.codex-runtime\master-front-right-native-dist.zip' -Force
```

```bash
scp "C:\Users\victo\OneDrive\Documents\ChatGPT\Main Site\mcam\.codex-runtime\master-front-right-native-dist.zip" agentech01:master-front-right-native-dist.zip
```

Expected: upload exits `0`.

- [ ] **Step 4: Replace the remote build recoverably and restart only the production publisher**

Execute this PowerShell through `ssh agentech01`:

```powershell
$ErrorActionPreference = 'Stop'
$appRoot = 'C:\Users\wesle\OneDrive\Documents\Agentech\agentech_sdk\agentech\robots\master\master vision app'
$archive = 'C:\Users\wesle\master-front-right-native-dist.zip'
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$staging = Join-Path $env:TEMP "master-front-right-native-$stamp"
$currentDist = Join-Path $appRoot 'dist'
$backupDist = Join-Path $appRoot "dist.before-front-right-native.$stamp"
$resolvedRoot = (Resolve-Path -LiteralPath $appRoot).Path
if ($resolvedRoot -ne $appRoot) { throw "Unexpected application root: $resolvedRoot" }
Expand-Archive -LiteralPath $archive -DestinationPath $staging -Force
$incomingDist = Join-Path $staging 'dist'
if (-not (Test-Path -LiteralPath (Join-Path $incomingDist 'index.html'))) { throw 'Verified build has no dist/index.html' }
Stop-ScheduledTask -TaskName 'Agentech Master Production Publisher' -ErrorAction SilentlyContinue
Move-Item -LiteralPath $currentDist -Destination $backupDist
try {
  Move-Item -LiteralPath $incomingDist -Destination $currentDist
  Start-ScheduledTask -TaskName 'Agentech Master Production Publisher'
} catch {
  if (Test-Path -LiteralPath $currentDist) { Move-Item -LiteralPath $currentDist -Destination "$currentDist.failed.$stamp" }
  Move-Item -LiteralPath $backupDist -Destination $currentDist
  Start-ScheduledTask -TaskName 'Agentech Master Production Publisher' -ErrorAction SilentlyContinue
  throw
}
$deadline = (Get-Date).AddSeconds(20)
do {
  Start-Sleep -Milliseconds 500
  try { $health = Invoke-RestMethod 'http://127.0.0.1:4175/health' -TimeoutSec 2 } catch { $health = $null }
} until (($health.robot -eq 'connected') -or ((Get-Date) -ge $deadline))
if ($health.robot -ne 'connected') { throw 'Production relay did not reconnect to the robot' }
[pscustomobject]@{
  Robot = $health.robot
  Viewers = $health.viewers
  FramesForwarded = $health.framesForwarded
  Backup = $backupDist
} | ConvertTo-Json -Compress
```

Expected: robot is `connected`, the publisher task is running, and the command reports the recoverable backup path.

- [ ] **Step 5: Verify the original local site behavior**

Open `http://localhost:3200/agentech-products/eaic-hub/watch-live-run?masterCameraPreview=1` in the in-app browser. Enter Front Right focus and verify:

```text
Visible cameras: Front Right only
Label: Front Right · 2064x1552 native
Decoded canvas: 2064 by 1552
Other camera subscriptions: zero while focus owns the relay
```

Return to Camera Wall and verify all four existing `480x360` views return without changed labels or layout.

- [ ] **Step 6: Measure real FPS and network use**

Measure for at least 10 seconds:

```text
Robot source resolution: 2064x1552
Robot source FPS: target at least 30
LiveKit receiver FPS: target as close to 30 as the browser encoder sustains
Robot-to-AGENTECH01 traffic: compare with the 186-301 Mbps usable baseline
Queue behavior: no growing delay; old frames are dropped
```

Use `requestVideoFrameCallback` on the main-site LiveKit video for received FPS and a 10-second `tcpdump` byte count on robot `wifi0` filtered to `dst host 192.168.4.113 and src port 21274` for network traffic.

- [ ] **Step 7: Record final verification without changing unrelated files**

Run `git status --short` in both repositories. Confirm only the planned commits were added and leave pre-existing `package.json`, `.codex-runtime`, prior plan, and optimizer-script changes untouched.
# Historical plan

Preserved during the October 14, 2026 branch consolidation. The active camera implementation has since moved to native H.264; use `docs/operations/master-livekit-production.md` for the current operating contract. This plan does not replace the newer implementation.


import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const controls = readFileSync(new URL("../features/eaic/05-delivery/live-results/components/master-live-camera-controls.tsx", import.meta.url), "utf8");
const camera = readFileSync(new URL("../features/eaic/05-delivery/live-results/components/live-robot-camera.tsx", import.meta.url), "utf8");
const cameraConfig = readFileSync(new URL("../lib/master-live-camera.ts", import.meta.url), "utf8");

test("Master controls expose wall, three front RGB cameras, and RGB-D Color", () => {
  assert.match(controls, /Camera Wall/);
  assert.match(controls, /MASTER_LIVE_CAMERAS\.map/);
  assert.match(camera + controls, /RGB-D Color|MASTER_LIVE_CAMERAS/);
  assert.doesNotMatch(controls, /Depth Map|LiDAR 3D/);
  assert.doesNotMatch(controls, /Rear View/);
});

test("Live camera gates Master controls and keeps the shared Aegies/Navi video path", () => {
  assert.match(camera, /activeRobotModel === "Master"/);
  assert.match(camera, /isMasterCameraSession \? "master-live-1" : roomName/);
  assert.match(camera, /MasterLiveCameraControls/);
	assert.match(camera, /MasterLivekitCameraGrid/);
  assert.equal((camera.match(/<video\b/g) ?? []).length, 1);
  assert.match(camera, /Navi live session: live video only/);
  assert.match(camera, /Aegies live session: display-mode captures/);
});

test("Master defaults to the shared external camera and robot cameras require a user choice", () => {
  assert.match(camera, /useState<"external" \| "robot">\("external"\)/);
  assert.match(camera, /isMasterSession && masterCameraSource === "robot"/);
  assert.match(camera, /External camera/);
  assert.match(camera, /Robot cameras/);
  assert.match(camera, /setMasterCameraSource\("external"\)/);
  assert.match(camera, /setMasterCameraSource\("robot"\)/);
  assert.match(camera, /const masterConnection = isMasterCameraSession/);
});

test("production Master view switches between one JPEG wall track and one native H264 track", () => {
	const grid = readFileSync("features/eaic/05-delivery/live-results/components/master-livekit-camera-grid.tsx", "utf8");
	const tile = readFileSync("features/eaic/05-delivery/live-results/components/master-livekit-video-tile.tsx", "utf8");
	assert.match(camera, /desiredMasterTrackSubscriptions/);
	assert.match(camera, /isApprovedMasterTrackName/);
	assert.match(camera, /setSubscribed/);
	assert.match(camera, /autoSubscribe: !masterConnection/);
	assert.match(camera, /Switching camera/);
	assert.match(camera, /Selected H\.264 camera did not arrive/);
	assert.match(grid, /resolveMasterTrackLayout/);
	assert.match(tile, /requestVideoFrameCallback/);
	assert.match(tile, /setPlayoutDelay\(0\)/);
	assert.match(tile, /H\.264/);
});

test("Master preview is development-only and uses the direct wired camera wall", () => {
  assert.match(camera, /NODE_ENV === "development"/);
  assert.match(camera, /NEXT_PUBLIC_MASTER_CAMERA_PREVIEW/);
  assert.match(camera, /masterCameraPreview/);
  assert.match(camera, /localhost|127\.0\.0\.1/);
  assert.match(controls, /Direct wired Master preview through AGENTECH01/);
  assert.match(controls, /onClick=\{\(\) => void choose\(\{ mode: "focus", cameraId: camera.id \}\)\}/);
  assert.match(controls, /MasterDirectCameraWall/);
  assert.match(controls, /selection=\{selection\}/);
});

test("Master preview can open a requested camera directly from the local URL", () => {
  assert.match(controls, /URLSearchParams\(window\.location\.search\)/);
  assert.match(controls, /get\("masterCamera"\)/);
  assert.match(controls, /camera\.id === cameraId/);
  assert.match(controls, /onSelectionChange\(\{ mode: "focus", cameraId: camera\.id \}\)/);
});

test("Master direct wall starts one bounded H264 decoder per planned camera", () => {
  const wall = readFileSync("features/eaic/05-delivery/live-results/components/master-direct-camera-wall.tsx", "utf8");
  assert.match(wall, /ws:\/\/127\.0\.0\.1:4173\/robot/);
  assert.doesNotMatch(wall, /127\.0\.0\.1:4175/);
  assert.match(wall, /planMasterH264Views\(selection\)/);
  assert.match(wall, /startMasterH264Preview/);
  assert.match(wall, /getMasterH264PreviewUrl\(RELAY_URL, view\.cameraId, view\.mode\)/);
  assert.doesNotMatch(wall, /createImageBitmap|MessageReader|rosmsg/);
  assert.doesNotMatch(wall, /compressed|jpeg/i);
  assert.doesNotMatch(wall, /<img/);
  assert.doesNotMatch(wall, /4K Focus/);
  assert.doesNotMatch(wall, /rear-view|rgb_head_rear/);
});

test("Master direct preview labels actual H264 dimensions and measured FPS", () => {
  const wall = readFileSync("features/eaic/05-delivery/live-results/components/master-direct-camera-wall.tsx", "utf8");
  assert.match(wall, /streamLabels/);
  assert.match(wall, /state\.width/);
  assert.match(wall, /state\.height/);
  assert.match(wall, /state\.fps/);
  assert.match(wall, /setAvailable\(\{\}\)/);
});

test("all four Master views exclusively use the H264 WebCodecs path", () => {
  const wall = readFileSync("features/eaic/05-delivery/live-results/components/master-direct-camera-wall.tsx", "utf8");
  const h264 = readFileSync("features/eaic/05-delivery/live-results/components/master-h264-preview.mjs", "utf8");
  assert.doesNotMatch(wall, /selection\.cameraId === "front-right"/);
  assert.match(wall, /views\.map/);
  assert.match(wall, /H\.264/);
  assert.match(h264, /VideoDecoder/);
  assert.match(h264, /EncodedVideoChunk/);
  assert.match(h264, /`\/h264\/\$\{cameraId\}`/);
  assert.doesNotMatch(h264, /createImageBitmap|new WebSocketImpl\([^)]*\/robot/);
});

test("hidden Master preview tabs release their camera connection", () => {
  const wall = readFileSync("features/eaic/05-delivery/live-results/components/master-direct-camera-wall.tsx", "utf8");
  assert.match(wall, /document\.visibilityState/);
  assert.match(wall, /visibilitychange/);
  assert.match(wall, /Paused while this tab is hidden/);
  assert.match(wall, /document\.removeEventListener/);
});

test("Master controls describe wall and high-resolution focus modes", () => {
  assert.match(controls, /JPEG camera wall/);
  assert.match(controls, /JPEG wall/);
  assert.match(controls, /focusResolution/);
  assert.match(controls, /focusFrameRate/);
  assert.match(cameraConfig, /up to 30 FPS/);
  assert.match(controls, /Native H\.264/);
  assert.doesNotMatch(controls, /four hardware H\.264 streams/);
  assert.doesNotMatch(controls, /4K program|native 4K|One 4K stream max/);
});

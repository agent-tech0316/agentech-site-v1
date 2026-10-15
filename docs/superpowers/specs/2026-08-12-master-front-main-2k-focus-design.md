# Historical design

Preserved during the October 14, 2026 branch consolidation. The active camera implementation has since moved to native H.264; use `docs/operations/master-livekit-production.md` for the current operating contract. This design does not replace the newer implementation.

# Master Front Main 2K Focus Design

## Goal

When a user selects **Front Main** as the only Master camera view, publish and display an aspect-preserving `2560x1851` focus stream. Preserve every currently working setting for the four-camera wall, Front Left, Front Right, RGB-D Color, Aegies, and Navi.

## Current Baseline

The Master camera wall publishes all four cameras at `480x360`, JPEG quality 25, and up to 30 FPS. Solo focus currently publishes Front Main, Front Left, and Front Right through one shared `960x720` hardware converter; RGB-D Color passes through at its native `640x480` resolution.

The Front Main robot source is `2688x1944`. The approved `2560x1851` target preserves that source aspect ratio to rounding and avoids the visible distortion that a `2560x1440` conversion would introduce.

## Selected Architecture

Front Main receives a dedicated subscriber-aware hardware JPEG converter. The existing shared focus service continues to handle Front Left and Front Right at `960x720`, and RGB-D Color continues its native passthrough behavior.

The dedicated Front Main converter:

- subscribes to `/aima/hal/sensor/rgb_head_front_center/rgb_image/compressed`;
- publishes `/agentech/web/focus/front_main/compressed`;
- outputs `2560x1851`, JPEG quality 50, up to 30 FPS;
- uses NVIDIA JPEG decode, resize, and encode;
- keeps only the newest pending input and output frame;
- performs no image conversion while the output topic has no subscribers.

The shared focus service no longer publishes Front Main. This prevents two publishers from writing different resolutions to the same focus topic. Its Front Left, Front Right, and RGB-D Color behavior remains unchanged.

## User-Visible Behavior

| Selection | Resolution | Behavior |
| --- | --- | --- |
| Camera Wall | Four streams at `480x360` | Unchanged |
| Front Main | `2560x1851` | Dedicated 2K focus stream |
| Front Left | `960x720` | Unchanged |
| Front Right | `960x720` | Unchanged |
| RGB-D Color | `640x480` native | Unchanged |

The live-page Front Main badge reports `2560x1851 2K`. The existing selection behavior remains the same: focus mode subscribes only to the selected focus topic, and returning to the wall stops the 2K work when its final subscriber leaves.

The production Master program continues to render one maximum-`3840x2160` output. A selected Front Main frame is aspect-fitted into that canvas without stretching. Aegies and Navi components, rooms, scenes, routes, and settings are outside this change.

## Failure and Rollback Behavior

Deployment is transactional:

1. Back up the current robot-side focus files and launcher.
2. Run local policy, service, and UI tests before deployment.
3. Deploy only the tested Front Main converter, shared focus service, and launcher changes.
4. Restart only `agentech-master-camera-web.service`.
5. Verify every wall and focus topic after restart.
6. Restore the backup and restart the service if any required check fails.

The 2K test is accepted only when:

- Front Main reports exactly `2560x1851`;
- its newest frame remains less than two seconds old throughout verification;
- frames continue arriving without repeated payloads;
- Camera Wall remains `480x360` for all four views;
- Front Left and Front Right remain `960x720`;
- RGB-D Color remains `640x480`;
- switching between Wall, Front Main, Front Left, Front Right, and RGB-D Color works without restarting the relay;
- the local relay stays connected and its forwarded-frame counter increases.

The target frame rate is up to 30 FPS. The implementation does not silently reduce the approved resolution, change JPEG quality, or modify another camera to make the test pass. If the 2K stream cannot remain live under the checks above, deployment rolls back Front Main to the existing `960x720` behavior.

## Testing

Automated tests cover:

- the dedicated Front Main launcher arguments (`2560x1851`, quality 50, up to 30 FPS, subscriber-aware pause);
- the absence of Front Main from the shared focus converter map;
- unchanged Front Left, Front Right, and RGB-D focus behavior;
- unchanged four-camera wall launcher arguments;
- the website resolution label and topic selection;
- the existing Master camera test suites.

Runtime verification measures the robot topics through the same AGENTECH01 relay used by the website. It records dimensions, frame count, observed FPS, duplicate frames, last-frame age, and stream bandwidth. The final browser check confirms that selecting Front Main shows the 2K label and a live canvas, while selecting every other option preserves its approved resolution.

All AGENTECH01 operations use hidden PowerShell/SSH sessions; no visible black CMD window is opened.

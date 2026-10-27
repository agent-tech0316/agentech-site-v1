# Master H.264 Live Stream Operations

## Optional Robot cameras architecture

Normal Master EAIC sessions can use **External camera**, through the established
OBS-to-LiveKit stream. The wall/focus path below applies only after the user
selects **Robot cameras**. See the [current EAIC test and integration
handoff](master-eaic-handoff-2026-10-26.md) for scheduled motion execution and
the distinction between observed external video and pending robot-camera tests.

The Robot cameras path uses a robot-side hardware H.264 service and never sends camera JPEG frames to the website:

`Master raw ROS color topics -> NVIDIA H.264 -> AGENTECH01 primary relay :4175 -> one Go LiveKit publisher -> agent-tech.ai`

The local Codex preview connects to the AGENTECH01 preview proxy on port `4173`. Port `4173` forwards H.264 from the primary relay and must not open a second robot media connection.

The approved cameras are exactly Front Main, Front Left, Front Right, and RGB-D Color. Rear, RGB-D depth, and LiDAR are excluded. Aegis and Navi continue using their existing live-video paths.

## Wall and focus behavior

- Camera Wall starts four robot encoders and publishes four tracks from one LiveKit participant: `master-front-main`, `master-front-left`, `master-front-right`, and `master-rgbd-color`.
- Focus publishes only the selected named track. The robot stops the other three encoders, AGENTECH01 stops their relay subscriptions, and the browser unsubscribes their LiveKit tracks.
- H.264 access units are forwarded without browser-side JPEG decode and without AGENTECH01 resizing or re-encoding.
- The website reports decoded resolution and measured browser FPS. The 30 FPS text is a target, not a substituted measurement.

## Required always-on components

1. Master is powered on and its raw color camera topics are publishing.
2. Master and AGENTECH01 can reach one another over their robot network. Ethernet is not required; the current Wi-Fi path is valid as long as AGENTECH01 can reach Master at the configured address and ports `22164` and `22165`.
3. AGENTECH01 is powered on with one primary relay on `4175`, one preview proxy on `4173`, and exactly one `master-h264-gateway.exe` process.
4. AGENTECH01 can reach the private Vercel gateway endpoint and LiveKit.

The developer laptop is not part of production delivery and may be off or disconnected.

The separate legacy 3-minute Master camera-view test creates or reuses a
`preset_demo` session with no code submission attached to robot execution.
Its text is a zero-command audit artifact. This does **not** describe normal
EAIC Master software checking: supported Agentech upper-body programs now use
the normal reviewed/exempt-account booking and trusted execution path.

## Legacy camera-view acceptance test

1. Sign in as `victoria_c@agent-tech.ai`.
2. Open Code Checking and select **Master**.
3. Paste any test text and start the 3-minute view-only test.
4. Confirm both display gates pass and the response says the text will not execute.
5. Select **Open Master Live Stream** and confirm the active robot model is Master and the Master-only camera controls appear.
6. Confirm Camera Wall shows four moving H.264 tiles from one LiveKit publisher participant.
7. Focus each camera once. Confirm only the selected tile and named LiveKit track remain, then return to Camera Wall.
8. Confirm displayed resolution/FPS are measured values and the participant count does not grow across mode changes.
9. Confirm an unentitled account cannot use this restricted camera-view test.
   Normal Master scheduling follows its normal account and booking policy.

## Media availability boundary

Authorization and camera delivery are separate checks. If the Master page opens with camera controls but remains blank, check in this order:

1. `master-h264-gateway.exe` has exactly one process.
2. `http://127.0.0.1:4175/health` reports `h264.role = primary`.
3. `http://127.0.0.1:4173/health` reports `h264.role = preview`.
4. AGENTECH01 can reach Master ports `22164` and `22165`.
5. The robot `agentech-master-h264.service` is active and has a valid `0600` control-token file.
6. The scheduled Master session is active and unexpired.

Do not weaken account/session authorization to work around a media failure.

## Safe JPEG retirement and rollback

The old Master website JPEG optimizers may be stopped only after a five-minute four-camera H.264 capacity run passes. Retirement is allowlisted by the exact Python entrypoint basenames `master_camera_web_optimizer.py` and `master_camera_focus_service.py`; vendor camera publishers and all motion services remain running. The conflicting legacy `agentech-front-right-h264.service` is backed up and disabled only after the replacement service starts, and is restarted automatically if replacement startup fails.

Deployment backups are timestamped under `/opt/agentech/backups/master-h264` on Master and `%ProgramData%\Agentech\MasterH264\backups` on AGENTECH01. Gateway and relay secrets live only in the restricted `%ProgramData%\Agentech\MasterH264\secrets` directory and must never be written to evidence logs.

## Measured production limits

Record final acceptance measurements here after the hardware run. Do not replace missing measurements with targets.

| Mode | Camera | Resolution | Source FPS | Website FPS | Bitrate | Notes |
|---|---|---:|---:|---:|---:|---|
| Wall | Front Main | pending | pending | pending | pending | Hardware acceptance required |
| Wall | Front Left | pending | pending | pending | pending | Hardware acceptance required |
| Wall | Front Right | pending | pending | pending | pending | Hardware acceptance required |
| Wall | RGB-D Color | pending | pending | pending | pending | Hardware acceptance required |
| Focus | Selected camera | native source | pending | pending | pending | Other three encoders/tracks stopped |

# Historical design

Preserved during the October 14, 2026 branch consolidation. The active camera implementation has since moved to native H.264; use `docs/operations/master-livekit-production.md` for the current operating contract. This design does not replace the newer implementation.

# Front Right Native Focus Design

Date: 2026-08-13

## Goal

When a user opens **Front Right** by itself, deliver the robot camera's existing compressed JPEG stream at its native `2064x1552` resolution with the highest sustainable frame rate, targeting a LiveKit output of 30 FPS. The four-camera wall and every other camera focus mode must remain unchanged.

## Current behavior

- Wall mode subscribes to four optimized `/agentech/web/...` preview topics and publishes one composed `3840x2160` LiveKit track.
- Front Right focus mode currently subscribes to `/agentech/web/focus/front_right/compressed`, which is a resized `960x720` stream.
- The relay forwards binary frames while rewriting only the Foxglove subscription identifier; it does not decode or re-encode the JPEG image payload.
- The production publisher currently draws every focus source into a `3840x2160` output canvas before the browser encodes that canvas as one H.264 LiveKit track.

## Agreed behavior

### Four-camera wall

Wall mode remains exactly as it is now. It continues to subscribe to the four optimized preview streams and display the existing 2x2 grid.

### Front Right focus

Selecting Front Right will:

1. Unsubscribe every active wall-camera subscription.
2. Subscribe only to `/aima/hal/sensor/stereo_head_front_right/rgb_image/compressed`.
3. Forward the existing ROS `CompressedImage` JPEG payload through the relay without resizing or JPEG re-encoding.
4. Decode only the newest received JPEG in the browser, dropping superseded undecoded frames so latency cannot grow into a queue.
5. Draw the decoded image one-to-one onto a `2064x1552` production canvas without scaling.
6. Publish only that canvas as the existing single `master-program` LiveKit video track, capped at 30 FPS.

The final browser-to-LiveKit conversion to H.264 is unavoidable because LiveKit/WebRTC does not transport the ROS JPEG stream directly. The no-resize/no-re-encode guarantee applies to the robot-to-relay JPEG path and to avoiding any intermediate JPEG conversion; the browser performs one JPEG decode and LiveKit performs one final video encode.

### Other focus modes

Front Main, Front Left, and RGB-D Color retain their current topics, resolutions, layout, and frame-rate settings. Aegis and Navi behavior is outside this change and must not be modified.

### Returning to wall mode

Closing Front Right focus clears its native subscription and restores the same four optimized preview subscriptions used by the current wall.

## Component changes

### Main website

- Change only the Front Right focus metadata in `lib/master-live-camera.ts` to use the native compressed topic and show `2064x1552 native`.
- Keep the current `MasterDirectCameraWall` selection behavior: focus mode filters the request to one camera, while wall mode requests all four.
- Add regression coverage proving Front Right resolves to the native compressed topic in focus mode and that the other cameras retain their existing focus topics.

### Master Robot Vision publisher

- Change only Front Right's focus topic in `src/master-program/latest-frame.js` to the native compressed topic.
- Keep the current `RobotConnection.setFocus` flow, which first unsubscribes existing subscriptions and then promotes only the selected camera as a continuous RGB focus subscription.
- Add an explicit output-size/layout helper: Front Right focus uses `2064x1552`; wall mode and all other focus modes keep `3840x2160`.
- Make `MasterProgram` size and clear the output canvas from that helper instead of hard-coded dimensions. Front Right is drawn at `(0, 0, 2064, 1552)` with no resampling.
- Keep one LiveKit track, H.264, simulcast off, and a maximum frame rate of 30. No additional camera tracks are published.

### Relay

No production transformation is added. The relay's existing focus-owner rule makes focus exclusive upstream: while the Front Right focus client owns focus, preview routes from other clients are ineligible and their robot-side subscriptions are stopped. A regression test will verify that relayed binary image bytes remain identical except for the transport subscription-ID field that the relay must rewrite for routing.

## Performance behavior

- The publisher requests a continuous Front Right source and captures at 30 FPS.
- If the robot, Wi-Fi, browser decoder, encoder, or LiveKit connection cannot sustain 30 FPS, the newest-frame gates drop old frames rather than displaying queued history.
- Success is measured at the LiveKit receiver, not from the configured `30 FPS` label alone.
- The test run will record source resolution, received source FPS, published/received LiveKit FPS when available, and visible latency/jumping.

## Network baseline

A read-only measurement on 2026-08-13 confirmed that the robot reaches AGENTECH01 at `192.168.4.113` through the robot's `wifi0` interface on the 5 GHz `agentech` network:

- Channel: 52, 80 MHz, Wi-Fi 6/HE
- Robot signal: `-37` to `-42 dBm`
- Negotiated robot transmit PHY rate: `600.4` to `1080.6 Mbps`
- Negotiated robot receive PHY rate: `960.7` to `1200.9 Mbps`
- Active TCP round-trip time to AGENTECH01: approximately `1.8` to `2.2 ms`
- TCP delivery-rate estimate while the camera connection was active: approximately `186` to `301 Mbps`, with a separately observed peak of approximately `472 Mbps`
- Actual production camera traffic during a 10-second packet capture: `14.30 Mbps`
- AGENTECH01 route adapter: Realtek Gaming 2.5GbE, negotiated at `1 Gbps`

The PHY rate is not usable application throughput. For planning, use the measured TCP delivery range rather than the `600-1080 Mbps` Wi-Fi link label. The native Front Right stream previously measured about `26.4 Mbps` at 30 FPS, so this path has sufficient bandwidth margin if the robot, browser JPEG decoder, and LiveKit H.264 encoder keep up. A dedicated `iperf3` server was not available on AGENTECH01, so the delivery-rate value is an estimate from the live TCP connection, not a destructive saturation test.

## Error handling

- If the native Front Right topic is unavailable, the page shows the existing unavailable/waiting state rather than silently subscribing to another camera.
- A reconnect while Front Right is selected restores only the Front Right native subscription.
- Returning to wall mode restores all four wall subscriptions.

## Verification

1. Unit test stream resolution and topic selection on the main website.
2. Unit test production topic selection, output size, and layout.
3. Unit test focus subscription messages so only Front Right is subscribed after the wall is cleared.
4. Regression test relay payload preservation.
5. Run the complete existing test suites and production builds for both projects.
6. Deploy the local build to the existing AGENTECH01 preview path, open the original local site, focus Front Right, and verify `2064x1552` plus the measured frame rate.
7. Measure Front Right's actual robot-to-AGENTECH01 traffic and compare it with the `186-301 Mbps` usable delivery baseline.
8. Confirm that leaving focus restores the unchanged four-camera wall.

## Acceptance criteria

- Front Right focus receives the native `2064x1552` compressed JPEG topic.
- No other camera remains subscribed while Front Right is focused.
- Robot-to-relay JPEG content is not resized or re-encoded.
- LiveKit publishes only the existing single selected-camera program track in this mode, targeting 30 FPS.
- The Front Right production canvas is `2064x1552` and does not scale the decoded image.
- The wall and all non-Front-Right modes behave exactly as before.

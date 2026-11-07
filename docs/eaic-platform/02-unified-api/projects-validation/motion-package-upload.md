# Movement and audio package identification

The existing account-authorized EAIC File submissions flow now inspects ZIP
contents when the upload is submitted. One `.onnx` file is assigned to movement
and an optional `.wav` file to audio. Their paths, SHA-256 hashes, sizes and
pairing are saved together in a private `content_manifest` metadata object.
Receipts include that manifest when read by the owning account.
The UI shows both files and WAV duration, sample rate and channel count.

This uses the existing signed direct-to-storage upload. The binary ZIP does
not pass through the site's JSON API, including packages larger than a
serverless function's request-body limit. The existing signed-account and
account-exemption requirements remain in force. Classification does not grant
an account an exemption or grant permission for a new robot command.

## Content rules

- Archive and standalone file limit: 64 MiB. ZIP expansion limit: 96 MiB,
  64 entries, 64 MiB per entry.
- Exactly one movement ONNX in a ZIP; zero or one WAV. Multiple policies or
  audio tracks are rejected rather than paired arbitrarily.
- Nested directories are supported. Duplicate paths (including case
  collisions), unsafe paths, links, encryption and corrupt file data are refused.
- ONNX protobuf graph metadata must be readable. Top-level external weights
  are unsupported. This metadata inspection is not an ONNX checker, inference
  test, operator audit or robot compatibility qualification.
- WAV must be complete uncompressed PCM with consistent frame/sample metadata.
- Other files are references only. README text and scripts inside an archive
  are never executed or treated as instructions.

The known Kuaile movement is recognized by its embedded ONNX SHA-256 rather
than the ZIP name or archive hash. A renamed or repacked archive containing
that identical policy therefore retains its registered motion association.
It is accepted only under Master, with Master Ultra hardware compatibility
still required at execution. An unrelated model is not assigned that motion.

## Rollout

Install dependencies with the project's package manager and deploy the route/UI.
No database migration is required. The existing database columns, row ownership,
approvals and private bucket remain in use. The server writes a metadata object
under the owning account's `manifests/v1/<receipt-id>/<archive-sha256>.json`
directory in the same bucket. Customer signed-upload links cannot target that
directory. Metadata never changes the underlying uploaded bytes or approval.
Older receipts show **Identify contents**; this rechecks the stored object and
saves its metadata only when the owner and archive hash match. The server caps
inspection at 64 MiB even if the bucket's upload limit is higher.

Newly inspected receipts are idempotent. Storage/DB failures remain failures;
an invalid or ambiguous package does not create an approval receipt.

## Execution boundary

This change implements upload, identification, persistence and presentation.
It does not add a generic ONNX execution loop, bypass reviewed scheduling or
send commands to hardware. A robot adapter must resolve the approved movement
and audio paths from the same manifest, verify both digests, and provide the
audio association to its supported coordinated playback interface. It must
never infer a robot's observation construction, timestep, control configuration
or physical compatibility from the ONNX extension alone.

## Verification

```text
node --experimental-transform-types --test scripts/eaic-full-exemption.test.mjs scripts/eaic-motion-package.test.mjs
pnpm typecheck
pnpm build
```

Set `EAIC_HAPPY_DANCE_FIXTURE` to the original local Kuaile ZIP to include the
real policy/audio fixture tests without adding private binaries to the repo.
`scripts/eaic-motion-package-browser-check.mjs` exercises the exact certification
route with isolated HTTP fixtures. Set the same fixture path, a local dev
origin in `EAIC_PACKAGE_ORIGIN`, and optional `AGENTECH_PLAYWRIGHT_PATH` and
`EAIC_PACKAGE_QA_DIR`. It checks upload, labels, pairing after reload and
mobile overflow in light/dark themes, without cloud writes or robot requests.

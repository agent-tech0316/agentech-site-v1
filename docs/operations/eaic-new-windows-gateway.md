# Install EAIC on a new Windows PC

[Download gateway 1.0.1 and its checksum](https://github.com/agent-tech0316/agentech-site-v1/releases/tag/eaic-gateway-v1.0.1).
This patch fixes Windows credential loading, including protected files saved
with line endings by gateway 1.0.0. The cloud key and OBS password remain
protected with Windows DPAPI. It does not change robot commands or admission.

This package prepares a **separate gateway PC**. Installing it does not start a
gateway, connect to a robot, change a controller, or qualify physical motion.
The existing gateway is not modified.

## What is included

- Windows x64 installer with private Node and Python runtimes; no developer tools required.
- Pinned Agentech SDK, Master/Navi/Aegis trusted runners, restricted compiler,
  command contract, hash manifest and read-only diagnostics. Python includes
  report generation, SSH and Navi's optional vision/home dependencies.
- Current customer commands and structured results, including Navi
  `data = Agentech.read()` followed by `Agentech.report(data=data)`.
- `SDK-COMMANDS.md` and `scripts/eaic-sdk-contract.json` list every inventoried
  function, signature, access policy and source revision. Teaching, controller
  maintenance, raw Navi catalog dispatch and disabled methods remain outside
  customer execution. Named customer wrappers retain their SDK preparation guards.

The package supplies gateway software. OBS Studio and Windows OpenSSH Client
are separate prerequisites. Aegis also needs the matching SDK and FF dependencies
on its robot-side Linux computer. Master needs its reviewed deployment file,
controller approvals and verified existing ownership. Navi uses rosbridge on
the robot. No robot-side deployment or physical commissioning is included.

## PC and network

Use Windows 11 x64 with a supported installation, 16 GB RAM, at least 10 GB free
SSD space for software plus space for recordings, reliable Ethernet and a CPU
with hardware video encoding if this PC also runs OBS. These are deployment
recommendations, not a measured minimum or a camera-capacity guarantee.
The package targets x64, not Windows on ARM.

The PC needs outbound HTTPS to Agentech cloud and the recording destination;
local access to its assigned robots (Navi rosbridge 9090; SSH 22 for robot-side
adapters), cameras and local OBS WebSocket 4455. Keep robot services on the
private LAN. No public inbound port forwarding is required by this package.
Remote access can use the organization's separately managed VPN or support tool.

## Setup

1. Run `EAIC-Gateway-1.0.1-Setup-Windows-x64.exe`. It installs into the current
   user's Local AppData and adds Start menu shortcuts. The installer is unsigned.
   Verify its SHA-256 against the accompanying release checksum before use.
2. Run **Offline check**. It verifies every packaged file, SDK API pins, imports
   and a read/report compilation while blocking network and process transports.
3. Install and configure OBS Studio for the actual camera, stream destination
   and local password-protected WebSocket service. Install OpenSSH Client if
   Aegis is enabled. Verify SSH host fingerprints independently before trusting
   the robot. Never disable host-key checking to get a green check.
4. Run **Configure** from this same Windows user. Provide a unique gateway name,
   selected models, cloud URL/key, OBS password and robot endpoints. Cloud and
   OBS credentials are protected with Windows DPAPI for this user. They are
   not included in the downloadable package. Restrict access to this account.
5. Assign only booking IDs reserved for this PC. **Before starting, keep other
   legacy gateways offline or configure them with disjoint explicit booking
   lists.** A legacy unscoped gateway can still discover the same cloud bookings.
   The new gateway's model/ID allowlist prevents it from polling other bookings;
   it does not migrate cloud resources or prove exclusivity on other PCs.
   Do not reuse a physical robot concurrently across gateways.
6. For Master, review a deployment file for this PC's absolute SDK path and all
   required SDK file pins. Do not copy an old machine's enabled file unchanged.
   For Aegis, provision the pinned SDK on the robot through the operator workflow.
   The generic command route refuses a mismatched robot-side SDK API.
7. Run **Connectivity check**. It checks package integrity, cloud authentication,
   assigned robot ports, local OBS port, and Aegis SSH host-key/key access when
   selected. It does not move a robot, publish a stream, verify OBS authentication,
   establish controller readiness, or qualify a physical command.
8. Commission the camera, cloud booking, artifacts, hardware e-stop and each
   robot with the on-site operator. Retain an identified test booking and real
   execution receipt. Run **Start gateway** only after those arrangements are in
   place. This starts the real bridge and can execute assigned, reviewed bookings.

Start runs in its console so an operator can inspect logs. There is no automatic
startup task or broad firewall rule. The launcher refuses a second instance in
the same installation. To change assignments, first verify there is no active,
staged, due or cleanup-owned session, then use the established guarded gateway
maintenance workflow. Never terminate a robot joint controller to restart a PC
bridge. A future runtime update must use the reviewed atomic release procedure.

## Command and evidence boundaries

Customer source is parsed into an inert plan; it is never executed as Python.
The cloud and edge validate the command contract, parameters, IDs and hashes.
Connection settings and paths belong to the operator/session workspace.
Booking, entitlements, hardware faults, existing ownership, SDK qualification and
native controller admission remain authoritative. Passing software review is
not physical PASS. An SDK operation that remains disabled or unqualified must
return its blocker rather than a manufactured success.
Telemetry-only Navi sessions do not send posture, stop or damping commands and
do not manufacture a physical reset or home-position receipt.

Master seated actions require an already healthy powered seated controller with
the same owner before and after the action. Customers cannot start, replace or
release that controller. Mixed seated/standing customer programs are refused.
Scheduled plain Master head calls retain the gateway's standing default; use an
explicit seated posture only with the existing commissioned seated owner.

Public command results preserve structured values, with connection credentials
redacted. A result is limited to 2 MB and a program's combined results to 3 MB,
with a clear failure on overflow; select fewer columns or a smaller recording.
The normal Navi read/report pair fits this budget. Record tables include at most 1,000
rows with an explicit truncation flag. Generated report files remain in the
session workspace; this package does not add a cloud PDF download endpoint.

For readiness, retain the package manifest, offline diagnostic output,
connectivity results and the separately supervised booking/robot evidence.
Before hardware commissioning the correct status is **installation prepared;
physical and end-to-end qualification pending**.

Runtime lifecycle reference: [Node.js release policy](https://nodejs.org/en/about/previous-releases).

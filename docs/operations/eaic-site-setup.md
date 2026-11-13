# Set up a new EAIC venue on Windows

Download the installer and checksum from the [EAIC Site Setup release](https://github.com/agent-tech0316/agentech-site-v1/releases/tag/eaic-site-setup-v1.0.0).

1. Run `EAIC-Site-Setup-Windows-x64.exe`. The default folder is
   `%LOCALAPPDATA%\Agentech\EAIC Site Setup`. Open **EAIC Site Setup folder**
   from the Windows Start menu to find it.
2. Copy the privately supplied `Site connection.json` beside `START HERE.cmd`.
   The included `Site connection.example.json` shows the format. Fill in
   `cloudUrl` and `cloudKey` for Supabase, and `whipServer` and `whipToken` for
   LiveKit WHIP. For Aegis, supply `aegisUser` and optionally `aegisKeyName`,
   a filename under the Windows account's `.ssh` directory.
3. Open **EAIC Site Setup** and press Enter for **Quick setup**. It verifies
   the pinned Gateway 1.0.1 and OBS Studio 33.0.1 installers, runs the gateway
   offline check, and asks for the robot model, LAN IP and external camera.
   It configures OBS and LiveKit and checks cloud and robot connectivity.
   Check the moving picture in the OBS preview.
4. After the previous venue gateway finishes its active sessions and cleanup,
   take it offline. Press **S** and keep the window open. The listener waits
   for eligible bookings for the selected model, even with an empty calendar.
   Verify website video, the execution receipt and cleanup in a supervised booking.

The gateway stores the cloud and OBS WebSocket credentials using Windows DPAPI
for the user that ran Quick setup. OBS stores the LiveKit publishing token in
its local profile. Keep the filled JSON in private credential storage and supply
it again when rerunning Quick setup. Normal startup uses saved settings.

For offline software staging, place the pinned Gateway and OBS installers in
a `Programs` folder beside `START HERE.cmd`. Setup verifies local copies too.
Menu **V** installs Microsoft's signed Visual C++ x64 runtime when needed.
The optional LiveKit CLI is available from its [upstream release](https://github.com/livekit/livekit-cli/releases/tag/v2.19.4).

Navi requires rosbridge on port 9090. Aegis requires Windows OpenSSH, a
provisioned SSH key, a trusted host key and the matching operator-supplied
robot-side Linux SDK. Master requires an enabled deployment reviewed for this
robot and PC, with its SSH password supplied at startup. Menu **M** prepares
a disabled deployment draft. Master onboard cameras and newer Ultra motion
uploads require their separately provisioned gateway and runtime.

For explicit booking ID assignments, see the
[standalone gateway guide](eaic-new-windows-gateway.md).

# VORLD development

VORLD is Agentech's Electron desktop app for AI chat, robot controls, cameras, and headband connections. This guide covers the Windows source for version 0.45.0, Build 51.

## Install the app

Download the Windows x64 installer from https://www.agent-tech.ai/agentech-products/eaic and run it. Sign in with your Agentech website account. The installer is currently unsigned.

## Run from source

You need Windows x64, Node.js 24 with npm, and the VORLD app source supplied by Agentech. The installer and the website repository's automatic GitHub source archives do not contain the desktop development project.

Open PowerShell in the app source folder containing `package.json` and `main.cjs`:

```powershell
node --version
npm.cmd ci
npm.cmd start
```

Start with Preview mode. Connect a robot on the same network when you are ready to test hardware.

## Where to edit

- `renderer/`: screens, styles, and browser-side UI.
- `main.cjs`: desktop lifecycle and app commands.
- `preload.cjs`: the bridge between the UI and desktop code.
- `agent-service.cjs`: AI agent integration.
- `master-camera-service.cjs`: camera connection handling.
- `tests/`: automated tests.
- `backend/`: the separate Agentech-funded AI service.

Restart the app after changing desktop code. Users' chats and settings are stored separately from the source folder.

## Check changes

```powershell
npm.cmd run check
npm.cmd test
```

These checks do not prove a live robot or camera works. Verify the changed feature in the running app too.

## Build the Windows installer

The current source snapshot contains build paths from Agentech's build computer. On another computer, update these fields in `package.json` first:

- `build.directories.output`: choose a local output folder, such as `dist`.
- `build.electronDist`: point to your matching Windows Electron distribution (normally `node_modules/electron/dist`).
- `build.extraResources`: point the Python runtime and Python packages entries to the Windows runtime bundle supplied with the source. Keep their destination paths unchanged. The current bundle uses Python 3.14 and matching Windows dependencies.

Keep `vendor/windows-runtime-modules` available for the packaged native dependencies. Then run:

```powershell
npm.cmd run package:win
```

Find the `.exe` in the configured output folder. Use `package:win` for Windows; the `package` command builds the macOS app. A public release should also be tested by installing the generated `.exe` on a clean Windows account.

## AI configuration

Agentech-funded chat uses a separately deployed backend. Keep company API keys in that server's `.env`; never bundle them in the desktop app or commit them to Git. See `backend/README.md` for server setup. Codex and Gemini connections are configured in the app's AI settings.

## Update the website download

Upload the tested installer as a GitHub release asset, verify its size and SHA-256, then update `lib/vorld-release.ts` in the Agentech website repository. The EAIC page reads its version and download URL from that file. Publish only after the release download works without signing in.

## SDK availability audit

See [the SDK audit](./VORLD-SDK-Audit.md) for the pinned GitHub comparison and bundled runtime version gaps. Run `npm.cmd run generate:sdk` to regenerate the supported catalog.

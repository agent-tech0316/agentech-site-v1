<p align="center">
  <img src="public/assets/logo/AGENTECH.png" alt="Agentech" width="420" />
</p>

# Agentech Website

[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-149eca)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-ready-3178c6)](https://www.typescriptlang.org/)

Agentech Website is the main web platform for Agentech robotics, education, talent programs, product documentation, EAIC HUB developer workflows, account tools, robot live viewing, and automated news publishing.

The repository is designed to work like a professional product codebase: public pages live beside operational documentation, hidden launch switches are easy to find, and repeatable content flows such as News can be maintained through GitHub.

Repository: [agent-tech0316/agentech-site-v1](https://github.com/agent-tech0316/agentech-site-v1)

## EAIC Product Workflow

![EAIC product architecture](docs/eaic-platform/assets/eaic-product-architecture.png)

The EAIC product workflow follows one unified, API-driven operating loop:

1. **Client entry points** — EAIC Hub today, with EAIC CLI, World macOS, and World iOS as companion clients.
2. **Unified API layer** — shared identity and access, project validation, resource and run, and live-result contracts.
3. **Cloud core** — project packaging, cloud validation, AI review, resource reservation, deployment authorization, account quotas, robot catalogs, and run auditing.
4. **Edge and robot execution** — approved projects flow through warehouse services, behavior parsing, robot runtimes, and supervised physical execution.
5. **Live data and delivery** — live video, telemetry, logs, files, reports, and usage return through the unified API to each client.

The implementation and team-ownership map lives in [`features/eaic/`](features/eaic/), with supporting workflow documentation in [`docs/eaic-platform/`](docs/eaic-platform/).

## What This Repository Contains

- Public company website for Robotics, Education, Bots, Talents, About, and News.
- Dropbox-driven News importer for publishing dated folders as website articles.
- Supabase-backed accounts, profiles, children, enrollments, preorder requests, invoices, and applications.
- Resend-backed application, invoice, and notification email flows.
- Hidden product documentation page at `/agentech-products/documents`.
- Products/EAIC HUB robot command workspace at `/agentech-products/eaic-hub`.
- Developer code review pipeline for uploaded `.py` files: Step 3 Physical Hardware Check, Supabase gate marking, Step 4 GPT Software Check, account-credit charging, and Step 5 Live Stream unlock.
- Internal launch switches for preorder, enroll, and grade visibility.

## Documentation Map

Master EAIC coworkers: see the [October 26 integration and test
handoff](docs/operations/master-eaic-handoff-2026-10-26.md) for recorded passes,
remaining failures, timing changes, deployment state, and tomorrow's scheduled
arm/waist tests. Custom speed and effort testing are still pending.

| Area | Location |
| --- | --- |
| App routes and API routes | `app/` |
| Shared UI and forms | `components/` |
| Business logic and service helpers | `lib/` |
| EAIC workflow modules | `features/eaic/` |
| Static and imported data | `data/` |
| Images, logos, QR codes, news media | `public/assets/` |
| Maintenance and importer scripts | `scripts/` |
| Operator documentation | `docs/` |
| Supabase schema | `supabase-schema.sql` |

Important documents:

- [Contributing and repository workflow](CONTRIBUTING.md)
- [Software Check access policy](docs/software-check-access-policy.md)
- [Offline website verification matrix](docs/robot-test-matrix.md)
- [AEGIS Session 43 Gateway runbook](docs/aegis-session-43-gateway-runbook.md)
- [Dropbox News automation](docs/dropbox-news-automation.md)
- [Documentation index](docs/documentation-index.md)
- Hidden product documents page: `/agentech-products/documents`
- Products/EAIC HUB page: `/agentech-products/eaic-hub`

The product documents page is intentionally not linked from public navigation and is marked `noindex`. It still works by direct URL for internal review.

The Agentech Products experience is EAIC HUB. It is marked `noindex` and treated as collaborator/developer-only: share the direct link only with team members, instructors, students, or developers who are supposed to preview the robot command API, upload `.py` files for review, or schedule supervised robot tests.

## Quick Start

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open:

```text
http://localhost:3000
```

Build and run production locally:

```bash
npm run build
npm run start
```

Preview production on port 3001:

```bash
npm run serve:3001
```

Hidden documents preview:

```text
http://localhost:3001/agentech-products/documents
```

Products/EAIC HUB preview:

```text
http://localhost:3001/agentech-products/eaic-hub
```

## Environment Variables

Create local environment variables as needed:

```text
NEXT_PUBLIC_SITE_URL=
NEXT_PUBLIC_GA_MEASUREMENT_ID=
NEXT_PUBLIC_LIVEKIT_URL=
NEXT_PUBLIC_LIVEKIT_ROOM_NAME=

SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
LIVEKIT_ROOM_NAME=
ROBOT_RUNNER_SECRET=
AGENTECH_CAPTURE_DISPLAY_CREDITS=10
ROBOT_STREAM_START_HOUR=8
ROBOT_STREAM_END_HOUR=22
ROBOT_STREAM_PREP_SECONDS=120
ROBOT_STREAM_POLL_MS=5000
AGENTECH_CAPTURE_UPLOAD_URL=https://www.agent-tech.ai/api/agentech-capture
ROBOT_HOST=
ROBOT_SSH_USER=firefly
ROBOT_SSH_KEY=
ROBOT_REMOTE_DIR=/home/firefly/agentech-stream
ROBOT_PYTHON=python3
ROBOT_LOCAL_PYTHON=python
OBS_WEBSOCKET_URL=
OBS_WEBSOCKET_PASSWORD=

RESEND_API_KEY=
APPLICATION_FROM_EMAIL=
APPLICATION_RECEIVER_EMAIL=info@agent-tech.ai
RESEND_REPLY_TO=

DROPBOX_ACCESS_TOKEN=
DROPBOX_NEWS_SHARED_LINK=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
AGENTECH_RETURN_TO_HOME_PRICE_CENTS=

OPENAI_API_KEY=
OPENAI_CODE_REVIEW_MODEL=gpt-5.5
AGENTECH_AI_REVIEW_CREDITS=50
AGENTECH_SUBMISSION_DIR=
```

`SUPABASE_SERVICE_ROLE_KEY` must stay server-side only.

`AGENTECH_RETURN_TO_HOME_PRICE_CENTS` is the positive integer USD-cent price
for the one-time Navi Return to Home unlock. It has no default: checkout stays
disabled until the business selects and configures the price. Active monthly
subscriptions and lifetime feature entitlements are checked server-side before
the website accepts physical code containing `Agentech.return_to_home()`.

`OPENAI_API_KEY` must also stay server-side only. Never add a `NEXT_PUBLIC_OPENAI_API_KEY`. The code review route calls OpenAI from the server through `lib/agentech-ai-review.ts`, and the browser should never see the key.

`AGENTECH_AI_REVIEW_CREDITS` is the number of website credits charged when the GPT Software Check runs. The current production default is `50`, and `1 credit = $0.01`, so one completed Software Check is billed as `$0.50`. Before the review, the gateway calls OpenAI's input-token counting endpoint with the exact request payload for quota protection. After the review, it stores OpenAI's official response `usage.input_tokens`, `usage.output_tokens`, and `usage.total_tokens`.

`AGENTECH_SUBMISSION_DIR` optionally overrides the server-side JSON submission mirror. Serverless deployments default to the writable system temp directory; normal hosting defaults to `process.cwd()/review_submissions`.

`LIVEKIT_API_SECRET` and any FF SDK / robot-control implementation details must also stay server-side or on the private robot/OBS computer. The website may show public beginner calls such as `Agentech.forward()`, but it must not expose private SDK internals, SSH credentials, robot hotspot details, or service-role keys in client code.

The private website code runner should set `AGENTECH_CAPTURE_UPLOAD_URL` to the site's `/api/agentech-capture` URL, `AGENTECH_CAPTURE_UPLOAD_TOKEN` to the same value as `ROBOT_RUNNER_SECRET`, `AGENTECH_CAPTURE_LIVEKIT_ROOM` to the active room, and `AGENTECH_CAPTURE_ACCOUNT_EMAIL` to the authenticated customer's account. The public call matches the SDK: `Agentech.capture_image(output="capture.jpg", source="default")`. During a supervised website run, the gateway replaces the requested output with a safe session-managed filename, sends the capture to the website panel, and charges `AGENTECH_CAPTURE_DISPLAY_CREDITS` (10 by default). Company accounts are not charged.

## Core Routes

| Route | Purpose |
| --- | --- |
| `/` | Homepage and partner logo roll |
| `/agentech-robotic` | Robot product comparison table |
| `/preorder` | Hidden robot invoice request form |
| `/agentech-education` | Education landing page |
| `/agentech-education/[grade]` | Grade-specific education page |
| `/agentech-education/[grade]/[course]` | Course detail and enrollment CTA |
| `/talents` | Talent program landing page |
| `/ai-robotics-club` | AI & Robotics Club landing page |
| `/ai-robotics-club/apply` | AI & Robotics Club application |
| `/career-intern` | Internship application |
| `/tech-education` | Workshop application |
| `/news` | News listing |
| `/news/[slug]` | News article |
| `/login` | Universal account sign-in |
| `/account-setup` | Parent/student setup |
| `/account` | Account requests dashboard |
| `/field-interest/agt-qr-2026` | Hidden QR-only field interest form |
| `/agentech-products/documents` | Hidden internal product docs |
| `/agentech-products/eaic-hub` | Products/EAIC HUB developer workflow home |
| `/agentech-products/eaic-hub/start-coding` | SDK setup and first-script workflow |
| `/agentech-products/eaic-hub/view-sdk` | SDK reference, parameters, and motion previews |
| `/agentech-products/eaic-hub/physical-hardware-check` | Step 3 Physical Hardware Check for uploaded/pasted `.py` robot code |
| `/agentech-products/eaic-hub/software-check` | Step 4 Software Check after the hardware gate passes |
| `/agentech-products/eaic-hub/watch-live-run` | Step 5 Live Stream view for supervised sessions |
| `/agentech-products/eaic-hub/schedule-time` | Robot viewing time and duration scheduling |

## Architecture Overview

```text
Next.js App Router
  -> app/ pages and API routes
  -> components/ reusable UI and forms
  -> lib/ Supabase, accounts, pricing, news, email helpers
  -> data/ generated JSON content
  -> public/assets/ static and imported media
```

External services:

| Service | Use |
| --- | --- |
| Supabase | Accounts, profiles, children, enrollments, invoices, applications, resume storage |
| OpenAI | Server-side GPT Software Check for uploaded robot code after Step 3 Physical Hardware Check passes |
| Resend | Application notifications and invoice emails |
| Dropbox | Source folder for automated News imports |
| GitHub | Review, version control, deployment source, documentation workflow |

## News Automation

News is imported from a Dropbox shared folder into static website data. This lets non-developers prepare article text and media in Dropbox while the website keeps a Git-tracked copy of the final published content.

High-level flow:

```text
Dropbox folder
  -> scripts/import-dropbox-news.mjs
  -> data/news-entries.json
  -> data/news-imports.json
  -> public/assets/news/
  -> /news and /news/[slug]
```

Files changed by a successful import:

| File or folder | Purpose |
| --- | --- |
| `data/news-entries.json` | Published news article data used by the website |
| `data/news-imports.json` | Import tracking map so Dropbox folders update existing articles instead of duplicating |
| `public/assets/news/` | Copied article images and videos |

### Dropbox Folder Format

Each top-level Dropbox folder becomes one news article. Folder names should start with a date:

```text
2026-05-22/
  index.md or news.txt
  1.jpg
  2.jpg
  3.mp4
```

Media may also be placed under an `image/` folder:

```text
2026-05-22/
  index.md
  image/
    1.jpg
    2.jpg
```

Folder rules:

- Use a date prefix such as `2026-05-22`.
- Put article text in `index.md`, another `.md` file, or a `.txt` file.
- Use numbered media names such as `1.jpg`, `2.png`, `3.mp4`, or `01.jpg`.
- The first numbered image becomes the cover image.
- Videos are supported with `.mp4`, `.mov`, `.webm`, and `.m4v`.
- Folders starting with `_` are ignored.
- Example folders are ignored when their name contains `example`.

Optional front matter:

```markdown
---
title: "Agentech Opens New Robotics Program"
author_override: "Agentech"
---
```

Language sections:

```markdown
## English

English article text here.

## 中文

Chinese article text here.
```

If only one language is provided, the website shows only that language. If both sections are provided, the article page can show the language toggle.

### Manual Import

Run from the website repository:

```bash
npm run import:news
npm run build
git add data/news-entries.json data/news-imports.json public/assets/news
git commit -m "Import Dropbox news"
git push origin main
```

### Local Import From A Specific Folder

Use this when testing a local copy before Dropbox/GitHub automation:

```bash
npm run import:news:local -- --source "C:\path\to\news-folder"
```

### GitHub Action Import

The automated workflow uses repository secrets:

```text
DROPBOX_ACCESS_TOKEN
DROPBOX_NEWS_SHARED_LINK
```

Manual run in GitHub:

1. Open the GitHub repository.
2. Go to `Actions`.
3. Select `Import Dropbox News`.
4. Click `Run workflow`.

The importer uses the Dropbox API token first. If no token is configured, it can fall back to downloading the shared folder zip from the Dropbox link. Every scheduled workflow run also executes `npm run cleanup:news:apply`, so unreferenced News copies are removed and committed automatically even when Dropbox has no new article.

### Updating Existing News

If more media or edited text is added to a Dropbox folder that was already imported, the importer updates the existing article instead of creating a duplicate. This is tracked by:

```text
data/news-imports.json
```

Do not delete rows from `data/news-imports.json` unless you intentionally want the importer to treat the Dropbox folder as new.

After an update is written successfully, the importer removes the replaced article's obsolete media copies. To audit the news asset folder manually, run `npm run cleanup:news`; the command is dry-run only unless `npm run cleanup:news:apply` is used.

### Listing And Deleting News

Useful commands:

```bash
npm run list:news
npm run delete:news:number 1
npm run delete:news:date 2026-05-22
npm run delete:news:slug agentech-news
npm run delete:news:source 2026-05-22-example
```

The delete command removes the article from `data/news-entries.json`, removes the import record from `data/news-imports.json`, and removes the referenced media folder from `public/assets/news/`.

If Windows has an image or video locked because the site is running locally, stop the local server first and run the delete command again.

### News Troubleshooting

| Problem | What to check |
| --- | --- |
| Article does not appear | Confirm the Dropbox folder starts with a date and contains `index.md`, another `.md`, or `.txt` |
| Images do not appear | Confirm media files are numbered and use supported extensions |
| Duplicate article appears | Check whether `data/news-imports.json` lost the original source folder mapping |
| Language toggle missing | Confirm both `## English` and `## 中文` sections exist |
| GitHub Action fails | Check `DROPBOX_ACCESS_TOKEN`, `DROPBOX_NEWS_SHARED_LINK`, and Action logs |
| Delete command cannot remove assets | Stop `npm run start` or `npm run serve:3001`, then retry |

See [docs/dropbox-news-automation.md](docs/dropbox-news-automation.md) for the full operator guide.

## Launch Switches

These are the files to check when hidden or launch-gated items need to go live quickly.

### Robot Preorder

File:

```text
app/agentech-robotic/page.tsx
```

Switch:

```ts
const showPreorderButtons = false;
```

Set it to `true` to show `PRE-ORDER` buttons. The buttons route through login to:

```text
/preorder?product=<robot model>
```

Backend:

```text
app/api/preorder/route.ts
```

### Education Enrollment

Course enroll buttons currently send users to Learning Tree.

File:

```text
components/education-course-button.tsx
```

Current target:

```text
https://www.learningtrees.us/ai-summer-camp
```

The internal Agentech enrollment flow still exists:

```text
/enroll?course=<course code>
components/education-enroll-page.tsx
```

### Grade 9-12 Visibility

File:

```text
app/agentech-education/page.tsx
```

Current filter:

```ts
const visibleGradePages = educationGradePages.filter((page) => page.slug !== "9-12");
```

Remove the filter when the 9-12 grade card should appear on the Education landing page.

### Field Interest QR

Hidden QR route:

```text
/field-interest/agt-qr-2026
```

Permanent QR asset:

```text
public/assets/qr/agentech-workshop-qr.png
```

Keep this route out of public navigation unless the QR campaign changes.

## Supabase Data Model

Main tables:

- `agentech_accounts`
- `agentech_profiles`
- `agentech_children`
- `agentech_counters`
- `agentech_education_courses`
- `agentech_enrollments`
- `agentech_code_submissions`
- `agentech_invoice_items`
- `agentech_preorder_invoices`
- `agentech_workshop_applications`
- `agentech_ai_robotics_club_applications`
- `agentech_internship_applications`

Resume uploads use Supabase Storage:

```text
talent-resumes
```

Server helper:

```text
lib/supabase-server.ts
```

## Talent Application Flows

Talent forms require an Agentech account session before submission.

| Program | Page | API | Supabase table |
| --- | --- | --- | --- |
| Internship | `/career-intern` | `app/api/internship/route.ts` | `agentech_internship_applications` |
| AI & Robotics Club | `/ai-robotics-club/apply` | `app/api/summer-school/route.ts` | `agentech_ai_robotics_club_applications` |
| Workshop | `/tech-education` | `app/api/tech-education/route.ts` | `agentech_workshop_applications` |

Shared helpers:

```text
lib/talent-applications.ts
lib/talent-resumes.ts
```

## Product Documentation

The website includes a hidden documentation portal:

```text
/agentech-products/documents
```

This page is the beginning of a company-wide documentation system inspired by NumPy, TensorFlow, ReadTheDocs, and SDK/API reference sites. The goal is to turn existing company work into reusable, maintainable product knowledge.

Initial linked repositories:

- `https://github.com/agent-tech0316/agentech-site-v1`
- `https://github.com/Agent-tech-ai/grades-3-5-teaching-materials`

Recommended long-term documentation structure:

```text
docs/
|-- robotics/
|-- agents/
|-- education/
|-- products/
|-- sdk/
|-- api/
`-- developer-onboarding.md
```

## Products And EAIC HUB

The Products developer workspace is EAIC HUB. It lives at:

```text
/agentech-products/eaic-hub
```

This area is the developer-facing workflow for learning the public Agentech robot API, uploading robot-control code, running staged review gates, scheduling supervised robot tests, and watching the live robot feed.

The three robot references use parallel source files and the same public setup pattern:

| Robot | Reference source | Setup |
| --- | --- | --- |
| Aegis | `lib/aegis-sdk-reference.ts` | `Agentech.use("aegis")` |
| Navi | `lib/navi-sdk-reference.ts` | `Agentech.use("navi")` |
| Master | `lib/master-sdk-reference.ts` | `Agentech.use("master")` |

Run `npm run test:sdk-reference` after changing any robot card. The test keeps
the three setup snippets free of robot addresses, checks card structure and
duplicates, and locks the reviewed card counts and Master gesture surface.

The page is organized into five workflows:

| Workflow | Route | Purpose |
| --- | --- | --- |
| Start Coding | `/agentech-products/eaic-hub/start-coding` | Guided SDK install, import, first script, beginner recipes, and starter safety rules |
| View SDK | `/agentech-products/eaic-hub/view-sdk` | Robot-selectable SDK reference for Movement, Athletics, Actions, Posture, Configuration, Safety, and Sensing commands |
| Physical Hardware Check | `/agentech-products/eaic-hub/physical-hardware-check` | Step 3 upload/paste review that checks robot-body limits before software review |
| Software Check | `/agentech-products/eaic-hub/software-check` | Step 4 GPT review that stays locked until the same file passes Step 3 |
| Live Stream | `/agentech-products/eaic-hub/watch-live-run` | Step 5 focused LiveKit camera view for supervised robot sessions |
| Schedule Time | `/agentech-products/eaic-hub/schedule-time` | Choose an available start time and viewing duration |

Library behavior:

- The landing page shows only the five workflow cards. Old eight-step URLs redirect into the new workflows.
- `View SDK` is grouped by command category. Each category starts collapsed behind a `View functions` control.
- Closed SDK rows stay compact, for example `Agentech.forward(parameters)`.
- Individual function details open only on demand and include definition, parameter profiles, example code, and the approved reference image.
- Navi exposes 128 reviewed action variants through 80 clean `Agentech` action wrappers and parameter choices.
- Navi reference rows never expose vendor action IDs or internal state controls. Related variants appear as explicit choices such as direction, style, count, speed, phase, or recovery behavior.
- Navi configuration cards remain visible but are marked `Under development`: message contracts and range guards are implemented, while gait, foot-height, friction, collision, jump-distance, and jump-angle behavior still needs isolated physical calibration.
- Safety limits are visible inside `View SDK`; do not bury dry-run, speed-cap, duration, or emergency-stop guidance.
- `Physical Hardware Check` and `Software Check` use one uploaded/pasted `.py` file for the whole review pipeline. Users should not submit a separate file for the software check.
- `Software Check` must remain locked until Supabase says the account/submission passed Step 3 Physical Hardware Check.
- The Software Check page restores the latest passed Step 3 submission from the signed-in account, so changing routes or refreshing does not relock a valid hardware pass.
- `@agent-tech.ai` addresses are internal company accounts. Charge the configured Software Check credits when available, but never block an internal test because its credit balance is insufficient. External accounts must have enough credits.
- `Live Stream` scheduling must remain locked for regular users until both Step 3 Physical Hardware Check and Step 4 Software Check pass. Internal `@agent-tech.ai` accounts can schedule testing slots without the two code-review gates.
- Live viewing costs 100 credits per minute for external accounts, with a 5-minute minimum and 60-minute maximum. Internal `@agent-tech.ai` accounts choose any positive whole-minute duration and are not charged credits.
- `Live Stream` stays focused on the webcam/live-view module, but users must still schedule a robot slot before a stream token is issued.
- The prototype hardware/simulation validator handoff is stored locally at `engineer_handoff/agentech_t3_engineer_handoff/`, with the original zip preserved at `engineer_handoff/agentech_t3_engineer_handoff.zip`.

### Submit Review Pipeline

The submit pipeline is intentionally staged. The browser UI is not the source of truth; Supabase is.

Current and intended flow:

```text
Developer uploads or pastes one .py file
  -> website creates a code submission
  -> Step 3 Physical Hardware Check runs first
  -> Supabase marks the account/submission physical_safety_status = passed
  -> Step 4 Software Check unlocks
  -> server confirms Supabase Step 3 pass before calling GPT
  -> OpenAI/GPT-5.5 reviews the same submission for software security risk
  -> Supabase marks ai_security_status = passed, failed, or error
  -> Step 5 Live Stream scheduling unlocks only when both gates pass
```

Important rule:

```text
Software Check must use the same .py submission that passed Step 3 Physical Hardware Check.
```

The current implementation already records the uploaded file name and code in Supabase. When the real hardware check from the engineer handoff is wired in, it should plug into Step 3 and keep writing the same Supabase status fields. The GPT Software Check should remain behind that Supabase gate.

### Company Account And Admin Rules

- `@agent-tech.ai` identifies an Agentech company/internal account. The shared source of truth is `lib/company-accounts.ts`.
- Internal accounts still run the same Physical Hardware Check and Software Check when testing this workflow.
- After Step 3 passes, a saved submission remains unlocked across navigation and refresh because the Software Check page reloads the latest account-owned submission from the server.
- Software Check credits are charged to internal accounts when enough credits are available. An insufficient internal balance does not block the test.
- External accounts must have enough credits before the OpenAI Software Check runs.
- The AI Gateway admin dashboard labels internal and external accounts, shows Software Check balances and per-submission credits charged, and displays this policy above the developer list.
- Admin data remains protected by the server-side admin table; a client-side company label does not grant admin access.

See [Software Check access policy](docs/software-check-access-policy.md) for the decision table and operator checks.

### Step 3 Physical Hardware Check

The Physical Hardware Check answers:

- Does the uploaded script use only the current public command contract in `lib/agentech-validation.ts`? Keep that contract synchronized with the robot SDK sources in `lib/aegis-sdk-reference.ts`, `lib/navi-sdk-reference.ts`, and `lib/master-sdk-reference.ts`, including the official `turn_left()`, `turn_right()`, and `u_turn()` spellings.

```text
Can this code damage the robot?
```

It is responsible for robot-body safety, for example:

- joint limits
- unsafe motion commands
- repeated backflips or high-risk movements
- speed, angle, duration, and acceleration limits
- robot model compatibility
- anything likely to damage hardware or create unsafe live behavior

Current state:

- The website has a software placeholder using `lib/agentech-validation.ts`.
- That placeholder validates the public Agentech command API and motion limits.
- The real hardware verification system is not implemented yet.

Future hardware check integration:

- The hardware check should run before GPT.
- It should update the same Supabase submission/account gate fields.
- Once it marks the submission as passed, no second code upload is needed.

Required Supabase account fields:

```text
agentech_accounts.developer_latest_code_submission_id
agentech_accounts.developer_physical_safety_status
agentech_accounts.developer_physical_safety_passed_at
agentech_accounts.developer_ai_security_status
agentech_accounts.developer_ai_security_passed_at
```

Expected account state after physical/hardware pass:

```text
developer_latest_code_submission_id = agentech-...
developer_physical_safety_status = passed
developer_ai_security_status = locked
```

### GPT Software Check

The GPT Software Check answers:

```text
Can this code damage Agentech systems, website data, accounts, private files, users, or infrastructure?
```

It is not responsible for robot motion safety. Motion/hardware safety belongs to the physical gate.

The GPT Software Check runs on the server through:

```text
lib/agentech-ai-review.ts
app/api/agentech-code-submit/route.ts
```

Environment variables:

```text
OPENAI_API_KEY
OPENAI_CODE_REVIEW_MODEL=gpt-5.5
AGENTECH_AI_REVIEW_CREDITS=50
AGENTECH_SUBMISSION_DIR
```

The API key must never be exposed to client code.

The Software Check should fail code that attempts:

- malware-like behavior
- credential theft
- reading `.env`, API keys, SSH keys, tokens, or private files
- shell/process execution such as `os.system`, `subprocess`, `eval`, or `exec`
- network exfiltration or suspicious requests to unknown servers
- website/backend exploitation
- Supabase/account/review-gate bypass
- destructive filesystem operations
- persistence or startup hooks
- dynamic downloads or package installs
- obfuscated payloads, encoded scripts, or hidden base64 execution
- infinite loops or obvious resource abuse
- imports or actions outside the allowed robot-code purpose

The model is instructed to return structured JSON:

```json
{
  "passed": true,
  "riskLevel": "low",
  "summary": "Short review result.",
  "findings": []
}
```

If the model is uncertain, it should fail the submission. This is a defensive review gate.

### Supabase Code Submission Table

The code review pipeline uses:

```text
agentech_code_submissions
```

Important columns:

| Column | Purpose |
| --- | --- |
| `id` | Submission ID used by both gates |
| `email` | Account that owns the submission |
| `developer_name` | Student/team/developer label |
| `robot_model` | Target robot model |
| `run_mode` | Review mode shown in the UI |
| `source` | `pasted_code`, `uploaded_file`, or legacy `github` |
| `uploaded_file_name` | Original uploaded `.py` file name |
| `commands` | Extracted Agentech command list |
| `code` | Code content tied to the submission |
| `physical_safety_status` | `pending`, `passed`, or `failed` |
| `ai_security_status` | `locked`, `pending`, `passed`, `failed`, or `error` |
| `ai_security_model` | GPT model used, currently `gpt-5.5` |
| `ai_security_summary` | Short result from GPT |
| `ai_security_findings` | JSON array of findings |
| `ai_security_risk_level` | `low`, `medium`, `high`, or `critical` |
| `ai_security_reviewed_at` | Time GPT review completed |
| `credits_charged` | Website credits charged for Software Check |

Operator verification after physical gate:

```sql
select
  email,
  developer_latest_code_submission_id,
  developer_physical_safety_status,
  developer_physical_safety_passed_at,
  developer_ai_security_status,
  developer_ai_security_passed_at
from public.agentech_accounts
where email = 'USER_EMAIL_HERE';
```

Operator verification after Software Check:

```sql
select
  id,
  email,
  source,
  uploaded_file_name,
  physical_safety_status,
  ai_security_status,
  ai_security_model,
  ai_security_summary,
  ai_security_findings,
  ai_security_risk_level,
  credits_charged,
  created_at,
  updated_at
from public.agentech_code_submissions
where email = 'USER_EMAIL_HERE'
order by created_at desc
limit 5;
```

### Scheduling Gate

Live custom-code scheduling is intentionally locked behind both gates.

Required state:

```text
developer_physical_safety_status = passed
developer_ai_security_status = passed
```

Scheduling is handled through:

```text
/account
app/api/robot-slot/route.ts
```

The robot slot API verifies Supabase before accepting custom-code scheduling. Preset demo viewing can still exist separately, but custom live-code testing must remain locked until both gates pass.

### Collaborator Rules

- This page is marked `noindex`.
- Share the direct URL only with collaborators who are helping build, teach, review, or test the Agentech robot dog workflow.
- The page may show the public beginner API, for example `Agentech.forward(speed_mps=0.3, duration_s=1)`.
- Do not expose FF SDK internals, robot hotspot details, SSH credentials, service-role keys, LiveKit API secrets, or private robot-control code in client-rendered code or public docs.
- Live robot viewing is account-gated through `/api/livekit-token`: users must be signed in and have an active scheduled robot slot. Non-internal users also need account credits; `@agent-tech.ai` accounts can test without credit charges, but every custom-code run must still pass both review gates and book a time and duration.
- Robot session booking is handled through `/account` and `/api/robot-slot`; booked slots are disabled in the UI and rejected by the API if they overlap an active session.

### Local Robot-Camera Operations

For Master sessions, the Live Stream client keeps the existing single LiveKit
program track and adds Master-only Wall/Focus controls. The active session must
report `robot_model=Master`; Aegies and Navi follow their existing paths. The
four allowed Master Robot Vision feeds are Front Main, Front Left, Front Right,
and RGB-D Color. Rear View, Depth Map, and LiDAR are intentionally excluded. The gateway
must composite wall mode as four 1080p quadrants in one 3840x2160 OBS program,
or switch that same program to one selected camera at up to its native 4K
resolution. Use Master's wired development connection for supervised hardware
acceptance.

Set `NEXT_PUBLIC_MASTER_CAMERA_PREVIEW=1` only for local development to review
the controls without an active Master session. The preview does not mint a
LiveKit token and clearly states that no robot or live feed is connected.

- The OBS/LiveKit stream bridge is intended to run on the Windows computer connected to the Logitech camera and OBS.
- The bridge polls Supabase for upcoming `agentech_robot_sessions`, starts OBS streaming shortly before a scheduled session, and stops when no active session is due.
- For a custom-code booking, the website pins the exact reviewed `agentech_code_submissions` record to the session. During the preparation window, the standalone gateway rechecks both review gates, atomically claims the booking, parses the submitted Python without executing it, and compiles supported literal SDK calls into an inert JSON plan.
- The gateway transfers only the trusted plan and `trusted-robot-runner.py` to the robot. Raw customer Python is never sent to the robot or executed on the gateway computer.
- Each `capture_image()` call creates one numbered capture. The gateway retrieves each requested capture and uploads it through the authenticated robot-capture endpoint for the matching website account.
- OBS remains live for the full booked duration even when customer code finishes early. At the scheduled end, the bridge closes the stream and stops any remaining motion. For Navi, it calls `return_to_home()` when the reviewed plan did not already contain that command, waits for the return to finish, and then always calls `damping()`. For Aegis, it preserves the existing automatic `sit()` cleanup unless the submitted plan already ends in `sit()`. When no stream or home-return operation remains active, the bridge stops OBS Virtual Camera; the OBS application may stay minimized so the next scheduled session can start reliably.
- Keep the robot host, SSH user, SSH key, local Python, and remote directory in private user-level environment variables on the gateway computer. Do not print service credentials, runner secrets, SSH keys, or OBS passwords.
- The bridge should run only between 8:00 AM and 10:00 PM local time. The computer power schedule scripts also wake the machine at 8:00 AM and sleep it at 10:00 PM.
- Keep `.robot-stream-logs/`, `.robot-stream-runtime/`, `tmp/`, and `output/` local. Do not commit generated logs, compiled plans, captures, rendered screenshots, or private runtime artifacts.

Useful local scripts:

| Script | Purpose |
| --- | --- |
| `scripts/install-robot-stream-watchdog.ps1` | Install the hidden Windows watchdog that keeps the OBS bridge running |
| `scripts/compile-robot-plan.py` | Parse reviewed Python into a deterministic, inert command plan without executing customer source |
| `scripts/trusted-robot-runner.py` | Execute only allowlisted commands from the inert plan on the robot |
| `scripts/uninstall-robot-stream-watchdog.ps1` | Remove the OBS bridge watchdog task |
| `scripts/install-computer-power-schedule.ps1` | Wake computer at 8:00 AM and sleep at 10:00 PM every day |
| `scripts/uninstall-computer-power-schedule.ps1` | Remove the computer wake/sleep tasks |

## Development Workflow

Typical workflow:

```bash
git status
git pull --ff-only
git switch -c codex/short-change-name
npm install
npm run check
git add <changed-files>
git commit -m "Describe the change"
git push -u origin codex/short-change-name
```

Open a pull request into `main` and use the repository pull-request checklist. Do not commit `.env` files, build output, logs, local submissions, or TypeScript build metadata. See [CONTRIBUTING.md](CONTRIBUTING.md).

Documentation workflow:

```text
Write Markdown
-> Push to GitHub
-> Review
-> Merge
-> Website links to docs
```

## Offline Verification

`npm test` is an aggregate offline suite. It verifies compiler acceptance and
rejection, stream-relay safety boundaries, return-to-home access policy, and
SDK-reference consistency. It never starts the stream bridge, connects to a
robot, or moves hardware. Use the full verification gates before a change:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Passing these gates proves website code quality and checked policy behavior;
it does not replace a supervised physical-robot check. See the
[offline verification matrix](docs/robot-test-matrix.md) for coverage and
remaining operator checks.

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start development server |
| `npm run build` | Build production site |
| `npm run start` | Start production server |
| `npm run serve:3001` | Start production server on port 3001 |
| `npm test` | Run all offline compiler, stream-boundary, access-policy, and SDK-reference tests |
| `npm run lint` | Lint JavaScript and TypeScript source |
| `npm run typecheck` | Run TypeScript without emitting build files |
| `npm run check` | Run lint, typecheck, and the production build |
| `npm run import:news` | Import News from Dropbox |
| `npm run import:news:local` | Import News from a local source folder |
| `npm run cleanup:news` | Audit unreferenced News assets without deleting them |
| `npm run cleanup:news:apply` | Remove only News assets that are unreferenced by structured article data |
| `npm run list:news` | List current News entries |
| `npm run delete:news:number` | Delete a News entry by list number |
| `npm run delete:news:date` | Delete a News entry by date |
| `npm run delete:news:slug` | Delete a News entry by slug |

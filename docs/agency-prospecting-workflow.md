# Agentech daily website prospecting

This is an internal operating workflow. It is not public website copy.

## Authorized scope

Research public opportunities and prepare personalized outreach for human review. Track direct business customers and white-label agency partners separately. Send the daily internal report only from `info@agent-tech.ai` to `info@agent-tech.ai` (user update, 2026-09-28). Do not send proposals to prospects, apply for jobs, submit contact forms, create accounts, buy credits, accept platform terms, or promise a price or schedule to a prospect without the required human review.

## Offer and qualification

Website Launch Package: $2,000, 1–5 main pages, responsive design, basic copy refinement, contact form, basic SEO, deployment and source handoff, two consolidated revision rounds, and 30-day bug support. Delivery is 5–7 business days after approved scope, complete materials, and 50% deposit, with a confirmed start date. Final 50% is due before launch/source handoff.

Favor company websites, startups, landing pages, SaaS marketing websites, AI/robotics/developer-tools companies, professional services, and white-label agencies. Reject complex backends, user systems, large stores, apps, ERP/CRM/marketplaces, unlimited changes, free complete builds, unreasonable deadlines, and permanent on-call work. A dated or unattractive website alone does not establish buying intent or budget. Supplier listings advertising web development are competitors, not verified buyers.

Score 0–100 using scope fit (30), actual buying/partner-intent evidence (25), budget evidence (20), timeline/materials (15), and reachable decision-maker or official contact path (10). State unknowns; do not silently assume budget, buying intent, geography, authority, or technical faults. Cold agency candidates can be useful without a posted job but must be labeled as unqualified partnership prospects.

## Daily research

Current user preference (2026-09-28): no paid prospecting memberships or proposal credits. Exclude Upwork from the actionable shortlist and routine daily search. Prioritize direct white-label agency partnerships and direct business opportunities found through public directories, company websites, and public LinkedIn posts. Contra/Fiverr are secondary and only within free access; do not buy upgrades or imply their free tiers have unlimited access or no transaction fees. Do not move marketplace-only buyers to off-platform contact to avoid fees. Use warm introductions only when the user supplies relevant contacts; do not inspect private address books automatically.

1. Use the current America/Los_Angeles calendar date. Read existing dated reports in `C:\Users\wesle\.codex\agency-prospecting` and any local lead status notes. Do not duplicate already-reported opportunities without a material update. Do not read unrelated private records or inboxes.
2. Review up to 15 actual opportunities, prioritizing design/advertising/marketing agency partner pages and direct business websites. Use public directories and Google Maps for discovery, then inspect the company's own website. Also check public LinkedIn buying/partner requests and relevant freely accessible project opportunities outside Upwork. Contra/Fiverr are secondary free-access channels. Aim for 3–5 genuinely matching prospects, not a mandatory quota. Browse available public pages only. If access requires login or payment, report the limitation; do not pretend the channel was checked. Treat service-platform seller profiles as market context unless there is explicit buyer/partner intent.
3. Prioritize US businesses and agencies initially, with California relationships useful but not a hard exclusion. User requested both groups, separately tracked. Capture source URLs, actual checked date, scope, budget/timeline when stated, observed facts, contact source, risks/unknowns, fit score, and next action.
4. For each credible candidate, identify two concrete observations or improvement opportunities using its public brief or inspected website. Clearly distinguish observed facts from proposed improvements. Do not claim a broken form, poor mobile layout, slow page, or SEO problem without checking it. Do not submit live prospect forms during inspection.
5. Prepare up to three strongest outreach drafts, under 150 English words each, grounded in the source. Do not invent customers, testimonials, results, partnerships, or credentials. Do not emphasize AI. The concept websites are not paid client work. Until the user authorizes publication and it is verified live, do not include the local-only service/demos as publicly available links.
6. Include follow-up recommendations only where the user has recorded a real prior contact. Never mark a draft as sent or infer a reply. The SOP's daily 3–5 follow-ups begin once such history exists.
7. Include honest channel coverage and rejection reasons. It is acceptable to find zero qualified leads. Do not pad the report with competitors or unsuitable work.

## Output and delivery

Store records outside the repository, under `C:\Users\wesle\.codex\agency-prospecting`. Keep the source JSON so future runs can deduplicate and maintain provenance. Do not add lead records to public routes, `public/`, or Git.

The daily JSON shape is:

```json
{
  "date": "YYYY-MM-DD",
  "reviewed": 0,
  "summary": "What was actually found and what needs attention.",
  "coverage": [{"channel":"Direct agency websites","note":"Exact coverage or access limitation"}],
  "businesses": [],
  "agencies": [],
  "rejected": [{"name":"Opportunity","reason":"Why it does not fit; include source URL"}],
  "followups": []
}
```

Each prospect has `name`, `sourceUrl`, optional `website` and `contactUrl`, numeric `score`, string arrays `evidence` and `unknowns`, `scope`, `nextAction`, and an optional `draft` of at most 150 English words. Include checked date in evidence. Omit drafts for candidates that first need qualification. Keep copied excerpts minimal and paraphrase accurately.

Preview: `node scripts/agency-prospecting.mjs --report <absolute-json-path>`.

Primary delivery: use the authenticated company Gmail browser session at https://mail.google.com/mail/?authuser=info%40agent-tech.ai through the supported browser tools. Verify that the visible account is `info@agent-tech.ai`; a Gmail connector signed into a personal account is not interchangeable. Browser delivery uses the existing signed-in session and does not require an API key or App Password. Do not change the website's existing verification-email credentials or sender.

1. Render the dated report with the preview command above. Use subject `Agentech | Daily website opportunities | YYYY-MM-DD` and the rendered HTML or complete plain text as the body.
2. Check `YYYY-MM-DD.sent.json` and `YYYY-MM-DD.sending.lock` in the private report directory. Skip sending if a receipt has an `id`. If a lock exists, inspect Sent mail and the recipient inbox before deciding whether a prior attempt succeeded; never automatically retry an uncertain send. Also search Gmail for that date, exact subject, sender and recipient before composing.
3. Before sending, exclusively create `YYYY-MM-DD.sending.lock` (create-new mode; do not overwrite), then recheck the receipt while holding the lock so an overlapping run cannot be missed. If a receipt now has an `id`, release only the lock just acquired and skip sending. Otherwise, check From and To are both exactly `info@agent-tech.ai`, with no CC/BCC or additional recipients. Send once through Gmail.
4. Verify the sent message and its Inbox label, expand message details to check the actual From and To, and save a receipt containing `id` (the Gmail message URL is acceptable), `acceptedAt`, `from`, `to`, `provider: "gmail-browser"`, and `inboxConfirmed`. Remove only this run's lock after the receipt is saved. If delivery is uncertain, keep the lock and inspect before any later retry.
5. If browser access or the signed-in company account is unavailable, keep the report and report the concrete access blocker. Do not claim delivery, create credentials, change account security, or silently send through another account.

Optional credential-based delivery remains available with `node scripts/agency-prospecting.mjs --report <absolute-json-path> --send`, only when an authorized sending credential is already available locally. It uses `RESEND_API_KEY` first, otherwise Gmail SMTP with `AGENCY_GMAIL_USER` and `AGENCY_GMAIL_APP_PASSWORD`, and fixes From and To to `info@agent-tech.ai`. Do not fall back between delivery channels after an uncertain provider error. Never echo credentials, save them in a report, or commit them. Provider acceptance alone does not prove inbox delivery.

The daily schedule requires the host, Codex app, and access to the signed-in company Gmail browser session. It is not an always-on hosted service.

The monthly SOP targets remain hypotheses: 300 reviewed, 80 suitable, 60–80 reviewed proposals sent by staff, 10–15 effective replies, and four paid projects. Report actual counts separately.

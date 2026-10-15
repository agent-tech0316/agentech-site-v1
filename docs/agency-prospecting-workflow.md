# Agentech daily website prospecting

This is an internal operating workflow. It is not public website copy.

## Authorized scope

The user authorized recurring professional prospect introductions and follow-ups from `info@agent-tech.ai` on 2026-09-28. Send routine messages within this workflow without requesting approval again. Track direct business customers and white-label agency partners separately, and send the daily internal activity report from `info@agent-tech.ai` to `info@agent-tech.ai`. This authorization does not include job applications, contact-form submissions, new accounts, purchases, accepting platform terms, or binding pricing, delivery, or contractual commitments.

The user explicitly authorized direct prospect outreach from `info@agent-tech.ai` on 2026-09-28 and requested professional company-to-company messages. Six individual introductions were sent in that batch. Read `lead-status.json` and `outreach-YYYY-MM-DD.json` in the private report directory before preparing any further outreach or follow-up. The latter contains the exact sent messages, verified recipient headers, timestamps and Gmail Sent URLs. A `sending` record is uncertain until inspected in Gmail; a `sent` record must not be sent again. Honor opt-outs and keep sent, bounced, replied, interested and qualified as distinct states. Do not describe a sent introduction as confirmed inbox delivery or a qualified project.

## Offer and qualification

Website Launch Package: $2,000, 1–5 main pages, responsive design, basic copy refinement, contact form, basic SEO, deployment and source handoff, two consolidated revision rounds, and 30-day bug support. Delivery is 5–7 business days after approved scope, complete materials, and 50% deposit, with a confirmed start date. Final 50% is due before launch/source handoff.

Favor company websites, startups, landing pages, SaaS marketing websites, AI/robotics/developer-tools companies, professional services, and white-label agencies. Reject complex backends, user systems, large stores, apps, ERP/CRM/marketplaces, unlimited changes, free complete builds, unreasonable deadlines, and permanent on-call work. A dated or unattractive website alone does not establish buying intent or budget. Supplier listings advertising web development are competitors, not verified buyers.

Score 0–100 using scope fit (30), actual buying/partner-intent evidence (25), budget evidence (20), timeline/materials (15), and reachable decision-maker or official contact path (10). State unknowns; do not silently assume budget, buying intent, geography, authority, or technical faults. Cold agency candidates can be useful without a posted job but must be labeled as unqualified partnership prospects.

## Daily research

Current user preference (2026-09-28): no paid prospecting memberships or proposal credits. Exclude Upwork from the actionable shortlist and routine daily search. Prioritize direct white-label agency partnerships and direct business opportunities found through public directories, company websites, and public LinkedIn posts. Contra/Fiverr are secondary and only within free access; do not buy upgrades or imply their free tiers have unlimited access or no transaction fees. Do not move marketplace-only buyers to off-platform contact to avoid fees. Use warm introductions only when the user supplies relevant contacts; do not inspect private address books automatically.

1. Use the current America/Los_Angeles calendar date. Read existing dated reports, `outreach-policy.json`, `lead-status.json`, and outreach receipts in `C:\Users\wesle\.codex\agency-prospecting`. Check tracked Gmail conversations for replies, opt-outs, out-of-office notices and delivery failures before any send. Deduplicate introductions by normalized email, organization and website/email domain, including known domain aliases. A different address at the same organization is not a new prospect. Do not read unrelated private records or inboxes.
2. Review up to 15 actual opportunities, prioritizing design/advertising/marketing agency partner pages and direct business websites. Use public directories and Google Maps for discovery, then inspect the company's own website. Also check public LinkedIn buying/partner requests and relevant freely accessible project opportunities outside Upwork. Contra/Fiverr are secondary free-access channels. Aim to contact five suitable NEW prospects per daily run; send fewer when evidence or official contact details are insufficient. Never pad the list or guess email addresses. Browse available public pages only. If access requires login or payment, report the limitation; do not pretend the channel was checked. Treat service-platform seller profiles as market context unless there is explicit buyer/partner intent.
3. Prioritize US businesses and agencies initially, with California relationships useful but not a hard exclusion. User requested both groups, separately tracked. Capture source URLs, actual checked date, scope, budget/timeline when stated, observed facts, contact source, risks/unknowns, fit score, and next action.
4. For each credible candidate, identify two concrete observations or improvement opportunities using its public brief or inspected website. Clearly distinguish observed facts from proposed improvements. Do not claim a broken form, poor mobile layout, slow page, or SEO problem without checking it. Do not submit live prospect forms during inspection.
5. Prepare and send an individual, source-grounded introduction of under 150 English words to each eligible new prospect using the procedure below. Do not invent customers, testimonials, results, partnerships, or credentials. Do not emphasize AI. The concept websites are not paid client work. Until the user authorizes publication and it is verified live, do not include the local-only service/demos as publicly available links. Use an honest Agentech signature and a simple way to decline further contact.
6. Process due follow-ups separately from the five new prospects. Never mark a draft as sent or infer a reply. Follow the recorded cadence below instead of a daily follow-up quota.
7. Include honest channel coverage and rejection reasons. It is acceptable to find zero qualified leads. Do not pad the report with competitors or unsuitable work.

## Follow-up cadence and prospect delivery

The schedule runs daily at 9:00 AM America/Los_Angeles. Business days for follow-up spacing mean Monday through Friday. An introduction gets one follow-up after three business days without a substantive reply, then one final follow-up five business days after the actual first follow-up. Send at most two unanswered follow-ups, then close the sequence. Never send more than one message to an organization in the same daily run, and never resend an introduction. Send follow-ups in the original Gmail conversation with useful, tailored context, not a copy of the original pitch. If a run is missed, process the overdue stage once; do not send multiple catch-up stages together.

The six introductions sent September 28, 2026 are excluded from new-prospect sends on September 29 and all later dates. Their first follow-up is eligible October 1, 2026, subject to a fresh reply and delivery check. The final follow-up date is calculated from the first follow-up's actual send date; if it is sent October 1, the final date is October 8.

Any substantive reply stops the unanswered-email sequence. Record whether it is positive, negative, or needs review; include a proposed response in the internal report when helpful. Do not infer buying intent from silence or automated responses. An opt-out suppresses the contact and organization. A bounce stops sending to that address and holds the organization's sequence; do not guess an alternate recipient. For an out-of-office response, defer until after a stated return date; if no date is given, hold for review. Clear `nextFollowupDate` for stopped or held sequences, recording the reason. Mark exhausted sequences complete after the second unanswered follow-up. Read the original conversation immediately before each due send; stale or unavailable reply checks are a reason to hold that message.

1. Verify the company Gmail account is `info@agent-tech.ai`. Check the contact ledger, source records, previous receipts and Sent mail for the recipient/organization. Introductions require a publicly verified official address and no prior introduction; follow-ups require a real sent introduction, a due date, remaining follow-ups and no stop condition.
2. Save the proposed subject and exact body to the day's `outreach-YYYY-MM-DD.json`. Use a stable action identifier based on organization and sequence stage (`introduction`, `followup-1`, or `followup-2`), independent of the run date. Exclusively create a per-action sending lock before composing, re-read the ledger and receipts while holding it, and skip an already-sent action. An existing lock or `sending` record requires inspection in Gmail; never automatically retry an uncertain send.
3. For follow-ups, open the original conversation and reply to the prospect, explicitly checking the To field so replying to our own sent email does not address ourselves. For each message, verify From is `info@agent-tech.ai`, To is the one verified prospect, and CC/BCC are empty. Recheck for a reply, opt-out or delivery failure, then send once.
4. Verify the actual sent message and From/To headers. Save the exact body, subject, action identifier, sequence stage, timestamp, sender, recipient, source/contact URLs, and Gmail message/conversation URL in the outreach log. Update `lead-status.json` with the actual last contact, follow-up count and next due date. Preserve initial-send evidence. Save receipts before removing only this run's lock. A sent message is not proof of inbox delivery or a qualified client.
5. If Gmail access or send status is uncertain, hold the affected action, preserve its lock and exact reason, and report it. Never switch to a personal account or automatically retry through another provider.

## Output and internal report delivery

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

Each prospect has `name`, `sourceUrl`, optional `website` and `contactUrl`, numeric `score`, string arrays `evidence` and `unknowns`, `scope`, `nextAction`, and an optional `draft` of at most 150 English words. Include checked date in evidence. The `draft` field holds message text, not proof of sending; state the verified action status and receipt URL in `nextAction` and the activity summary. Include actual new sends, follow-ups, replies, bounces, opt-outs, held actions and upcoming dates, with exact message text or links to private records. Omit drafts for candidates that first need qualification. Keep copied excerpts minimal and paraphrase accurately.

Preview: `node scripts/agency-prospecting.mjs --report <absolute-json-path>`.

Primary delivery: use the authenticated company Gmail browser session at https://mail.google.com/mail/?authuser=info%40agent-tech.ai through the supported browser tools. Verify that the visible account is `info@agent-tech.ai`; a Gmail connector signed into a personal account is not interchangeable. Browser delivery uses the existing signed-in session and does not require an API key or App Password. Do not change the website's existing verification-email credentials or sender.

1. Render the dated report with the preview command above. Use subject `Agentech | Daily website opportunities | YYYY-MM-DD` and the rendered HTML or complete plain text as the body.
2. Check `YYYY-MM-DD.sent.json` and `YYYY-MM-DD.sending.lock` in the private report directory. Skip sending if a receipt has an `id`. If a lock exists, inspect Sent mail and the recipient inbox before deciding whether a prior attempt succeeded; never automatically retry an uncertain send. Also search Gmail for that date, exact subject, sender and recipient before composing.
3. Before sending, exclusively create `YYYY-MM-DD.sending.lock` (create-new mode; do not overwrite), then recheck the receipt while holding the lock so an overlapping run cannot be missed. If a receipt now has an `id`, release only the lock just acquired and skip sending. Otherwise, check From and To are both exactly `info@agent-tech.ai`, with no CC/BCC or additional recipients. Send once through Gmail.
4. Verify the sent message and its Inbox label, expand message details to check the actual From and To, and save a receipt containing `id` (the Gmail message URL is acceptable), `acceptedAt`, `from`, `to`, `provider: "gmail-browser"`, and `inboxConfirmed`. Remove only this run's lock after the receipt is saved. If delivery is uncertain, keep the lock and inspect before any later retry.
5. If browser access or the signed-in company account is unavailable, keep the report and report the concrete access blocker. Do not claim delivery, create credentials, change account security, or silently send through another account.

Optional credential-based delivery remains available with `node scripts/agency-prospecting.mjs --report <absolute-json-path> --send`, only when an authorized sending credential is already available locally. It uses `RESEND_API_KEY` first, otherwise Gmail SMTP with `AGENCY_GMAIL_USER` and `AGENCY_GMAIL_APP_PASSWORD`, and fixes From and To to `info@agent-tech.ai`. Do not fall back between delivery channels after an uncertain provider error. Never echo credentials, save them in a report, or commit them. Provider acceptance alone does not prove inbox delivery.

The daily schedule requires the host, Codex app, and access to the signed-in company Gmail browser session. It is not an always-on hosted service.

The original monthly SOP targets remain hypotheses, not a basis for fabricated results. The user's recurring-outreach instruction and the cadence above govern this workflow. Report actual research, sends, replies and paid projects separately.

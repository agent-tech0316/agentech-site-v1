import { NextRequest, NextResponse } from "next/server";
import { getAccountRecord } from "@/lib/account-records";
import {
  createFeaturePayment,
  getReturnToHomeAccess,
  getReturnToHomePriceCents,
  RETURN_TO_HOME_FEATURE_CODE,
  returnToHomeFeature
} from "@/lib/premium-features";
import { isValidAccountIdentifier, normalizeEmail } from "@/lib/prototype-auth";
import { getServerAccountEmail } from "@/lib/server-account-session";
import { siteUrl } from "@/lib/site-config";

async function signedInEmail(request: NextRequest) {
  return normalizeEmail(await getServerAccountEmail(request));
}

export async function GET(request: NextRequest) {
  const email = await signedInEmail(request);
  if (!isValidAccountIdentifier(email)) {
    return NextResponse.json({ error: "Sign in to check premium feature access." }, { status: 401 });
  }

  const access = await getReturnToHomeAccess(email);
  return NextResponse.json({
    feature: returnToHomeFeature,
    access,
    priceCents: getReturnToHomePriceCents()
  });
}

export async function POST(request: NextRequest) {
  const email = await signedInEmail(request);
  if (!isValidAccountIdentifier(email)) {
    return NextResponse.json({ error: "Sign in before purchasing this feature." }, { status: 401 });
  }
  if (!(await getAccountRecord(email))) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  const access = await getReturnToHomeAccess(email);
  if (access.allowed) {
    return NextResponse.json({ ok: true, alreadyEntitled: true, access });
  }

  const amountCents = getReturnToHomePriceCents();
  if (!amountCents) {
    return NextResponse.json(
      { error: "The one-time return-to-home price has not been configured yet." },
      { status: 503 }
    );
  }
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return NextResponse.json({ error: "Stripe is not configured yet." }, { status: 503 });
  }

  const featureUrl = `${siteUrl}/agentech-products/eaic-hub/agentech-library`;
  const body = new URLSearchParams();
  body.set("mode", "payment");
  body.set("customer_email", email);
  body.set("client_reference_id", `premium-feature:${RETURN_TO_HOME_FEATURE_CODE}:${email}`);
  body.set("success_url", `${featureUrl}?returnHomePurchase=success`);
  body.set("cancel_url", `${featureUrl}?returnHomePurchase=cancelled`);
  body.set("metadata[purpose]", "premium_feature_purchase");
  body.set("metadata[feature_code]", RETURN_TO_HOME_FEATURE_CODE);
  body.set("metadata[email]", email);
  body.set("line_items[0][quantity]", "1");
  body.set("line_items[0][price_data][currency]", "usd");
  body.set("line_items[0][price_data][unit_amount]", String(amountCents));
  body.set("line_items[0][price_data][product_data][name]", "Navi Return to Home — lifetime unlock");

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body,
    cache: "no-store"
  });
  const result = (await response.json().catch(() => null)) as {
    id?: string;
    url?: string;
    error?: { message?: string };
  } | null;

  if (!response.ok || !result?.id || !result.url) {
    return NextResponse.json(
      { error: result?.error?.message || "Unable to create the feature checkout." },
      { status: 400 }
    );
  }

  await createFeaturePayment({ email, amountCents, stripeSessionId: result.id });
  return NextResponse.json({ ok: true, checkoutUrl: result.url, sessionId: result.id });
}

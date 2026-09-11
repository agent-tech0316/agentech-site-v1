import { NextResponse } from "next/server";
import { getServerAccountIdentity } from "@/lib/server-account-session";
import { supabaseRequest } from "@/lib/supabase-server";

type DeletePayload = {
  email?: string;
  childId?: number | string;
};

export async function DELETE(request: Request) {
  const identity = await getServerAccountIdentity(request, { allowLegacyCookie: false });
  if (!identity) return NextResponse.json({ error: "Sign in to update this account." }, { status: 401 });
  const payload = (await request.json().catch(() => null)) as DeletePayload | null;
  const email = identity.email;
  const childId = Number(payload?.childId);

  if (!Number.isInteger(childId) || childId <= 0) {
    return NextResponse.json({ error: "Choose a valid child to delete." }, { status: 400 });
  }

  const paidEnrollments = await supabaseRequest<Array<{ id: number }>>("agentech_enrollments", {
    query: `parent_email=eq.${encodeURIComponent(email)}&child_id=eq.${childId}&paid=eq.true&select=id&limit=1`
  }).catch(() => []);

  if (paidEnrollments.length) {
    return NextResponse.json(
      { error: "This child has a paid enrollment record and cannot be deleted from the account page." },
      { status: 400 }
    );
  }

  await supabaseRequest<null>("agentech_invoice_items", {
    method: "DELETE",
    query: `email=eq.${encodeURIComponent(email)}&child_id=eq.${childId}&paid=eq.false`,
    prefer: "return=minimal"
  }).catch(() => null);

  await supabaseRequest<null>("agentech_enrollments", {
    method: "DELETE",
    query: `parent_email=eq.${encodeURIComponent(email)}&child_id=eq.${childId}&paid=eq.false`,
    prefer: "return=minimal"
  }).catch(() => null);

  await supabaseRequest<null>("agentech_children", {
    method: "DELETE",
    query: `parent_email=eq.${encodeURIComponent(email)}&id=eq.${childId}`,
    prefer: "return=minimal"
  });

  return NextResponse.json({ ok: true, message: "Child deleted." });
}

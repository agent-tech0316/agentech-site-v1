import { NextRequest, NextResponse } from "next/server";
import { getServerAccountEmail } from "@/lib/server-account-session";
import { supabaseRequest } from "@/lib/supabase-server";

export async function POST(request: NextRequest) {
  const email = await getServerAccountEmail(request, {requireSignedSession:true});
  if (!email) return NextResponse.json({error:"Sign in to confirm your booking."},{status:401});
  const payload = await request.json().catch(()=>null);
  if (payload?.operatorReady !== true || !Number.isSafeInteger(payload.sessionId) || payload.sessionId < 1)
    return NextResponse.json({error:"Choose a booking to confirm."},{status:400});
  const ready = await supabaseRequest<boolean>("rpc/agentech_confirm_body_operator", {
    method:"POST",body:{p_email:email,p_session:payload.sessionId}
  });
  return ready ? NextResponse.json({ok:true}) : NextResponse.json({
    error:"Confirm from 20 seconds before your Happy Dance slot, with at least 80 seconds remaining."
  },{status:409});
}

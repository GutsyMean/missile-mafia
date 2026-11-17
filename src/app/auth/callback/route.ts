import { NextResponse, type NextRequest } from "next/server";
import { recordMembershipAtSignIn } from "@/lib/membership";
import { membershipStore } from "@/lib/membership-store";
import { createServerSupabase } from "@/lib/supabase/server";

/** Discord sends the visitor back here; trade the one-time code for a session. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const destination = request.nextUrl.clone();
  destination.search = "";

  if (code) {
    const supabase = await createServerSupabase();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // While automatic approval is on, ask Discord whether this account is a guild member.
      if (data.session) await recordMembershipAtSignIn(data.session, membershipStore());
      destination.pathname = "/admin";
      return NextResponse.redirect(destination);
    }
  }
  destination.pathname = "/login";
  destination.search = "?error=callback";
  return NextResponse.redirect(destination);
}

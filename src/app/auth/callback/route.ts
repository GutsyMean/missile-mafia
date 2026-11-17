import { NextResponse, type NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

/** Discord sends the visitor back here; trade the one-time code for a session. */
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const destination = request.nextUrl.clone();
  destination.search = "";

  if (code) {
    const supabase = await createServerSupabase();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      destination.pathname = "/admin";
      return NextResponse.redirect(destination);
    }
  }
  destination.pathname = "/login";
  destination.search = "?error=callback";
  return NextResponse.redirect(destination);
}

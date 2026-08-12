import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/lib/types/supabase";

const ADMIN_PATH_PREFIXES = ["/dashboard", "/forms", "/team"];

function isAdminPath(pathname: string) {
  return ADMIN_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  // Don't put this client in module scope — create a new one per request.
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
          Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
        },
      },
    },
  );

  // Do not run code between createServerClient and getClaims() — see Supabase's
  // own warning: skipping this can randomly log users out. getClaims() (not
  // getSession()) validates the JWT signature against the project's published
  // public keys every time, so it's safe to trust here.
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims?.email as string | undefined;

  // Any redirect must carry over cookies queued on `response` (getClaims()/signOut()
  // may have refreshed or cleared the session token) — NextResponse.redirect()
  // creates a fresh response object that wouldn't otherwise include them.
  const redirectTo = (pathname: string) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  };

  if (!isAdminPath(request.nextUrl.pathname)) {
    return response;
  }

  if (!email) {
    return redirectTo("/auth/login");
  }

  // RLS on team_members means this returns no row for anyone who isn't an
  // active member — "no row" and "blocked by RLS" are indistinguishable and
  // both correctly mean "not authorized," so a single check covers both.
  const { data: member } = await supabase
    .from("team_members")
    .select("status")
    .ilike("email", email)
    .maybeSingle();

  if (!member || member.status !== "active") {
    await supabase.auth.signOut();
    return redirectTo("/auth/blocked");
  }

  return response;
}

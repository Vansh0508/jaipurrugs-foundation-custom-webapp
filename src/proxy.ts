// (admin)-only session + whitelist gate — see docs/phases/01-auth-whitelist.md.
// Named `proxy.ts` per Next.js 16's file convention (renamed from `middleware.ts`).
import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Real URL paths only — (admin) is a route group and never appears in the
  // actual request path. Deliberately excludes app/(public)/f/[shareToken] and
  // the rest of the public surface, which must stay fast and auth-free.
  matcher: ["/dashboard/:path*", "/forms/:path*", "/team/:path*"],
};

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabaseConfig } from "@/lib/supabase/config";
export async function proxy(request: NextRequest) {
  const config = supabaseConfig();
  if (!config || request.nextUrl.pathname.startsWith("/demo"))
    return NextResponse.next();
  let response = NextResponse.next({ request });
  const client = createServerClient(config.url, config.key, {
    cookieOptions: {
      httpOnly: true,
      sameSite: "lax",
      secure: config.url.startsWith("https://"),
      path: "/",
    },
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (values) => {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        values.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });
  // Refresh session, never trust getSession() for authorization. Pages/actions also call getUser().
  try {
    await client.auth.getUser();
  } catch (error) {
    // Supabase network failures must not turn the login screen into a 500.
    // Fail closed: do not create a session or grant access; route-level
    // requireUser() still performs authoritative authorization.
    console.error("AUTH_REFRESH_FAILED",
      error instanceof Error ? error.name : "UNKNOWN_ERROR");
    if (request.nextUrl.pathname !== "/login") {
      const loginUrl = new URL("/login", request.url);
      const redirected = NextResponse.redirect(loginUrl);
      redirected.headers.set("Cache-Control", "private, no-store");
      return redirected;
    }
  }
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export const config = {
  matcher: [
    "/login",
    "/dashboard",
    "/sermons/:path*",
    "/present/:path*",
    "/members",
  ],
};

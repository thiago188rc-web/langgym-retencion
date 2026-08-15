import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  homeForRole,
  isClientRole,
  isKnownRole,
  INCOMPLETE_PROFILE_ROUTE,
} from "@/lib/auth/roleRouting";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // In local development or pre-config states without credentials, allow through
  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes("placeholder")) {
    return supabaseResponse;
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: Array<{ name: string; value: string; options?: any }>) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: Avoid using getSession() on the server as it does not validate the JWT securely.
  // getUser() sends a request to Supabase Auth to guarantee the token is valid and unrevoked.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  const isPublicRoute =
    pathname.startsWith("/login") ||
    pathname.startsWith("/registro") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/api/auth");

  const isIncompleteProfileRoute = pathname.startsWith(INCOMPLETE_PROFILE_ROUTE);

  // 1. Unauthenticated users trying to access private pages -> redirect to /login
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // 2. Authenticated user handling
  if (user) {
    // Fetch the role STRICTLY from profiles.role. There is no safe default:
    // if the profile row doesn't exist yet, or the query fails, or the role
    // value is not one of the roles the app understands, `role` stays
    // null/unrecognized and homeForRole() below routes to the controlled
    // "/perfil-pendiente" state — NEVER to the admin panel.
    let role: string | null = null;

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      role = profile?.role ?? null;
    } catch {
      role = null;
    }

    const hasIncompleteProfile = !isKnownRole(role);
    const isClient = isClientRole(role);
    const isClientRoute = pathname.startsWith("/mi-panel") || pathname.startsWith("/cliente");
    const destination = homeForRole(role);

    // A. Authenticated user with an incomplete/unrecognized profile -> always
    //    send to the controlled "profile pending" page (except if already there,
    //    or hitting auth-adjacent routes that must stay reachable to recover).
    if (
      hasIncompleteProfile &&
      !isIncompleteProfileRoute &&
      !pathname.startsWith("/auth/callback") &&
      !pathname.startsWith("/api/auth")
    ) {
      const url = request.nextUrl.clone();
      url.pathname = INCOMPLETE_PROFILE_ROUTE;
      return NextResponse.redirect(url);
    }

    // B. Authenticated user with a known role hitting public auth routes ->
    //    redirect to their respective home (login/registro no longer useful to them).
    if (
      !hasIncompleteProfile &&
      isPublicRoute &&
      !pathname.startsWith("/reset-password") &&
      !pathname.startsWith("/auth/callback") &&
      !pathname.startsWith("/api/auth")
    ) {
      const url = request.nextUrl.clone();
      url.pathname = destination;
      return NextResponse.redirect(url);
    }

    // C. Client trying to access administrative routes -> block and redirect to /mi-panel
    if (isClient && !isClientRoute && !isPublicRoute && !isIncompleteProfileRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/mi-panel";
      return NextResponse.redirect(url);
    }

    // D. Admin/Staff/Owner trying to access the client-only portal -> redirect to admin dashboard
    if (!hasIncompleteProfile && !isClient && isClientRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};


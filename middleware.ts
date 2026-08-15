import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  // 1. Unauthenticated users trying to access private pages -> redirect to /login
  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // 2. Authenticated user handling
  if (user) {
    // Fetch profile role securely with least-privilege fallback (default: 'cliente')
    const metadataRole = user.user_metadata?.registered_as === "cliente" ? "cliente" : null;
    let role = metadataRole || "cliente";

    try {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (profile?.role) {
        role = profile.role;
      }
    } catch {
      // Retain least-privilege fallback
    }

    const isClient = role === "cliente";
    const isClientRoute = pathname.startsWith("/mi-panel") || pathname.startsWith("/cliente");

    // A. Authenticated user hitting public auth routes -> redirect to respective home
    if (isPublicRoute && !pathname.startsWith("/reset-password") && !pathname.startsWith("/auth/callback") && !pathname.startsWith("/api/auth")) {
      const url = request.nextUrl.clone();
      url.pathname = isClient ? "/mi-panel" : "/";
      return NextResponse.redirect(url);
    }

    // B. Client trying to access administrative routes -> block and redirect to /mi-panel
    if (isClient && !isClientRoute && !isPublicRoute) {
      const url = request.nextUrl.clone();
      url.pathname = "/mi-panel";
      return NextResponse.redirect(url);
    }

    // C. Admin/Staff trying to access client-only portal -> redirect to admin dashboard
    if (!isClient && isClientRoute) {
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


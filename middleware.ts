import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

function isValidBasicAuth(request: NextRequest) {
  const username = process.env.ADMIN_USER;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !password) return false;

  const header = request.headers.get("authorization");
  if (!header?.startsWith("Basic ")) return false;

  try {
    const decoded = atob(header.slice(6));
    const separator = decoded.indexOf(":");
    if (separator < 0) return false;

    const providedUser = decoded.slice(0, separator);
    const providedPassword = decoded.slice(separator + 1);
    return providedUser === username && providedPassword === password;
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  if (!process.env.ADMIN_USER || !process.env.ADMIN_PASSWORD) {
    return new NextResponse("Admin authentication is not configured.", { status: 503 });
  }

  if (!isValidBasicAuth(request)) {
    return new NextResponse("Authentication required.", {
      status: 401,
      headers: { "WWW-Authenticate": 'Basic realm="Fuel Tracker Admin"' },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*"],
};

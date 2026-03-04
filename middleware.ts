import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

export function middleware(req: NextRequest) {
  const auth = req.cookies.get("mitten-auth")
  const { pathname } = req.nextUrl

  // Public routes
  if (pathname === "/" || pathname === "/login" || pathname === "/setup") {
    return NextResponse.next()
  }

  // Let API routes handle auth themselves
  if (pathname.startsWith("/api")) {
    return NextResponse.next()
  }

  // Protect private areas
  if (!auth) {
    return NextResponse.redirect(new URL("/login", req.url))
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/projects/:path*",
    "/intake/:path*",
    "/agents/:path*",
    "/savings/:path*",
  ],
}
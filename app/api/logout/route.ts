import { NextResponse } from "next/server";

export async function POST() {
  // Redirect back to /login
  const res = NextResponse.redirect(new URL("/login", "http://localhost:3000"));

  // Clear the auth cookie
  res.cookies.set("mitten-auth", "", {
    path: "/",
    httpOnly: true,
    maxAge: 0,
  });

  return res;
}

// If you visit /api/logout directly in the browser, redirect too
export async function GET() {
  return NextResponse.redirect(new URL("/login", "http://localhost:3000"));
}
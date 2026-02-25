import { NextResponse } from "next/server";

export async function POST(req: Request) {
  // After "login", send them to the dashboard
  const res = NextResponse.redirect(new URL("/dashboard", req.url));

  // Set a simple auth cookie (placeholder for real auth later)
  res.cookies.set("mitten-auth", "1", {
    path: "/",
    httpOnly: true,
    maxAge: 60 * 60, // 1 hour
  });

  return res;
}

// If someone visits /api/login in the browser, send them to the login page
export async function GET(req: Request) {
  return NextResponse.redirect(new URL("/login", req.url));
}
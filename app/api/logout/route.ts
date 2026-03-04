// app/api/logout/route.ts
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const res = NextResponse.redirect(new URL("/login", req.url))
  res.cookies.set("mitten-auth", "", {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 0,
  })
  return res
}

export async function GET(req: Request) {
  return NextResponse.redirect(new URL("/login", req.url))
}
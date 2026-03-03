// app/api/login/route.ts
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

export async function POST(req: Request) {
  // If a valid auth cookie already exists, reuse it.
  const existing = req.headers.get("cookie") || ""
  const match = existing.match(/(?:^|;\s*)mitten-auth=([^;]+)/)
  const cookieUserId = match?.[1] ? decodeURIComponent(match[1]) : null

  if (cookieUserId) {
    const user = await prisma.user.findUnique({
      where: { id: cookieUserId },
      select: { id: true },
    })
    if (user) {
      // already logged in as a real user
      return NextResponse.redirect(new URL("/dashboard", req.url))
    }
  }

  // Otherwise create a new user identity (placeholder until real auth)
  const user = await prisma.user.create({ data: {} })

  const res = NextResponse.redirect(new URL("/dashboard", req.url))
  res.cookies.set("mitten-auth", user.id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  })
  return res
}

export async function GET(req: Request) {
  return NextResponse.redirect(new URL("/login", req.url))
}
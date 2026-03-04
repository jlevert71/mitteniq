// lib/auth.ts
import "server-only"
import { cookies } from "next/headers"
import { prisma } from "@/lib/prisma"

export async function requireUserId(): Promise<string> {
  const cookieStore = await cookies()
  const userId = cookieStore.get("mitten-auth")?.value

  if (!userId) throw new Error("UNAUTHENTICATED")

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  })

  if (!user) throw new Error("UNAUTHENTICATED")

  return user.id
}
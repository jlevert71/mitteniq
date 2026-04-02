import { GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3"
import { r2, R2_BUCKET } from "@/lib/r2"

export type R2ReadResult = {
  head: {
    ContentType?: string | null
    ContentLength?: number | null
  } | null
  buffer: Buffer
}

async function streamToBuffer(stream: AsyncIterable<Uint8Array | Buffer | string>): Promise<Buffer> {
  const chunks: Buffer[] = []

  for await (const chunk of stream) {
    if (Buffer.isBuffer(chunk)) {
      chunks.push(chunk)
    } else if (typeof chunk === "string") {
      chunks.push(Buffer.from(chunk))
    } else {
      chunks.push(Buffer.from(chunk))
    }
  }

  return Buffer.concat(chunks)
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function isRetryableR2ReadError(error: unknown) {
  const record = typeof error === "object" && error !== null ? (error as Record<string, unknown>) : {}
  const metadata =
    typeof record.$metadata === "object" && record.$metadata !== null
      ? (record.$metadata as Record<string, unknown>)
      : {}

  const name = String(record.name ?? "")
  const code = String(record.Code ?? record.code ?? "")
  const http = Number(metadata.httpStatusCode ?? 0)
  const msg = String(record.message ?? "")

  if (name === "NoSuchKey" || code === "NoSuchKey") return true
  if (http === 404) return true

  if (name.includes("Timeout") || msg.toLowerCase().includes("timeout")) return true
  if (msg.toLowerCase().includes("socket") || msg.toLowerCase().includes("network")) return true

  return false
}

export async function readUploadBufferFromR2(r2Key: string): Promise<R2ReadResult> {
  const attempts = 5
  const delaysMs = [250, 500, 1000, 1500, 2000]

  let head: {
    ContentType?: string | null
    ContentLength?: number | null
  } | null = null

  let buffer: Buffer | null = null
  let lastError: unknown = null

  for (let i = 0; i < attempts; i += 1) {
    try {
      const headResponse = await r2.send(
        new HeadObjectCommand({
          Bucket: R2_BUCKET,
          Key: r2Key,
        }),
      )

      const objectResponse = await r2.send(
        new GetObjectCommand({
          Bucket: R2_BUCKET,
          Key: r2Key,
        }),
      )

      if (!objectResponse.Body) {
        throw new Error("R2 GetObject returned empty body")
      }

      head = {
        ContentType: headResponse.ContentType ?? null,
        ContentLength:
          typeof headResponse.ContentLength === "number" ? headResponse.ContentLength : null,
      }

      buffer = await streamToBuffer(
        objectResponse.Body as AsyncIterable<Uint8Array | Buffer | string>,
      )

      break
    } catch (error) {
      lastError = error

      if (i < attempts - 1 && isRetryableR2ReadError(error)) {
        await sleep(delaysMs[i] ?? 1000)
        continue
      }

      throw error
    }
  }

  if (!buffer) {
    throw lastError instanceof Error ? lastError : new Error("Failed to read object from R2")
  }

  return {
    head,
    buffer,
  }
}
/**
 * Small string helpers shared by UI and server-side mappers.
 * Keeps client pages from importing heavy report modules.
 */
import { registryLogicalKeyForSheetId } from "./drawing-set-registry"

export function stripRedundantSheetPrefix(
  sheetNumber: string | null | undefined,
  title: string | null | undefined,
): string | null {
  const t = title?.replace(/\s+/g, " ").trim() ?? ""
  if (!t) return null
  const sn = sheetNumber?.trim()
  if (!sn) return t
  const lkSn = registryLogicalKeyForSheetId(sn)
  const m = t.match(/^\s*((?:D|E|I)-\d+)\s*[–—-]\s*(.+)$/i)
  if (m) {
    const lkHead = registryLogicalKeyForSheetId(m[1])
    if (lkSn && lkHead && lkHead === lkSn) return m[2].trim()
  }
  return t
}

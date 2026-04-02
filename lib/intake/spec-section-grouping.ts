import type { IntakeNormalizedPage } from "./types"

export type SpecSection = {
  sectionNumber: string | null
  sectionTitle: string | null
  startPage: number
  endPage: number
  pages: number[]
}

function hasSectionIdentity(page: IntakeNormalizedPage) {
  return Boolean(page.final.sectionNumber || page.final.sectionTitle)
}

function getSectionKey(page: IntakeNormalizedPage) {
  return `${page.final.sectionNumber ?? ""}||${page.final.sectionTitle ?? ""}`
}

function isExplicitSectionStart(page: IntakeNormalizedPage) {
  return (
    page.aiSignals.isLikelySectionStart ||
    page.aiSignals.structuralRole === "SECTION_START" ||
    page.aiSignals.structuralRole === "DIVISION_HEADER"
  )
}

function isExplicitSectionEnd(page: IntakeNormalizedPage) {
  return (
    page.aiSignals.isLikelySectionEnd ||
    page.aiSignals.structuralRole === "SECTION_END"
  )
}

export function groupSpecSections(pages: IntakeNormalizedPage[]): SpecSection[] {
  const sections: SpecSection[] = []
  let current: SpecSection | null = null
  let currentKey: string | null = null

  for (const page of pages) {
    if (page.final.pageClass !== "SPECIFICATION") {
      if (current) {
        sections.push(current)
        current = null
        currentKey = null
      }
      continue
    }

    const hasIdentity = hasSectionIdentity(page)
    const sectionKey = hasIdentity ? getSectionKey(page) : null
    const explicitStart = isExplicitSectionStart(page)
    const explicitEnd = isExplicitSectionEnd(page)

    const shouldStartNew =
      hasIdentity &&
      (
        !current ||
        explicitStart ||
        (sectionKey !== null && currentKey !== null && sectionKey !== currentKey)
      )

    if (shouldStartNew) {
      if (current) {
        sections.push(current)
      }

      current = {
        sectionNumber: page.final.sectionNumber,
        sectionTitle: page.final.sectionTitle,
        startPage: page.pageNumber,
        endPage: page.pageNumber,
        pages: [page.pageNumber],
      }
      currentKey = sectionKey
    } else if (!current) {
      current = {
        sectionNumber: page.final.sectionNumber,
        sectionTitle: page.final.sectionTitle,
        startPage: page.pageNumber,
        endPage: page.pageNumber,
        pages: [page.pageNumber],
      }
      currentKey = sectionKey
    } else {
      current.pages.push(page.pageNumber)
      current.endPage = page.pageNumber

      if (!current.sectionNumber && page.final.sectionNumber) {
        current.sectionNumber = page.final.sectionNumber
      }
      if (!current.sectionTitle && page.final.sectionTitle) {
        current.sectionTitle = page.final.sectionTitle
      }
      if (!currentKey && sectionKey) {
        currentKey = sectionKey
      }
    }

    if (current && explicitEnd) {
      sections.push(current)
      current = null
      currentKey = null
    }
  }

  if (current) {
    sections.push(current)
  }

  return sections
}
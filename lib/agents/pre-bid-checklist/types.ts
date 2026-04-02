export type PreBidChecklistResult = {
  ok: boolean
  error?: string
  extractedAt: string
  uploadId: string
  fields: PreBidChecklistFields
  meta: {
    pagesScanned: number
    durationMs: number
    model: string
    passesRun: number
    progressLog: string[]
  }
}

export type AllowanceItem = {
  description: string
  amount: string
}

export type PreBidChecklistFields = {
  // Section 1 — Project & Bid Identity
  projectName: string | null
  bidDueDate: string | null
  bidDueTime: string | null
  bidOpeningType: string | null
  biddingTo: string | null
  deliverBidTo: string | null
  deliveryMethod: string | null
  numberOfCopies: number | null
  documentsAvailableAt: string | null
  lastRfiDate: string | null

  // Section 2 — Pre-Bid Meeting
  preBidHeld: boolean | null
  preBidMandatory: boolean | null
  preBidMandatoryScope: "primes_only" | "primes_and_subs" | null
  preBidDate: string | null
  preBidTime: string | null
  preBidLocation: string | null

  // Section 3 — Schedule
  proposedStartDate: string | null
  proposedCompletionDate: string | null

  // Section 4 — Bid Pricing Format
  unitPricing: boolean | null
  alternates: boolean | null
  alternatesCount: number | null
  alternatesDescription: string | null
  allowances: boolean | null
  allowanceItems: AllowanceItem[]
  breakDownsRequired: boolean | null

  // Section 5 — Bonds & Insurance
  bidBondRequired: boolean | null
  bidBondAmount: string | null
  plmBonds: boolean | null
  liquidatedDamages: boolean | null
  liquidatedDamagesAmount: string | null
  obligee: string | null
  specialInsuranceRequired: boolean | null
  specialInsuranceType: string | null

  // Section 6 — Compliance & Labor
  certifiedPayroll: boolean | null
  buyAmerican: boolean | null
  dbeSbeRequired: boolean | null
  dbeSbeGoalPercent: string | null
}

export function emptyPreBidChecklistFields(): PreBidChecklistFields {
  return {
    // Section 1
    projectName: null,
    bidDueDate: null,
    bidDueTime: null,
    bidOpeningType: null,
    biddingTo: null,
    deliverBidTo: null,
    deliveryMethod: null,
    numberOfCopies: null,
    documentsAvailableAt: null,
    lastRfiDate: null,

    // Section 2
    preBidHeld: null,
    preBidMandatory: null,
    preBidMandatoryScope: null,
    preBidDate: null,
    preBidTime: null,
    preBidLocation: null,

    // Section 3
    proposedStartDate: null,
    proposedCompletionDate: null,

    // Section 4
    unitPricing: null,
    alternates: null,
    alternatesCount: null,
    alternatesDescription: null,
    allowances: null,
    allowanceItems: [],
    breakDownsRequired: null,

    // Section 5
    bidBondRequired: null,
    bidBondAmount: null,
    plmBonds: null,
    liquidatedDamages: null,
    liquidatedDamagesAmount: null,
    obligee: null,
    specialInsuranceRequired: null,
    specialInsuranceType: null,

    // Section 6
    certifiedPayroll: null,
    buyAmerican: null,
    dbeSbeRequired: null,
    dbeSbeGoalPercent: null,
  }
}

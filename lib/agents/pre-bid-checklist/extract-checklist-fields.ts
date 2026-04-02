import OpenAI from "openai"
import { AI_INTAKE_MODEL, canRunAiIntake } from "@/lib/intake/run-ai-intake"
import { emptyPreBidChecklistFields, type AllowanceItem, type PreBidChecklistFields } from "./types"

let cachedClient: OpenAI | null | undefined = undefined

function getOpenAIClientForPreBid(): OpenAI | null {
  if (!canRunAiIntake()) {
    cachedClient = null
    return null
  }
  if (cachedClient !== undefined) return cachedClient
  const apiKey =
    typeof process.env.OPENAI_API_KEY === "string" ? process.env.OPENAI_API_KEY.trim() : ""
  if (!apiKey) {
    cachedClient = null
    return null
  }
  cachedClient = new OpenAI({ apiKey })
  return cachedClient
}

function parseNullableString(v: unknown): string | null {
  if (v === null || v === undefined) return null
  if (typeof v === "string") {
    const t = v.trim()
    return t.length === 0 ? null : t
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v)
  return null
}

function parseNullableNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null
  if (typeof v === "number" && Number.isFinite(v)) return Math.round(v)
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.trim())
    return Number.isFinite(n) ? Math.round(n) : null
  }
  return null
}

function parseNullableBoolean(v: unknown): boolean | null {
  if (v === null || v === undefined) return null
  if (typeof v === "boolean") return v
  if (v === "true" || v === "yes" || v === "1" || v === "required" || v === "mandatory" || v === "applies") return true
  if (v === "false" || v === "no" || v === "0" || v === "not required" || v === "does not apply") return false
  return null
}

function parsePreBidMandatoryScope(v: unknown): PreBidChecklistFields["preBidMandatoryScope"] {
  const s = parseNullableString(v)?.toLowerCase().replace(/[\s-]+/g, "_") ?? null
  if (s === "primes_and_subs" || s === "all_bidders") return "primes_and_subs"
  if (s === "primes_only" || s === "prime_only") return "primes_only"
  return null
}

function parseAllowanceItems(v: unknown): AllowanceItem[] {
  if (!Array.isArray(v)) return []
  return v
    .filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    .map((item) => ({
      description: parseNullableString(item.description) ?? "No description provided",
      amount: parseNullableString(item.amount) ?? "Amount not stated",
    }))
}

function normalizeFields(raw: Record<string, unknown>): PreBidChecklistFields {
  const flat: Record<string, unknown> = {
    ...raw,
    ...(typeof raw.bidIdentity === "object" && raw.bidIdentity !== null ? (raw.bidIdentity as Record<string, unknown>) : {}),
    ...(typeof raw.preBidMeeting === "object" && raw.preBidMeeting !== null ? (raw.preBidMeeting as Record<string, unknown>) : {}),
    ...(typeof raw.schedule === "object" && raw.schedule !== null ? (raw.schedule as Record<string, unknown>) : {}),
    ...(typeof raw.pricingFormat === "object" && raw.pricingFormat !== null ? (raw.pricingFormat as Record<string, unknown>) : {}),
    ...(typeof raw.bondsInsurance === "object" && raw.bondsInsurance !== null ? (raw.bondsInsurance as Record<string, unknown>) : {}),
    ...(typeof raw.complianceLabor === "object" && raw.complianceLabor !== null ? (raw.complianceLabor as Record<string, unknown>) : {}),
  }

  return {
    // Section 1
    projectName: parseNullableString(flat.projectName),
    bidDueDate: parseNullableString(flat.bidDueDate),
    bidDueTime: parseNullableString(flat.bidDueTime),
    bidOpeningType: parseNullableString(flat.bidOpeningType),
    biddingTo: parseNullableString(flat.biddingTo),
    deliverBidTo: parseNullableString(flat.deliverBidTo),
    deliveryMethod: parseNullableString(flat.deliveryMethod),
    numberOfCopies: parseNullableNumber(flat.numberOfCopies),
    documentsAvailableAt: parseNullableString(flat.documentsAvailableAt),
    lastRfiDate: parseNullableString(flat.lastRfiDate),

    // Section 2
    preBidHeld: parseNullableBoolean(flat.preBidHeld),
    preBidMandatory: parseNullableBoolean(flat.preBidMandatory),
    preBidMandatoryScope: parsePreBidMandatoryScope(flat.preBidMandatoryScope),
    preBidDate: parseNullableString(flat.preBidDate),
    preBidTime: parseNullableString(flat.preBidTime),
    preBidLocation: parseNullableString(flat.preBidLocation),

    // Section 3
    proposedStartDate: parseNullableString(flat.proposedStartDate),
    proposedCompletionDate: parseNullableString(flat.proposedCompletionDate),

    // Section 4
    unitPricing: parseNullableBoolean(flat.unitPricing),
    alternates: parseNullableBoolean(flat.alternates),
    alternatesCount: parseNullableNumber(flat.alternatesCount),
    alternatesDescription: parseNullableString(flat.alternatesDescription),
    allowances: parseNullableBoolean(flat.allowances),
    allowanceItems: parseAllowanceItems(flat.allowanceItems),
    breakDownsRequired: parseNullableBoolean(flat.breakDownsRequired),

    // Section 5
    bidBondRequired: parseNullableBoolean(flat.bidBondRequired),
    bidBondAmount: parseNullableString(flat.bidBondAmount),
    plmBonds: parseNullableBoolean(flat.plmBonds),
    liquidatedDamages: parseNullableBoolean(flat.liquidatedDamages),
    liquidatedDamagesAmount: parseNullableString(flat.liquidatedDamagesAmount),
    obligee: parseNullableString(flat.obligee),
    specialInsuranceRequired: parseNullableBoolean(flat.specialInsuranceRequired),
    specialInsuranceType: parseNullableString(flat.specialInsuranceType),

    // Section 6
    certifiedPayroll: parseNullableBoolean(flat.certifiedPayroll),
    buyAmerican: parseNullableBoolean(flat.buyAmerican),
    dbeSbeRequired: parseNullableBoolean(flat.dbeSbeRequired),
    dbeSbeGoalPercent: parseNullableString(flat.dbeSbeGoalPercent),
  }
}

const SYSTEM_PROMPT =
  "You are an experienced electrical subcontractor estimator reviewing construction bid documents. Extract specific bid requirement fields from the provided text. Return only valid JSON with no markdown, no explanation, no preamble. If a field cannot be found in the text, return null for that field. Do not guess or infer values not explicitly stated."

function buildUserPrompt(frontEndText: string): string {
  return `
Extract these fields into a single flat JSON object using EXACTLY these camelCase keys.
Return null for any field not explicitly found in the text. Do not guess.

SECTION 1 — Bid Identity:
- projectName: the official project name or project title as it appears on the cover page, advertisement for bids, invitation to bid, or bid form header. Look for labels like "Project:", "Project Name:", "Re:", or a bold/prominent title near the top of the document. Return the name exactly as stated. Return null only if no project name or title can be found anywhere in the first pages.
- bidDueDate: date bid is due, exactly as stated
- bidDueTime: time bid is due, exactly as stated
- bidOpeningType: "Public" or "Private" only if explicitly stated, otherwise null
- biddingTo: name of entity bids are submitted to (owner, GC, CM, etc.)
- deliverBidTo: full address or portal URL for bid delivery
- deliveryMethod: how bids are delivered. If the spec says bids will be "received at" a physical address or office, or mentions hand delivery, return "in person". If it mentions email, online portal, or electronic submission, return "electronic". If it mentions mail or courier only with no physical drop-off, return "mail". If both in person and mail are accepted, return "in person or mail". Return null only if no delivery instructions are found anywhere.
- numberOfCopies: number of hard copy bid sets or forms required. Look for language like "one separate unbound copy", "submit X copies", "X sets of documents". If no copy count is stated but a bid form must be submitted, return 1 as the minimum default. Only return null if there is genuinely no bid submission requirement at all.
- documentsAvailableAt: where plans and specs can be obtained
- lastRfiDate: last date questions or RFIs are accepted. If a specific calendar date is stated, return it exactly. If stated as a relative period (e.g. "questions received less than 7 days prior to bid opening will not be answered", "questions received less than 7 days prior may not be answered"), return that language exactly as stated. Treat "may not be answered" the same as "will not be answered" — both indicate a deadline. Return null only if no RFI deadline is mentioned at all.

SECTION 2 — Pre-Bid Meeting:
- preBidHeld: true if a pre-bid meeting is scheduled, false if explicitly stated there is none, null if not mentioned
- preBidMandatory: true if attendance is explicitly mandatory (look for "mandatory", "required attendance", "must attend", "attendance is mandatory", "required to attend"). Return false if the spec uses any encouraging or optional language including: "encouraged to attend", "encouraged to attend and participate", "encouraged to participate", "recommended", "invited", "optional". Return null only if attendance requirement is not mentioned at all.
- preBidMandatoryScope: "primes_and_subs" if the spec explicitly states subcontractors or all parties must attend. Default to "primes_only" if attendance is mandatory but subcontractors are not explicitly mentioned — bid specs speak to prime bidders unless otherwise stated. Only return null if the language is genuinely ambiguous about who is required.
- preBidDate: date of pre-bid meeting exactly as stated
- preBidTime: time of pre-bid meeting exactly as stated
- preBidLocation: full location or address of pre-bid meeting

SECTION 3 — Schedule:
- proposedStartDate: the project start date or commencement date, exactly as stated. Look for "start date", "commencement date", "Notice to Proceed", "NTP", or any language stating when work begins. If stated as a duration (e.g. "within 10 days of Notice to Proceed"), return that language exactly. Return null only if no start date or commencement language is found anywhere.
- proposedCompletionDate: the project completion date or duration, exactly as stated. Look for ALL of the following formats and combine them if multiple are found:
  - "Substantial Completion" date or duration
  - "Final Completion" or "Final Payment" date or duration  
  - "Contract Time" in calendar or working days
  - Any date labeled as a completion milestone
  If both Substantial Completion and Final Completion dates are found, return them on separate lines in this format: "Substantial Completion: [date]\nFinal Completion: [date]"
  If only one is found, return it exactly as stated.
  Return null only if no completion date or duration is found anywhere.

SECTION 4 — Bid Pricing Format:
- unitPricing: true if the bid form contains unit price line items with quantities and unit prices, OR if there is a schedule of items or bid schedule with individual line items requiring unit prices. Return true even if the document is primarily a proposal form with a schedule of items.
- alternates: true if alternates are included in the bid, false if explicitly none, null if not mentioned
- alternatesCount: number of alternates if stated
- alternatesDescription: one sentence describing the alternates if stated
- allowances: true if any allowances are included in the bid. Look for "cash allowances", "specific cash allowances are included in the price", allowance line items in the bid form, or any dollar amount labeled as an allowance anywhere in the document. The allowanceItems array must contain each allowance found — look carefully at bid form tables where a description appears on the left and a dollar amount on the right. Even if the allowance is stated as already included in the base bid, extract it as an allowanceItem. Common formats include: a table row with description and dollar amount, a line item in a bid schedule, or a parenthetical dollar amount following an allowance description.
- allowanceItems: array of objects with "description" and "amount" keys for each allowance found. Return [] if none found.
- breakDownsRequired: true if the bid form requires pricing to be broken down into separate named components, divisions, or sections — each with their own subtotal — in addition to a grand total. Common patterns: multiple named divisions (e.g. "Division I – Parking Lot 4", "Division II – Parking Lot 5") each requiring a separate subtotal; a lump sum base bid with required itemized cost breakdowns by trade or component; or any bid form that explicitly requires separate pricing for named scopes of work. Return false only if the bid requires a single grand total with no subdivision. Return null if the bid form structure cannot be determined from the text.

SECTION 4 — Bonds & Insurance:
- bidBondRequired: true if a bid bond, bid guaranty, or bid security is required as a condition of bidding
- bidBondAmount: the amount or percentage of the bid bond, bid guaranty, or bid security if stated (e.g. "5%", "$50,000", "5 percent of maximum bid price")
- plmBonds: true if performance, labor, and material bonds are required
- liquidatedDamages: true if liquidated damages clause applies
- liquidatedDamagesAmount: dollar amount, formula, or schedule for liquidated damages. Look in the Agreement section, Contract Times article, and any section titled "Liquidated Damages". Common formats: "$X,000 for each day", "$X per calendar day", tiered schedules based on contract value. If found in the Agreement (which may be deeper in the document), still extract it. Return null only if liquidated damages apply but no amount is stated anywhere.
- obligee: name of bond obligee if stated
- specialInsuranceRequired: true if any insurance beyond standard coverages is required. Standard coverages that do NOT trigger this field: Commercial General Liability, Automobile Liability, Workers Compensation, standard Umbrella/Excess Liability. Non-standard coverages that DO trigger this field: Contractor's Pollution Liability, Professional Liability (E&O), Railroad Protective Liability, OCIP or wrap-up insurance, Installation Floater, any coverage with unusual minimum limits significantly above standard construction requirements, or any requirement naming additional insureds beyond the owner and engineer. Return true if ANY non-standard coverage is found anywhere in the document.
- specialInsuranceType: describe all non-standard insurance requirements found. List each type and its required limits if stated (e.g. "Contractor's Pollution Liability: $3,000,000 per occurrence"). If multiple non-standard coverages are required, list all of them.

SECTION 6 — Compliance & Labor:
- certifiedPayroll: true if certified payroll or prevailing wage is required. Also return true if project is funded by any federal program including Davis-Bacon, EDA, SRF, CWSRF, DWSRF, FHWA, HUD, or EPA.
- buyAmerican: true if Buy American or domestic content requirements apply. Return true for any of these: explicit "Buy America" or "Buy American" language, AIS (American Iron and Steel) requirements, projects funded by CWSRF/DWSRF/SRF/EDA/EPA/HUD, BABAA language, OR any project that references MDOT 2020 Standard Specifications for Construction or FHWA funding — FHWA Buy America requirements are incorporated by reference into all MDOT standard spec projects. Return null only if none of these indicators are present.
- dbeSbeRequired: true if the spec states a specific DBE or SBE participation percentage or goal (e.g. "Required DBE Participation: 5.00%", "15% DBE goal"), OR if it requires Good Faith Effort documentation for DBE/SBE. Return false if the only reference is a qualifications disclosure form or a table listing certification types with no participation requirement attached.
- dbeSbeGoalPercent: the DBE or SBE participation percentage or goal if explicitly stated (e.g. "5.00%", "15%"). Return null if not stated or if DBE is not required.

--- DOCUMENT TEXT ---
${frontEndText}
`.trim()
}

export async function extractChecklistFields(
  frontEndText: string,
  uploadId: string,
): Promise<PreBidChecklistFields | null> {
  try {
    const client = getOpenAIClientForPreBid()
    if (!client) return null

    const completion = await client.chat.completions.create({
      model: AI_INTAKE_MODEL,
      temperature: 0.1,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: buildUserPrompt(frontEndText) },
      ],
    })

    const rawText = completion.choices[0]?.message?.content?.trim()
    if (!rawText) return null

    const parsed = JSON.parse(rawText) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null

    return normalizeFields(parsed as Record<string, unknown>)
  } catch (err) {
    console.error("extractChecklistFields", { uploadId, err })
    return null
  }
}

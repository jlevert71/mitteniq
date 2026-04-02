import { prisma } from "@/lib/prisma"
import { type PreBidChecklistFields } from "./types"

export async function savePreBidChecklist(params: {
  uploadId: string
  fields: PreBidChecklistFields
  meta: {
    passesRun: number
    pagesScanned: number
    model: string
    durationMs: number
  }
  extractedAt: string
}): Promise<{ id: string }> {
  const { uploadId, fields, meta, extractedAt } = params

  const checklist = await prisma.preBidChecklist.upsert({
    where: { uploadId },
    create: {
      uploadId,
      projectName: fields.projectName,
      extractedAt: new Date(extractedAt),
      passesRun: meta.passesRun,
      pagesScanned: meta.pagesScanned,
      model: meta.model,
      durationMs: meta.durationMs,

      bidDueDate: fields.bidDueDate,
      bidDueTime: fields.bidDueTime,
      bidOpeningType: fields.bidOpeningType,
      biddingTo: fields.biddingTo,
      deliverBidTo: fields.deliverBidTo,
      deliveryMethod: fields.deliveryMethod,
      numberOfCopies: fields.numberOfCopies,
      documentsAvailableAt: fields.documentsAvailableAt,
      lastRfiDate: fields.lastRfiDate,

      preBidHeld: fields.preBidHeld,
      preBidMandatory: fields.preBidMandatory,
      preBidMandatoryScope: fields.preBidMandatoryScope,
      preBidDate: fields.preBidDate,
      preBidTime: fields.preBidTime,
      preBidLocation: fields.preBidLocation,

      proposedStartDate: fields.proposedStartDate,
      proposedCompletionDate: fields.proposedCompletionDate,

      unitPricing: fields.unitPricing,
      alternates: fields.alternates,
      alternatesCount: fields.alternatesCount,
      alternatesDescription: fields.alternatesDescription,
      allowances: fields.allowances,
      breakDownsRequired: fields.breakDownsRequired,

      bidBondRequired: fields.bidBondRequired,
      bidBondAmount: fields.bidBondAmount,
      plmBonds: fields.plmBonds,
      liquidatedDamages: fields.liquidatedDamages,
      liquidatedDamagesAmount: fields.liquidatedDamagesAmount,
      obligee: fields.obligee,
      specialInsuranceRequired: fields.specialInsuranceRequired,
      specialInsuranceType: fields.specialInsuranceType,

      certifiedPayroll: fields.certifiedPayroll,
      buyAmerican: fields.buyAmerican,
      dbeSbeRequired: fields.dbeSbeRequired,

      allowanceItems: {
        create: fields.allowanceItems.map((item, i) => ({
          sortOrder: i,
          description: item.description,
          amount: item.amount,
        })),
      },
    },
    update: {
      extractedAt: new Date(extractedAt),
      passesRun: meta.passesRun,
      pagesScanned: meta.pagesScanned,
      model: meta.model,
      durationMs: meta.durationMs,

      projectName: fields.projectName,
      bidDueDate: fields.bidDueDate,
      bidDueTime: fields.bidDueTime,
      bidOpeningType: fields.bidOpeningType,
      biddingTo: fields.biddingTo,
      deliverBidTo: fields.deliverBidTo,
      deliveryMethod: fields.deliveryMethod,
      numberOfCopies: fields.numberOfCopies,
      documentsAvailableAt: fields.documentsAvailableAt,
      lastRfiDate: fields.lastRfiDate,

      preBidHeld: fields.preBidHeld,
      preBidMandatory: fields.preBidMandatory,
      preBidMandatoryScope: fields.preBidMandatoryScope,
      preBidDate: fields.preBidDate,
      preBidTime: fields.preBidTime,
      preBidLocation: fields.preBidLocation,

      proposedStartDate: fields.proposedStartDate,
      proposedCompletionDate: fields.proposedCompletionDate,

      unitPricing: fields.unitPricing,
      alternates: fields.alternates,
      alternatesCount: fields.alternatesCount,
      alternatesDescription: fields.alternatesDescription,
      allowances: fields.allowances,
      breakDownsRequired: fields.breakDownsRequired,

      bidBondRequired: fields.bidBondRequired,
      bidBondAmount: fields.bidBondAmount,
      plmBonds: fields.plmBonds,
      liquidatedDamages: fields.liquidatedDamages,
      liquidatedDamagesAmount: fields.liquidatedDamagesAmount,
      obligee: fields.obligee,
      specialInsuranceRequired: fields.specialInsuranceRequired,
      specialInsuranceType: fields.specialInsuranceType,

      certifiedPayroll: fields.certifiedPayroll,
      buyAmerican: fields.buyAmerican,
      dbeSbeRequired: fields.dbeSbeRequired,
    },
  })

  // Delete and recreate allowance items on update
  await prisma.preBidChecklistAllowanceItem.deleteMany({
    where: { checklistId: checklist.id },
  })

  if (fields.allowanceItems.length > 0) {
    await prisma.preBidChecklistAllowanceItem.createMany({
      data: fields.allowanceItems.map((item, i) => ({
        checklistId: checklist.id,
        sortOrder: i,
        description: item.description,
        amount: item.amount,
      })),
    })
  }

  return { id: checklist.id }
}

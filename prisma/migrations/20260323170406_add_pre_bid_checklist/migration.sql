-- CreateTable
CREATE TABLE "PreBidChecklist" (
    "id" TEXT NOT NULL,
    "uploadId" TEXT NOT NULL,
    "extractedAt" TIMESTAMP(3) NOT NULL,
    "passesRun" INTEGER NOT NULL,
    "pagesScanned" INTEGER NOT NULL,
    "model" TEXT NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "bidDueDate" TEXT,
    "bidDueTime" TEXT,
    "bidOpeningType" TEXT,
    "biddingTo" TEXT,
    "deliverBidTo" TEXT,
    "deliveryMethod" TEXT,
    "numberOfCopies" INTEGER,
    "documentsAvailableAt" TEXT,
    "lastRfiDate" TEXT,
    "preBidHeld" BOOLEAN,
    "preBidMandatory" BOOLEAN,
    "preBidMandatoryScope" TEXT,
    "preBidDate" TEXT,
    "preBidTime" TEXT,
    "preBidLocation" TEXT,
    "proposedStartDate" TEXT,
    "proposedCompletionDate" TEXT,
    "unitPricing" BOOLEAN,
    "alternates" BOOLEAN,
    "alternatesCount" INTEGER,
    "alternatesDescription" TEXT,
    "allowances" BOOLEAN,
    "breakDownsRequired" BOOLEAN,
    "bidBondRequired" BOOLEAN,
    "bidBondAmount" TEXT,
    "plmBonds" BOOLEAN,
    "liquidatedDamages" BOOLEAN,
    "liquidatedDamagesAmount" TEXT,
    "obligee" TEXT,
    "specialInsuranceRequired" BOOLEAN,
    "specialInsuranceType" TEXT,
    "certifiedPayroll" BOOLEAN,
    "buyAmerican" BOOLEAN,
    "dbeSbeRequired" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreBidChecklist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreBidChecklistAllowanceItem" (
    "id" TEXT NOT NULL,
    "checklistId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "description" TEXT NOT NULL,
    "amount" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreBidChecklistAllowanceItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PreBidChecklist_uploadId_key" ON "PreBidChecklist"("uploadId");

-- CreateIndex
CREATE INDEX "PreBidChecklistAllowanceItem_checklistId_idx" ON "PreBidChecklistAllowanceItem"("checklistId");

-- AddForeignKey
ALTER TABLE "PreBidChecklist" ADD CONSTRAINT "PreBidChecklist_uploadId_fkey" FOREIGN KEY ("uploadId") REFERENCES "Upload"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreBidChecklistAllowanceItem" ADD CONSTRAINT "PreBidChecklistAllowanceItem_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "PreBidChecklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

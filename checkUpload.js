require("dotenv").config({ path: ".env.local" });
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function run() {
  const uploadId = "cmm72sjtp0001if4cfn6atgwy";

  try {
    const upload = await prisma.upload.findUnique({
      where: { id: uploadId },
      select: {
        id: true,
        status: true,
        filename: true,
        sizeBytes: true,
        mimeType: true,
        pageCount: true,
        isSearchable: true,
        isRasterOnly: true,
        intakeStatus: true,
        intakeError: true,
        createdAt: true,
        updatedAt: true,
        projectId: true,
      },
    });

    const sheetCounts = await prisma.sheet.aggregate({
      where: { uploadId },
      _count: { _all: true },
    });

    const sheetSample = await prisma.sheet.findMany({
      where: { uploadId },
      select: {
        id: true,
        pageNumber: true,
        scaleStatus: true,
        scaleConfidence: true,
        notes: true,
        createdAt: true,
      },
      orderBy: { pageNumber: "asc" },
      take: 5,
    });

    console.log("Upload:", upload);
    console.log("Sheet count:", sheetCounts);
    console.log("First 5 sheets:", sheetSample);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

run();

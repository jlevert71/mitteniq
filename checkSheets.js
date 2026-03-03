require("dotenv").config({ path: ".env.local" });
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function run() {
  try {
    const uploadId = "cmm72sjtp0001if4cfn6atgwy";
    const result = await prisma.$queryRaw`
      select count(*)::int as n
      from "Sheet"
      where "uploadId" = ${uploadId};
    `;
    console.log("Sheet count:", result);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

run();

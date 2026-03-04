require("dotenv").config({ path: ".env.local" });
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function run() {
  try {
    const r = await prisma.$queryRaw`
      select
        t.typname as enum_name,
        e.enumlabel as enum_label,
        e.enumsortorder as sort
      from pg_type t
      join pg_enum e on t.oid = e.enumtypid
      where t.typname in ('SheetType', 'ScaleStatus')
      order by t.typname, e.enumsortorder;
    `;
    console.log(r);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

run();
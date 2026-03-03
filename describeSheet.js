require("dotenv").config({ path: ".env.local" });
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function run() {
  try {
    const cols = await prisma.$queryRaw`
      select column_name, data_type
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'Sheet'
      order by ordinal_position;
    `;

    console.log(cols);
  } catch (e) {
    console.error(e);
  } finally {
    await prisma.$disconnect();
  }
}

run();

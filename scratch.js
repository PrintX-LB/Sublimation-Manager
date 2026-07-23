const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const p = await prisma.artworkProject.findMany({ where: { settingsJson: { not: '' } } });
  p.forEach((proj) => {
    if (proj.settingsJson && proj.settingsJson.includes('document')) {
      console.log(proj.settingsJson);
    }
  });
}

run().finally(() => prisma.$disconnect());

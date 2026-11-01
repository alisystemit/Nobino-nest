const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const salons = await p.salon.findMany({ select: { slug: true, name: true, isApproved: true, isActive: true } });
  console.log(JSON.stringify(salons, null, 2));
  await p.$disconnect();
})().catch(e => { console.error('ERR', e.message); process.exit(1); });

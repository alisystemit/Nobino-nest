// temp — which rows look like stress/demo test data (read-only), deleted after the check
const { PrismaClient } = require("./node_modules/@prisma/client");
const p = new PrismaClient();
(async () => {
  const salons = await p.salon.count({ where: { OR: [{ name: { contains: "استرس" } }, { slug: { startsWith: "stress" } }] } });
  const allSalons = await p.salon.count();
  const pkgs = await p.package.count({ where: { OR: [{ name: { contains: "استرس" } }, { code: { startsWith: "stress" } }] } });
  const allPkgs = await p.package.count();
  const users = await p.user.count({ where: { OR: [{ phone: { startsWith: "0999" } }, { email: { contains: "stress" } }, { name: { contains: "استرس" } }] } });
  const allUsers = await p.user.count();
  const settings = await p.setting.count({ where: { key: { startsWith: "stress.key." } } });
  console.log(JSON.stringify({ salons, allSalons, pkgs, allPkgs, users, allUsers, stressSettings: settings }, null, 1));
  const s = await p.salon.findMany({ where: { NOT: { OR: [{ name: { contains: "استرس" } }, { slug: { startsWith: "stress" } }] } }, select: { name: 1, slug: 1, city: 1 }, take: 12 });
  console.log("KEEP-LIST:", JSON.stringify(s));
  const pk = await p.package.findMany({ where: { NOT: { name: { contains: "استرس" } } }, select: { name: 1, price: 1 }, take: 8 });
  console.log("KEEP-PKGS:", JSON.stringify(pk));
  await p.$disconnect();
})().catch(async (e) => { console.log("FATAL " + e.message); await p.$disconnect(); });

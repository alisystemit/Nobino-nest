const { PrismaClient } = require("./node_modules/@prisma/client");
const p = new PrismaClient();
const one = (a) => a.map(x => JSON.stringify(x)).join("\n");
(async () => {
  console.log("PKG real:", one(await p.package.findMany({ where: { name: { not: { contains: "استرس" } } }, select: { id: 1, name: 1, plan: 1, price: 1, yearlyPrice: 1, durationDays: 1, isActive: 1 } })));
  console.log("PKG stress count:", await p.package.count({ where: { name: { contains: "استرس" } } }));
  console.log("USER groups:", one(await p.user.groupBy({ by: ["role"], _count: { _all: true } })));
  console.log("KEEPERS:", one(await p.user.findMany({ where: { role: { in: ["SALON_OWNER", "ADMIN", "AGENT"] } }, select: { id: 1, phone: 1, name: 1, email: 1, role: 1 }, orderBy: { phone: "asc" } })));
  console.log("SETTINGS:", one(await p.setting.findMany({ where: { key: { in: ["miniapps.default_salon", "home.sample_salons"] } }, select: { key: 1, value: 1 } })));
  console.log("NONSTRESS SALONS:", one(await p.salon.findMany({ where: { slug: { not: { startsWith: "stress" } } }, select: { slug: 1, name: 1, city: 1, ownerId: 1, plan: 1, depositEnabled: 1 } })));
  console.log("TOTALS salon", await p.salon.count(), "user", await p.user.count());
})().finally(() => p.$disconnect());

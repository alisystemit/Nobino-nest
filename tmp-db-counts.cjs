// temp — row counts, deleted after the check
const { PrismaClient } = require("./node_modules/@prisma/client");
const p = new PrismaClient();
const models = Object.keys(p).filter((k) => !k.startsWith("$") && typeof p[k]?.count === "function");
(async () => {
  const out = {};
  for (const m of models) {
    try {
      out[m] = await p[m].count();
    } catch (e) {
      out[m] = "ERR " + e.message.slice(0, 40);
    }
  }
  console.log(JSON.stringify(out, null, 1));
  await p.$disconnect();
})().catch(async (e) => {
  console.log("FATAL " + e.message);
  await p.$disconnect();
});

// temp — JSON dump of every table, for a restore point before the data swap
const fs = require("fs");
const path = require("path");
const { PrismaClient } = require("./node_modules/@prisma/client");
const p = new PrismaClient();

(async () => {
  const dir = path.join(__dirname, "backups");
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(dir, `pre-real-seed-${stamp}.json`);
  const models = Object.keys(p).filter((k) => !k.startsWith("$") && typeof p[k]?.findMany === "function");
  const out = {};
  for (const m of models) {
    out[m] = await p[m].findMany();
    console.log(m, out[m].length);
  }
  fs.writeFileSync(file, JSON.stringify(out), "utf8");
  console.log("WROTE", file, (fs.statSync(file).size / 1048576).toFixed(1) + " MB");
  await p.$disconnect();
})().catch(async (e) => {
  console.log("FATAL " + e.message);
  await p.$disconnect();
});

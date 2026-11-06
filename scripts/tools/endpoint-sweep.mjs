// sweep: هر GET بدون پارامتر در منیفست + endpointهای Nest → وضعیت HTTP
// استفاده:  node scripts/tools/endpoint-sweep.mjs [port]
// اعتبار ادمین از محیط خوانده می‌شود (ADMIN_EMAIL/ADMIN_PASSWORD)؛ بدون آن
// مسیرهای /api/admin فقط SKIP می‌شوند.
import { readFileSync } from "node:fs";
import { join } from "node:path";

const PORT = process.argv[2] || "3199";
const BASE = `http://127.0.0.1:${PORT}`;
const man = JSON.parse(readFileSync(join(import.meta.dirname, "..", "..", "backend", "src", "routes", "manifest.json"), "utf8"));
const paths = [...new Set(man.filter((e) => (e.methods || []).includes("GET") && !e.url.includes(":")).map((e) => e.url))];
paths.push("/api/health", "/api/pages/dashboard-salon", "/api/pages/home", "/api/pages/seo-salons", "/api/admin/ai/status", "/api/admin/ai/test");
let adminToken = "";
const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;
if (email && password) {
  try {
    const r = await fetch(`${BASE}/api/admin/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const d = await r.json();
    adminToken = d?.token || d?.data?.token || "";
    console.log(`admin login: ${r.status} token=${adminToken ? "yes" : "no " + JSON.stringify(d).slice(0, 80)}`);
  } catch (e) {
    console.log("admin login failed:", e.message);
  }
} else {
  console.log("admin login: skip (ADMIN_EMAIL/ADMIN_PASSWORD در محیط نیست)");
}
const bad = [];
for (const p of paths) {
  const need = p.startsWith("/api/admin");
  if (need && !adminToken) { bad.push(`SKIP(no-token) ${p}`); continue; }
  try {
    const res = await fetch(BASE + p, { headers: adminToken && need ? { authorization: `Bearer ${adminToken}` } : {}, signal: AbortSignal.timeout(12000) });
    const text = await res.text();
    let kind = "json";
    try { JSON.parse(text); } catch { kind = "NOT-JSON/" + text.slice(0, 30).replace(/\n/g, " "); }
    const line = `${res.status} ${p} [${kind}]`;
    if (res.status >= 500 || kind !== "json") bad.push(line + " " + text.slice(0, 160).replace(/\s+/g, " "));
    else console.log(line);
  } catch (e) {
    bad.push(`ERR ${p} ${e.message}`);
  }
}
console.log(`\n--- problems: ${bad.length} ---`);
bad.forEach((b) => console.log(b));

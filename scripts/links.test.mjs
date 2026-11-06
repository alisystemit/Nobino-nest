// نگهبان نشانی سالن در فرانت
//  • بخش اول: هیچ لینک/ناوبری سالنی در فرم مسیر (`/s/<slug>`) نوشته نشود — آن فرم
//    فقط بازگشتِ میزبان IP و مسیر روت است؛ لینک‌ها باید `subdomainUrl(slug)` بدهند
//    تا کلیک روی `http://mah.localhost:3100` همان‌جا بنشیند، نه `:3100/s/mah`.
//  • بخش دوم: `Link` در router-shim نشانی مطلقِ میزبانِ دیگر را با <a> واقعی رندر
//    می‌کند؛ react-router در `to` میزبان را دور می‌ریزد و کلیک به `/` می‌افتاد.
// اجرا: npm test   |   اگر esbuild در frontend/node_modules نباشد بخش دوم skip می‌شود.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readdirSync, readFileSync, statSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname } from "node:path";
import { requireDep } from "./lib/test-guard.mjs";

const require = createRequire(import.meta.url);
const ROOT = join(import.meta.dirname, "..");
const SRC = join(ROOT, "frontend", "src");

/** الگوهای ممنوع: لینک یا ناوبری با فرم مسیرِ صفحهٔ سالن */
const FORBIDDEN = [
  /\b(?:href|to)=\{?\s*[`"']\/s\//,
  /\b(?:window\.open|navigate|push|replace|location\.href\s*=)\s*[=(]?\s*[`"']\/s\//,
];

/** فایل‌هایی که عمداً `/s/<slug>` را به‌عنوان بازگشت برمی‌گردانند (بدون href) */
const walk = (dir) => {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walk(p));
    else if ([".ts", ".tsx"].includes(extname(name))) out.push(p);
  }
  return out;
};

test("هیچ لینک سالنی در فرانت به فرم مسیر (/s/<slug>) نمی‌رود", () => {
  const hits = [];
  for (const file of walk(SRC)) {
    const rel = file.slice(ROOT.length + 1).replace(/\\/g, "/");
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .forEach((line, i) => {
        if (line.trim().startsWith("*") || line.trim().startsWith("//")) return;
        for (const re of FORBIDDEN) {
          if (re.test(line)) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 110)}`);
        }
      });
  }
  assert.deepEqual(hits, [], "لینک/ناوبری با فرم مسیر پیدا شد (باید subdomainUrl باشد):\n" + hits.join("\n"));
});

test("صفحه‌های پنل برای نشانی سالن از subdomainUrl استفاده می‌کنند", () => {
  const mustUse = [
    "frontend/src/pages/DashboardSalon.tsx",
    "frontend/src/pages/DashboardManagement.tsx",
    "frontend/src/pages/DashboardSetup.tsx",
    "frontend/src/pages/DashboardStaff.tsx",
    "frontend/src/pages/DashboardCommission.tsx",
    "frontend/src/pages/PayPage.tsx",
    "frontend/src/pages/HomePage.tsx",
    "frontend/src/pages/SalonsPage.tsx",
    "frontend/src/components/AccountPanel.tsx",
    "frontend/src/components/appointments/AppointmentCard.tsx",
    "frontend/src/components/appointments/ActionSheet.tsx",
    "frontend/src/dashmini/pages/DashAgenda.tsx",
  ];
  for (const rel of mustUse) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    assert.match(src, /subdomainUrl\(/, `${rel} باید از subdomainUrl() استفاده کند`);
    assert.match(src, /@\/lib\/subdomain/, `${rel} باید @/lib/subdomain را import کند`);
  }
});

/* ---------------------------------- بخش دوم: رفتار Link با میزبانِ دیگر ---------------------------------- */
const esbuildPath = (() => {
  try {
    return require(join(ROOT, "frontend", "node_modules", "esbuild", "lib", "main.js"));
  } catch {
    return null;
  }
})();

const STUB_REACT = `
let counter = 0;
exports.createElement = (type, props, ...children) => ({ __el: ++counter, type, props: props ?? {}, children });
exports.useContext = () => null;
exports.Fragment = "Fragment";
`;
const STUB_RRD = `
exports.Link = "RouterLink";
exports.Navigate = "Navigate";
exports.useLocation = () => ({ pathname: "/", search: "" });
exports.useNavigate = () => () => {};
exports.useParams = () => ({});
`;

test("Linkِ router-shim: نشانی میزبانِ دیگر با <a> واقعی، مسیر داخل‌سایت با RouterLink", async (t) => {
  // ME-9: بی‌esbuild این تست هرگز اجرا نمی‌شود؛ skip بی‌صدا سبز نگهش می‌داشت
  if (!requireDep(t, "esbuild", "frontend")) return;
  const dir = mkdtempSync(join(tmpdir(), "nobino-links-"));
  const reactStub = join(dir, "react-stub.cjs");
  const rrdStub = join(dir, "rrd-stub.cjs");
  const out = join(dir, "router-shim.cjs");
  writeFileSync(reactStub, STUB_REACT);
  writeFileSync(rrdStub, STUB_RRD);
  await esbuildPath.build({
    entryPoints: [join(SRC, "router-shim.tsx")],
    bundle: true,
    outfile: out,
    format: "cjs",
    platform: "node",
    alias: { react: reactStub, "react-router-dom": rrdStub },
    logLevel: "silent",
  });

  globalThis.window = { location: { origin: "http://localhost:3100", hostname: "localhost", protocol: "http:", port: "3100" } };
  const shim = require(out);
  try {
    const cross = shim.Link({ href: "http://stress-salon-1028.localhost:3100/", className: "x", children: "مشاهده" });
    assert.equal(cross.type, "a", "نشانی میزبانِ دیگر باید <a> باشد، نه RouterLink");
    assert.equal(cross.props.href, "http://stress-salon-1028.localhost:3100/", "میزبان باید در href بماند");

    const sameOrigin = shim.Link({ href: "http://localhost:3100/dashboard", children: "پنل" });
    assert.equal(sameOrigin.type, "RouterLink", "میزبانِ خودش همان‌جا SPA می‌ماند");
    assert.equal(sameOrigin.props.to, "http://localhost:3100/dashboard");

    const relative = shim.Link({ href: "/s/mah", children: "مسیر" });
    assert.equal(relative.type, "RouterLink", "مسیر نسبی ناوبری داخلی است");

    const anchor = shim.Link({ href: "https://mah.nobino.ir/", target: "_blank", rel: "noopener", children: "سالن" });
    assert.equal(anchor.type, "a", "ساب‌دامینِ دامنهٔ واقعی هم <a> می‌شود");
    assert.equal(anchor.props.target, "_blank", "پراپ‌های لنگر (<a>) حفظ می‌شوند");
  } finally {
    delete globalThis.window;
  }
});

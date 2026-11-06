// ساخت پچ جزئی از diff یک فایل: فقط هانک‌هایی که خطوط افزوده‌شان شامل علامت
// مشخصی هستند نگه داشته می‌شود؛ بقیه در working tree می‌مانند.
//   node scripts/tools/stage-hunk.mjs <file> <marker> [marker2 ...]
// سپس:  git apply --cached --recount < خروجی
import { execFileSync } from "node:child_process";

const [file, ...markers] = process.argv.slice(2);
if (!file || markers.length === 0) {
  console.error("استفاده: node scripts/tools/stage-hunk.mjs <file> <marker> [...]");
  process.exit(2);
}
const diff = execFileSync("git", ["diff", "--no-color", "--", file], { encoding: "utf8" });
const lines = diff.split("\n");
const head = [];
const hunks = [];
let cur = null;
for (const l of lines) {
  if (l.startsWith("@@")) {
    cur = [l];
    hunks.push(cur);
  } else if (cur) {
    cur.push(l);
  } else {
    head.push(l);
  }
}
const keep = hunks.filter((h) => h.some((l) => l.startsWith("+") && !l.startsWith("+++") && markers.some((m) => l.includes(m))));
if (keep.length === 0) {
  console.error(`هیچ هانکی با علامت‌های [${markers.join(", ")}] پیدا نشد — از اعمال خودداری شد.`);
  process.exit(3);
}
process.stdout.write(head.join("\n") + "\n" + keep.map((h) => h.join("\n")).join("\n").replace(/\n+$/, "\n") + "\n");

// تست گارد ME-9 (scripts/lib/test-guard.mjs): نبودِ بیلد/وابستگی باید تست را
// بشکند، نه اینکه با skip بی‌صدا «سبز» نگهش دارد. ماژول با query متفاوت import
// می‌شود تا SKIP_MISSING_ARTIFACTS هر بار دوباره خوانده شود (کش ماژول).
import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const guard = (seed) => import(`./lib/test-guard.mjs?v=${seed}`);

/** TestContext جعلی؛ فقط fail/skip/pass ثبت می‌شوند */
const fakeT = () => {
  const calls = [];
  return { calls, fail: (m) => calls.push(["fail", m]), skip: (m) => calls.push(["skip", m]), pass: () => calls.push(["pass"]) };
};

describe("گارد نبودِ artifact (ME-9)", () => {
  const dir = mkdtempSync(join(tmpdir(), "nobino-guard-"));
  const missing = join(dir, "nope", "main.js");
  const present = join(dir, "present.js");
  writeFileSync(present, "// x", "utf8");

  test("artifact موجود → بدون fail/skip و تست ادامه می‌دهد", async () => {
    delete process.env.SKIP_MISSING_ARTIFACTS;
    const { requireArtifact } = await guard("ok");
    const t = fakeT();
    assert.equal(requireArtifact(t, present, "npm run build:backend"), true);
    assert.deepEqual(t.calls, []);
  });

  test("artifact گم‌شده → t.fail با پیامِ فرمانِ ساخت", async () => {
    delete process.env.SKIP_MISSING_ARTIFACTS;
    const { requireArtifact } = await guard("fail");
    const t = fakeT();
    assert.equal(requireArtifact(t, missing, "npm run build:backend"), false);
    assert.equal(t.calls[0][0], "fail", "نباید skip شود");
    assert.match(t.calls[0][1], /npm run build:backend/);
    assert.match(t.calls[0][1], /SKIP_MISSING_ARTIFACTS=1/);
  });

  test("با SKIP_MISSING_ARTIFACTS=1 همان حالت skip می‌شود (فرار آگاهانه)", async () => {
    process.env.SKIP_MISSING_ARTIFACTS = "1";
    try {
      const { requireArtifact } = await guard("skip");
      const t = fakeT();
      assert.equal(requireArtifact(t, missing, "npm run build:backend"), false);
      assert.equal(t.calls[0][0], "skip");
    } finally {
      delete process.env.SKIP_MISSING_ARTIFACTS;
    }
  });

  test("requireCommand برای فرمانِ نبودنی همان قاعده را دارد", async () => {
    delete process.env.SKIP_MISSING_ARTIFACTS;
    const { requireCommand } = await guard("cmd");
    const t = fakeT();
    assert.equal(requireCommand(t, "nobino-not-a-real-command", "bash را نصب کنید"), false);
    assert.equal(t.calls[0][0], "fail");
    assert.match(t.calls[0][1], /bash را نصب کنید/);
    assert.equal(requireCommand(t, process.execPath, "node"), true, "خودِ نود همیشه در PATH است");
  });

  after(() => rmSync(dir, { recursive: true, force: true }));
});

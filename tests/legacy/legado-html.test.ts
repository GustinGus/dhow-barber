import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/** SHA-256 of the legacy index.html published before the React cutover (commit 80c6699), with LF line endings. */
const ORIGINAL_LEGACY_SHA256 = "2c698c6b8beca952afcc88f8c24c437a2769d32e011550f5950f5cfed3bd63a8";

const RETURN_SCRIPT = /<!-- dhow:legado-retorno:inicio -->[\s\S]*?<!-- dhow:legado-retorno:fim -->\r?\n/g;

function readLegacyPage(): string {
  return readFileSync(path.resolve(__dirname, "../../public/legado.html"), "utf8");
}

describe("public/legado.html", () => {
  it("is the original legacy app plus only the return script", () => {
    const html = readLegacyPage();
    expect(html.match(RETURN_SCRIPT)).toHaveLength(1);

    const original = html.replace(RETURN_SCRIPT, "").replace(/\r\n/g, "\n");
    expect(createHash("sha256").update(original, "utf8").digest("hex")).toBe(ORIGINAL_LEGACY_SHA256);
  });

  it("runs the return script before any legacy script", () => {
    const html = readLegacyPage();
    const returnScript = html.indexOf("<!-- dhow:legado-retorno:inicio -->");
    expect(returnScript).toBeGreaterThan(-1);
    expect(html.indexOf("<script", 0)).toBeGreaterThan(returnScript);
  });

  it("keeps the legacy storage keys and analytics", () => {
    const html = readLegacyPage();
    expect(html).toContain("key:'dhow_barber_db_v1'");
    expect(html).toContain("'dhow_last_phone'");
    expect(html).toContain("'dhow_admin'");
    expect(html).toContain('<script defer src="/_vercel/insights/script.js"></script>');
  });
});

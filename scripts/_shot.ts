import { chromium } from "playwright";

async function main() {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors: string[] = [];
  p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  p.on("pageerror", (e) => errors.push(e.message));

  await p.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await p.waitForTimeout(1200);
  await p.screenshot({ path: "/tmp/portico-1-idle.png" });

  // Run a full (cached) compile through the real UI.
  await p.locator('button:has-text("compile")').first().click();
  await p.waitForSelector("text=Compiled tools", { timeout: 180_000 });
  await p.waitForTimeout(900);
  await p.screenshot({ path: "/tmp/portico-2-compiled.png", fullPage: true });

  console.log("tools rendered:", await p.locator("text=/^search_/").count());
  console.log("console errors:", errors.length ? errors.slice(0, 5) : "none");
  await b.close();
}
main().catch((e) => { console.error(e); process.exit(1); });

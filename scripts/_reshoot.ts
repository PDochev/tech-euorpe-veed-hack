import { readFixture } from "../app/_lib/cache";
import { launch, login } from "../app/_lib/driver/playwright";
import type { SiteMap } from "../app/_lib/types";

/**
 * Repair `public/shots/*.png` from an existing explore fixture.
 *
 * The thumbnails are crawl artifacts, not source, so they are easy to lose. This
 * re-shoots exactly the screens the fixture already knows about and writes them
 * back under the same ids — it never touches the fixture itself, so a recovered
 * screenshot cannot degrade a site map that took a good crawl to get.
 */

const SLUG = process.argv[2] ?? "opensource-demo-orangehrmlive-com";
const creds = {
  username: process.env.PORTICO_USERNAME ?? "Admin",
  password: process.env.PORTICO_PASSWORD ?? "admin123",
};

async function main() {
  const siteMap = await readFixture<SiteMap>(SLUG, "explore");
  if (!siteMap) throw new Error(`No explore fixture for ${SLUG}`);

  const { browser, page } = await launch();
  try {
    await login(page, siteMap.target, creds);
    console.log(`Signed in, landed on ${page.url()}`);

    for (const screen of siteMap.screens) {
      await page.goto(screen.url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `public${screen.screenshot}` });
      console.log(`  ${screen.screenshot}  ${screen.title}`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

/** Record a real SiteMap fixture. Usage: npx tsx scripts/explore.ts */
import { crawlExplorer } from "../app/_lib/stages/explore";
import { readFixture, slugify, writeFixture } from "../app/_lib/cache";
import type { Capability } from "../app/_lib/types";

const TARGET = process.env.TARGET ?? "https://opensource-demo.orangehrmlive.com";

async function main() {
  const slug = slugify(TARGET);
  // Crawl the screens h and Tavily pointed at, exactly as the pipeline does —
  // a blind crawl here would quietly record a worse fixture than the real run.
  const capabilities = [
    ...((await readFixture<Capability[]>(slug, "h-scout")) ?? []),
    ...((await readFixture<Capability[]>(slug, "seed")) ?? []),
  ];
  console.log(`  · ${capabilities.length} capability hints`);

  const siteMap = await crawlExplorer({
    target: TARGET,
    creds: { username: "Admin", password: "admin123" },
    capabilities,
    maxScreens: 10,
    log: (m) => console.log("  ·", m),
  });

  await writeFixture(slug, "explore", siteMap);
  console.log(`\nScreens: ${siteMap.screens.length}`);
  for (const s of siteMap.screens) {
    console.log(`  ${s.id}  ${String(s.elements.length).padStart(3)} els  ${s.title}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

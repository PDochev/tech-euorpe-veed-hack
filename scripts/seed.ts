/** Record capability hints. Usage: npx tsx scripts/seed.ts */
import { slugify, writeFixture } from "../app/_lib/cache";
import { seed } from "../app/_lib/stages/seed";

const TARGET = process.env.TARGET ?? "https://opensource-demo.orangehrmlive.com";

async function main() {
  const caps = await seed(TARGET, (m) => console.log("  ·", m));
  await writeFixture(slugify(TARGET), "seed", caps);
  caps.forEach((c) => console.log(`  ${c.name} — ${c.description.slice(0, 80)}`));
}
main().catch((e) => { console.error(e); process.exit(1); });

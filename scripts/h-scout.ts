/** Run the h scout. Usage: npx tsx scripts/h-scout.ts */
import { readFixture, slugify, writeFixture } from "../app/_lib/cache";
import { hScout } from "../app/_lib/stages/h-scout";
import type { Capability } from "../app/_lib/types";

const TARGET = process.env.TARGET ?? "https://opensource-demo.orangehrmlive.com";

async function main() {
  const slug = slugify(TARGET);
  const hints = (await readFixture<Capability[]>(slug, "seed")) ?? [];
  const caps = await hScout(TARGET, { username: "Admin", password: "admin123" }, hints, (m) =>
    console.log("  ·", m),
  );
  await writeFixture(slug, "h-scout", caps);
  caps.forEach((c) => console.log(`  ${c.name}\n    ${c.url}`));
}
main().catch((e) => { console.error(e.message); process.exit(1); });

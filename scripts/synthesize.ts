/** Compile the recorded SiteMap into tools. Usage: npx tsx scripts/synthesize.ts */
import { readFixture, slugify, writeFixture } from "../app/_lib/cache";
import { synthesize } from "../app/_lib/stages/synthesize";
import type { SiteMap } from "../app/_lib/types";

const TARGET = process.env.TARGET ?? "https://opensource-demo.orangehrmlive.com";

async function main() {
  const slug = slugify(TARGET);
  const siteMap = await readFixture<SiteMap>(slug, "explore");
  if (!siteMap) throw new Error("No explore fixture. Run scripts/explore.ts first.");

  const tools = await synthesize(siteMap, [], (m) => console.log("  ·", m));
  await writeFixture(slug, "synthesize", tools);

  for (const t of tools) {
    const args = Object.keys(t.inputSchema.properties);
    console.log(`\n${t.name}(${args.join(", ")})`);
    console.log(`  ${t.description}`);
    for (const s of t.recipe) {
      const bind = s.arg ? `<${s.arg}>` : (s.value ?? "");
      console.log(`    ${s.action.padEnd(6)} ${(s.selector ?? "").slice(0, 52).padEnd(54)} ${String(bind).slice(0, 40)}`);
    }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

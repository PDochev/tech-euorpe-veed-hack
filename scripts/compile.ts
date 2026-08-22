/**
 * Run the whole compiler headlessly. Usage: npx tsx scripts/compile.ts
 *
 * Same pipeline the console drives, without the browser UI — which makes it the
 * quickest way to rehearse a replay: `REPLAY=1 npx tsx scripts/compile.ts`
 * must complete every stage from fixtures with no network at all.
 */
import { compile } from "../app/_lib/pipeline";
import { isReplay } from "../app/_lib/cache";

const TARGET = process.env.TARGET ?? "https://opensource-demo.orangehrmlive.com";

async function main() {
  console.log(`${isReplay() ? "Replaying" : "Compiling"} ${TARGET}\n`);

  for await (const event of compile({
    target: TARGET,
    creds: { username: "Admin", password: "admin123" },
  })) {
    if (event.type === "stage:start") console.log(`[${event.stage}] ${event.label}`);
    else if (event.type === "stage:log") console.log(`  · ${event.message}`);
    else if (event.type === "stage:done") {
      console.log(`  ✓ ${event.summary}${event.cached ? " (cached)" : ""}`);
    } else if (event.type === "stage:error") console.log(`  ✗ ${event.message}`);
    else console.log(`\n${event.tools.length} tools ready in mcp-server/`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

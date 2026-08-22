/** Execute a compiled tool. Usage: npx tsx scripts/run-tool.ts <tool_name> key=value ... */
import { readFixture, slugify } from "../app/_lib/cache";
import { runTool } from "../app/_lib/driver/run";
import type { ToolSpec } from "../app/_lib/types";

const TARGET = process.env.TARGET ?? "https://opensource-demo.orangehrmlive.com";

async function main() {
  const [name, ...rest] = process.argv.slice(2);
  const args = Object.fromEntries(rest.map((a) => a.split(/=(.*)/).slice(0, 2))) as Record<string, string>;

  const tools = await readFixture<ToolSpec[]>(slugify(TARGET), "synthesize");
  if (!tools) throw new Error("No synthesize fixture. Run scripts/synthesize.ts first.");

  const tool = tools.find((t) => t.name === name);
  if (!tool) throw new Error(`Unknown tool "${name}". Have: ${tools.map((t) => t.name).join(", ")}`);

  console.log(`Calling ${tool.name}(${JSON.stringify(args)})\n`);
  const out = await runTool(TARGET, { username: "Admin", password: "admin123" }, tool, args);
  console.log("--- returned ---");
  console.log(out.slice(0, 1200));
}

main().catch((e) => { console.error(e); process.exit(1); });

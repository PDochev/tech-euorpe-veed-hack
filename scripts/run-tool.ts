/**
 * Execute a compiled tool.
 *
 *   npx tsx scripts/run-tool.ts <tool_name> <arg>=<value> ...
 *
 * The `<arg>=<value>` pairs are the TOOL'S arguments, not login credentials.
 * Sign-in is separate and comes from PORTICO_USERNAME / PORTICO_PASSWORD.
 * The two are easy to confuse on OrangeHRM, where `search_system_users` happens
 * to take a parameter also called `username`:
 *
 *   run-tool.ts search_system_users username=Admin
 *                                   ^^^^^^^^^^^^^^ what to search FOR,
 *                                   not who to log in AS.
 */
import { readFixture, slugify } from "../app/_lib/cache";
import { runTool } from "../app/_lib/driver/run";
import type { ToolSpec } from "../app/_lib/types";

const DEFAULT_TARGET = "https://opensource-demo.orangehrmlive.com";
const TARGET = process.env.TARGET ?? DEFAULT_TARGET;

// Same convention as scripts/compile.ts: the sandbox credentials are a default
// for the sandbox only. Any other target supplies its own, and empty means the
// site has no login wall.
const creds = {
  username:
    process.env.PORTICO_USERNAME ?? (TARGET === DEFAULT_TARGET ? "Admin" : ""),
  password:
    process.env.PORTICO_PASSWORD ??
    (TARGET === DEFAULT_TARGET ? "admin123" : ""),
};

async function main() {
  const [name, ...rest] = process.argv.slice(2);
  const args = Object.fromEntries(
    rest.map((a) => a.split(/=(.*)/).slice(0, 2)),
  ) as Record<string, string>;

  const tools = await readFixture<ToolSpec[]>(slugify(TARGET), "synthesize");
  if (!tools)
    throw new Error("No synthesize fixture. Run scripts/synthesize.ts first.");

  const tool = tools.find((t) => t.name === name);
  if (!tool)
    throw new Error(
      `Unknown tool "${name}". Have: ${tools.map((t) => t.name).join(", ")}`,
    );

  console.log(`Target    ${TARGET}`);
  console.log(`Signed in ${creds.username || "(no login required)"}`);
  console.log(`Calling   ${tool.name}(${JSON.stringify(args)})\n`);
  const out = await runTool(TARGET, creds, tool, args);
  console.log("--- returned ---");
  console.log(out.slice(0, 1200));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

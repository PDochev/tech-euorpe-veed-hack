/** Emit the MCP server from compiled tools. Usage: npx tsx scripts/emit.ts */
import { readFixture, slugify } from "../app/_lib/cache";
import { emitMcpServer } from "../app/_lib/mcp/emit";
import type { ToolSpec } from "../app/_lib/types";

const TARGET = process.env.TARGET ?? "https://opensource-demo.orangehrmlive.com";

async function main() {
  const slug = slugify(TARGET);
  const tools = await readFixture<ToolSpec[]>(slug, "synthesize");
  if (!tools) throw new Error("No synthesize fixture. Run scripts/synthesize.ts first.");

  const r = await emitMcpServer(TARGET, slug, tools, { username: "Admin", password: "admin123" });
  console.log(`Emitted ${r.toolCount} tools -> ${r.serverPath}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

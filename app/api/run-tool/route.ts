import { readFixture, slugify } from "@/app/_lib/cache";
import { runTool } from "@/app/_lib/driver/run";
import type { ToolSpec } from "@/app/_lib/types";

/** Executes one compiled tool against the live app and returns what it read. */
export async function POST(request: Request) {
  const body = (await request.json()) as {
    target: string;
    username: string;
    password: string;
    tool: string;
    args: Record<string, string>;
  };

  const tools = await readFixture<ToolSpec[]>(slugify(body.target), "synthesize");
  const tool = tools?.find((t) => t.name === body.tool);
  if (!tool) {
    return Response.json({ error: `Unknown tool "${body.tool}"` }, { status: 404 });
  }

  const started = Date.now();
  try {
    const output = await runTool(
      body.target,
      { username: body.username, password: body.password },
      tool,
      body.args,
    );
    return Response.json({ output, ms: Date.now() - started });
  } catch (err) {
    return Response.json({ error: (err as Error).message, ms: Date.now() - started }, { status: 500 });
  }
}

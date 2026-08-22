import { executeRecipe, launch, login } from "./playwright";
import type { Credentials, ToolSpec } from "../types";

/**
 * Shared tool runtime, used by both the web UI and the generated MCP server.
 *
 * Recipes start at an authenticated URL, so a session must log in before
 * replaying one. No LLM is involved: this is a page load and a few DOM actions.
 */
export async function runTool(
  target: string,
  creds: Credentials,
  tool: ToolSpec,
  args: Record<string, string>,
): Promise<string> {
  const { browser, page } = await launch();
  try {
    await login(page, target, creds);
    const raw = await executeRecipe(page, tool.recipe, args);
    return raw.slice(0, 8000);
  } finally {
    await browser.close();
  }
}

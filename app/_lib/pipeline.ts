import { cached, replayPause, slugify } from "./cache";
import { emitMcpServer } from "./mcp/emit";
import { crawlExplorer } from "./stages/explore";
import { hScout } from "./stages/h-scout";
import { seed } from "./stages/seed";
import { synthesize } from "./stages/synthesize";
import { understand } from "./stages/understand";
import type {
  Capability,
  Credentials,
  Labeled,
  SiteMap,
  StageEvent,
  StageName,
  ToolSpec,
} from "./types";

/**
 * The whole compiler, start to finish.
 *
 * Every stage is cached independently, so iterating on tool synthesis does not
 * re-run the browser crawl, and REPLAY=1 runs the entire thing from disk.
 * Progress is yielded as events so the UI can narrate the run as it happens.
 */

export type CompileOptions = {
  target: string;
  creds: Credentials;
  /** Re-run these stages even if a fixture exists. */
  force?: string[];
  /** Skip the h scout (slow) and rely on the link crawl alone. */
  skipScout?: boolean;
};

export async function* compile(opts: CompileOptions): AsyncGenerator<StageEvent> {
  const { target, creds } = opts;
  const slug = slugify(target);
  const forced = new Set(opts.force ?? []);
  const logs: string[] = [];
  const log = (m: string) => logs.push(m);

  /** Drain buffered stage logs as events. */
  function* flush(stage: StageName) {
    while (logs.length) {
      const message = logs.shift()!;
      yield { type: "stage:log", stage, message } as StageEvent;
    }
  }

  // ---- 1. Seed: what is this app supposed to do? -------------------------
  yield { type: "stage:start", stage: "seed", label: "Researching the app with Tavily" };
  let capabilities: Capability[] = [];
  try {
    const r = await cached<Capability[]>(slug, "seed", () => seed(target, log), {
      force: forced.has("seed"),
    });
    capabilities = r.data;
    yield* flush("seed");
    await replayPause();
    yield {
      type: "stage:done",
      stage: "seed",
      summary: `${capabilities.length} documented capabilities`,
      cached: r.cached,
    };
  } catch (err) {
    // Seeding is an accelerant, not a dependency — a failure here must not stop the run.
    yield { type: "stage:error", stage: "seed", message: (err as Error).message };
  }

  // ---- 2. Explore: h scouts, Playwright harvests -------------------------
  yield { type: "stage:start", stage: "explore", label: "Exploring the app" };

  if (!opts.skipScout) {
    try {
      const r = await cached<Capability[]>(
        slug,
        "h-scout",
        () => hScout(target, creds, capabilities, log),
        { force: forced.has("explore") },
      );
      // h's URLs are what make the crawl targeted rather than blind.
      capabilities = [...r.data, ...capabilities];
      yield* flush("explore");
    } catch (err) {
      yield {
        type: "stage:log",
        stage: "explore",
        message: `h scout unavailable (${(err as Error).message.slice(0, 80)}) — crawling instead`,
      };
    }
  }

  const explored = await cached<SiteMap>(
    slug,
    "explore",
    () => crawlExplorer({ target, creds, capabilities, maxScreens: 10, log }),
    { force: forced.has("explore") },
  );
  const siteMap = explored.data;
  yield* flush("explore");
  await replayPause();
  yield {
    type: "stage:done",
    stage: "explore",
    summary: `${siteMap.screens.length} screens, ${siteMap.screens.reduce((n, s) => n + s.elements.length, 0)} elements`,
    cached: explored.cached,
  };

  // ---- 3. Understand: label every control ---------------------------------
  yield { type: "stage:start", stage: "understand", label: "Classifying every control" };
  const labelled = await cached<Labeled[]>(slug, "understand", () => understand(siteMap, log), {
    force: forced.has("understand"),
  });
  const labels = labelled.data;
  yield* flush("understand");
  await replayPause();
  yield {
    type: "stage:done",
    stage: "understand",
    summary: `${labels.length} elements labelled`,
    cached: labelled.cached,
  };

  // ---- 4. Synthesize: compile tools --------------------------------------
  yield { type: "stage:start", stage: "synthesize", label: "Compiling MCP tools with OpenAI" };
  const compiled = await cached<ToolSpec[]>(
    slug,
    "synthesize",
    () => synthesize(siteMap, labels, log),
    { force: forced.has("synthesize") },
  );
  const tools = compiled.data;
  yield* flush("synthesize");
  await replayPause();
  yield {
    type: "stage:done",
    stage: "synthesize",
    summary: `${tools.length} tools compiled`,
    cached: compiled.cached,
  };

  // ---- 5. Emit: write the server ----------------------------------------
  yield { type: "stage:start", stage: "emit", label: "Writing the MCP server" };
  const emitted = await emitMcpServer(target, slug, tools, creds);
  yield {
    type: "stage:done",
    stage: "emit",
    summary: `${emitted.toolCount} tools -> mcp-server/server.mts`,
    cached: false,
  };

  yield { type: "result", siteMap, labels, tools, serverPath: emitted.serverPath };
}

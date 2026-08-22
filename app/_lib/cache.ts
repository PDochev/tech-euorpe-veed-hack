import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

/**
 * Stage-level disk cache.
 *
 * Every stage output is written to `fixtures/<slug>/<stage>.json`. Two payoffs:
 * iterating on stage 4 does not re-run the browser crawl, and REPLAY=1 lets the
 * whole pipeline run from disk with no network at all — which is how the live
 * demo survives a bad conference wifi connection.
 */

const FIXTURES = join(process.cwd(), "fixtures");

/** In replay mode a cache miss is a hard error: we must never silently hit the network. */
export const isReplay = () => process.env.REPLAY === "1";

/** Turn a target URL into a stable directory name. */
export function slugify(target: string): string {
  return target
    .replace(/^https?:\/\//, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()
    .slice(0, 60);
}

const fixturePath = (slug: string, stage: string) => join(FIXTURES, slug, `${stage}.json`);

export async function readFixture<T>(slug: string, stage: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(fixturePath(slug, stage), "utf8")) as T;
  } catch {
    return null;
  }
}

export async function writeFixture<T>(slug: string, stage: string, data: T): Promise<void> {
  const path = fixturePath(slug, stage);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2), "utf8");
}

/**
 * Run `compute` unless a fixture already exists.
 *
 * `force` re-runs even on a hit (used when the user explicitly asks for a fresh
 * crawl). In replay mode a miss throws rather than falling through to the
 * network, so a missing fixture fails loudly during rehearsal instead of
 * silently on stage.
 */
export async function cached<T>(
  slug: string,
  stage: string,
  compute: () => Promise<T>,
  opts: { force?: boolean } = {},
): Promise<{ data: T; cached: boolean }> {
  if (!opts.force) {
    const hit = await readFixture<T>(slug, stage);
    if (hit !== null) return { data: hit, cached: true };
  }

  if (isReplay()) {
    throw new Error(
      `REPLAY=1 but no fixture at fixtures/${slug}/${stage}.json. ` +
        `Run the pipeline live once to record it.`,
    );
  }

  const data = await compute();
  await writeFixture(slug, stage, data);
  return { data, cached: false };
}

/** Realistic pacing so a replayed run reads like a live one rather than an instant dump. */
export async function replayPause(ms = 400): Promise<void> {
  if (isReplay()) await new Promise((r) => setTimeout(r, ms));
}

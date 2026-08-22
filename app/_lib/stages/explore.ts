import type { Page } from "playwright";
import { harvest, launch, login } from "../driver/playwright";
import { hasCredentials, type Capability, type Credentials, type Screen, type SiteMap } from "../types";

/**
 * Stage 2: build a map of the target app.
 *
 * Two implementations behind one seam. `crawlExplorer` is the deterministic
 * fallback that always works; `hExplorer` (stages/h-scout.ts) uses a computer-use
 * agent to find capabilities a blind crawl would miss. Both end by handing URLs
 * to the same Playwright harvester, because only Playwright can produce exact
 * selectors — h returns prose, and prose cannot be replayed.
 */
export type Explorer = (ctx: ExploreContext) => Promise<SiteMap>;

export type ExploreContext = {
  target: string;
  creds: Credentials;
  capabilities: Capability[];
  maxScreens: number;
  log: (message: string) => void;
};

export function isSameOrigin(url: string, origin: string): boolean {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

/** Same-origin navigation links, deduped by path, in document order. */
async function navLinks(page: Page, origin: string, limit: number): Promise<string[]> {
  const hrefs: string[] = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a[href]"))
      .map((a) => (a as HTMLAnchorElement).href)
      .filter(Boolean),
  );

  const seen = new Set<string>();
  const out: string[] = [];

  for (const href of hrefs) {
    if (!href.startsWith(origin)) continue;
    if (/logout|signout|\.(pdf|zip|csv|png|jpg)$/i.test(href)) continue; // never log ourselves out
    const key = new URL(href).pathname;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(href);
    if (out.length >= limit) break;
  }

  return out;
}

/**
 * Breadth-first crawl from the post-login landing page.
 *
 * One level deep on purpose: legacy admin apps put their whole feature surface
 * in the top-level nav, and depth costs wall-clock we do not have.
 */
export const crawlExplorer: Explorer = async (ctx) => {
  const { browser, page } = await launch();

  try {
    ctx.log(
      hasCredentials(ctx.creds) ? `Signing in to ${ctx.target}` : `Opening ${ctx.target}`,
    );
    await login(page, ctx.target, ctx.creds);
    ctx.log(`Landed on ${page.url()}`);

    const screens: Screen[] = [];
    const origin = new URL(page.url()).origin;

    screens.push(await harvest(page, "s0"));
    ctx.log(`Harvested "${screens[0].title}" (${screens[0].elements.length} elements)`);

    const urls = await navLinks(page, origin, ctx.maxScreens - 1);
    // Capability hints from Tavily/h are prioritised over raw nav order, but a
    // hint is an untrusted URL: an agent asked to find screens that do not exist
    // can answer with a different application entirely. Never leave the target.
    const hinted = ctx.capabilities
      .map((c) => c.url)
      .filter((u): u is string => !!u && isSameOrigin(u, origin));
    const targets = [...new Set([...hinted, ...urls])].slice(0, ctx.maxScreens - 1);

    ctx.log(`Found ${targets.length} screens to visit`);

    // The landing page is already harvested; hints and nav links often point
    // back at it, and a duplicate screen wastes one of the few slots we have.
    const visited = new Set([new URL(page.url()).pathname]);

    for (const [i, url] of targets.entries()) {
      if (visited.has(new URL(url).pathname)) continue;
      visited.add(new URL(url).pathname);
      try {
        await page.goto(url, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(800);
        const screen = await harvest(page, `s${i + 1}`);
        // A screen with nothing to drive is not worth a tool.
        if (screen.elements.length < 2) continue;
        screens.push(screen);
        ctx.log(`Harvested "${screen.title}" (${screen.elements.length} elements)`);
      } catch (err) {
        ctx.log(`Skipped ${url}: ${(err as Error).message.split("\n")[0]}`);
      }
    }

    return { target: ctx.target, capabilities: ctx.capabilities, screens };
  } finally {
    await browser.close();
  }
};

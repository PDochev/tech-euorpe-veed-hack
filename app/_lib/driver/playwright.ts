import { chromium, type Browser, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Credentials, Element, ResultContainer, Screen, Step } from "../types";

/**
 * The deterministic half of Portico.
 *
 * Discovery is agentic; execution is compiled. Nothing in this file calls an
 * LLM — it harvests exact selectors during exploration, and replays recipes
 * against them at tool-call time. That is why a generated tool costs a page
 * load rather than an agent session.
 */

export type Session = { browser: Browser; page: Page };

export async function launch(headless = true): Promise<Session> {
  const browser = await chromium.launch({ headless });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } } as never);
  page.setDefaultTimeout(15_000);
  return { browser, page };
}

/**
 * Best-effort credential login.
 *
 * Deliberately generic rather than OrangeHRM-specific: find the password field,
 * take the text input before it as the username. That heuristic covers the vast
 * majority of legacy admin login forms, which is the whole target market.
 */
export async function login(page: Page, target: string, creds: Credentials): Promise<void> {
  await page.goto(target, { waitUntil: "domcontentloaded" });

  // Legacy admin panels are increasingly SPAs: the form is not in the initial
  // HTML, so waiting for load is not the same as waiting for the form.
  const password = page.locator('input[type="password"]').first();
  try {
    await password.waitFor({ state: "visible", timeout: 10_000 });
  } catch {
    return; // already authenticated, or no login wall
  }

  const username = page
    .locator('input[type="text"], input[type="email"], input:not([type])')
    .first();
  await username.fill(creds.username);
  await password.fill(creds.password);

  const before = page.url();
  await page.locator('button[type="submit"], input[type="submit"]').first().click();
  // Wait for the app to actually move us off the login screen.
  await page.waitForURL((u) => u.toString() !== before, { timeout: 15_000 }).catch(() => {});
  await page.waitForLoadState("networkidle").catch(() => {});
}

/**
 * Browser-side harvest, kept as a plain string on purpose.
 *
 * Bundlers (esbuild via tsx, Next's compiler) rewrite function expressions and
 * inject helpers like `__name` that do not exist inside the page context. A
 * string is immune to that, so this runs identically from a script and from a
 * route handler.
 */
const HARVEST_SCRIPT = `(() => {
  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    const s = window.getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none";
  };

  const esc = (v) => v.replace(/"/g, '\\\\"');

  const selectorFor = (el, tag) => {
    const name = el.getAttribute("name");
    if (name) return tag + '[name="' + esc(name) + '"]';
    const id = el.getAttribute("id");
    // Framework-generated ids (react-select-3-input, :r7:) are not stable.
    if (id && !/^[:.]|\\d{3,}|^(radix|headless|mui|react)-/i.test(id)) return "#" + CSS.escape(id);
    const ph = el.getAttribute("placeholder");
    if (ph) return tag + '[placeholder="' + esc(ph) + '"]';
    const aria = el.getAttribute("aria-label");
    if (aria) return tag + '[aria-label="' + esc(aria) + '"]';
    const href = el.getAttribute("href");
    if (tag === "a" && href) return 'a[href="' + esc(href) + '"]';
    const text = (el.textContent || "").trim().slice(0, 40);
    if (text && (tag === "button" || tag === "a")) return tag + ':has-text("' + esc(text) + '")';
    const siblings = Array.prototype.slice.call(document.querySelectorAll(tag));
    return tag + " >> nth=" + siblings.indexOf(el);
  };

  // The label a human would associate with this control.
  // Component libraries (OrangeHRM's oxd-*, most Tailwind admin kits) rarely use
  // label[for], so walk up a few levels looking for a label-ish sibling.
  const labelFor = (el) => {
    const id = el.getAttribute("id");
    if (id) {
      const forLabel = document.querySelector('label[for="' + CSS.escape(id) + '"]');
      if (forLabel && forLabel.textContent.trim()) return forLabel.textContent.trim();
    }
    const wrapping = el.closest("label");
    if (wrapping && wrapping.textContent.trim()) return wrapping.textContent.trim();

    // Buttons and links name themselves; inheriting a form's label would be wrong.
    const tagName = el.tagName.toLowerCase();
    if (tagName === "button" || tagName === "a") {
      const own = (el.textContent || "").trim();
      if (own) return own.slice(0, 60);
      const ariaOwn = el.getAttribute("aria-label");
      if (ariaOwn) return ariaOwn.slice(0, 60);
    }

    let node = el;
    for (let up = 0; up < 4 && node.parentElement; up++) {
      node = node.parentElement;
      const cand = node.querySelector('label, .oxd-label, [class*="label"]');
      if (cand && !cand.contains(el) && cand.textContent.trim()) {
        return cand.textContent.trim().slice(0, 60);
      }
    }
    return el.getAttribute("aria-label") || el.getAttribute("placeholder") ||
      (el.textContent || "").trim().slice(0, 60);
  };

  // Anchor an otherwise-unaddressable control to its labelled group.
  // "div.oxd-input-group:has-text(\"Employee Name\") >> input" survives a redeploy;
  // "input >> nth=5" survives nothing.
  const scopedSelector = (el, tag, label) => {
    if (!label) return null;
    let node = el;
    for (let up = 0; up < 4 && node.parentElement; up++) {
      node = node.parentElement;
      const cls = (node.getAttribute("class") || "").trim().split(/\\s+/)[0];
      if (!cls || /^[a-z]?\\d/.test(cls)) continue;
      const group = node.tagName.toLowerCase() + "." + CSS.escape(cls);
      if (document.querySelectorAll(group).length > 40) continue; // too generic to mean anything
      return group + ':has-text("' + esc(label.slice(0, 30)) + '") >> ' + tag;
    }
    return null;
  };

  const out = [];
  const seen = {};
  const nodes = document.querySelectorAll("input, select, textarea, button, a[href]");

  Array.prototype.forEach.call(nodes, (el, i) => {
    if (!isVisible(el)) return;
    const tag = el.tagName.toLowerCase();
    const type = el.getAttribute("type") || "";
    if (type === "hidden") return;

    const kind = tag === "select" ? "select"
      : (tag === "button" || type === "submit") ? "button"
      : tag === "a" ? "link" : "input";

    const label = labelFor(el).replace(/\\s+/g, " ").trim();
    let selector = selectorFor(el, tag);
    // A positional selector is a last resort; a labelled group is far more durable.
    if (selector.indexOf(">> nth=") !== -1) {
      selector = scopedSelector(el, tag, label) || selector;
    }
    // Unaddressable and unlabelled: it can never become a usable tool parameter.
    if (!label && selector.indexOf(">> nth=") !== -1) return;
    if (!label && kind === "link") return; // unlabelled links are navigation noise
    if (seen[selector]) return;
    seen[selector] = true;

    const container = el.closest("div,fieldset,form,li");
    out.push({
      id: "e" + i,
      selector: selector,
      kind: kind,
      label: label.replace(/\\s+/g, " ").slice(0, 80),
      nearbyText: ((container && container.textContent) || "").replace(/\\s+/g, " ").trim().slice(0, 200),
      inputType: type || undefined,
    });
  });

  // Repeating regions: the results an agent actually wants returned.
  const containers = [];
  const seenC = {};
  const CANDIDATES = "table, [role='table'], [class*='table-body'], [class*='card-body'], ul, ol, tbody";

  Array.prototype.forEach.call(document.querySelectorAll(CANDIDATES), (el) => {
    if (!isVisible(el)) return;
    // A results region has several structurally similar children.
    const kids = Array.prototype.filter.call(el.children, (c) => isVisible(c));
    if (kids.length < 2) return;
    const shapes = {};
    kids.forEach((k) => { shapes[k.tagName + "." + (k.getAttribute("class") || "")] = 1; });
    if (Object.keys(shapes).length > 2) return; // heterogeneous: a layout, not a result set

    const tag = el.tagName.toLowerCase();
    const cls = (el.getAttribute("class") || "").trim().split(/\\s+/)[0];
    const selector = cls && !/^[a-z]?\\d/.test(cls) ? tag + "." + CSS.escape(cls) : tag;
    if (seenC[selector]) return;
    seenC[selector] = true;

    const text = (el.textContent || "").replace(/\\s+/g, " ").trim();
    if (text.length < 20) return; // empty scaffolding
    containers.push({ selector: selector, preview: text.slice(0, 160), rowCount: kids.length });
  });

  return { elements: out, containers: containers };
})()`;

/**
 * Extract every interactive element on the current page with a durable selector.
 *
 * Selector preference runs most-stable-first (name, id, placeholder, aria-label,
 * accessible text) and only falls back to a positional nth-match when an element
 * offers nothing better. Brittle selectors here become broken tools later, so
 * this ordering matters more than it looks.
 */
export async function harvest(page: Page, screenId: string): Promise<Screen> {
  const url = page.url();
  const title = await page.title();
  const { elements, containers } = (await page.evaluate(HARVEST_SCRIPT)) as {
    elements: Element[];
    containers: ResultContainer[];
  };
  // Biggest result sets first — that is almost always the main records table.
  containers.sort((a, b) => b.rowCount - a.rowCount);

  const dir = join(process.cwd(), "public", "shots");
  await mkdir(dir, { recursive: true });
  await page.screenshot({ path: join(dir, `${screenId}.png`) }).catch(() => {});

  return {
    id: screenId,
    url,
    title,
    screenshot: `/shots/${screenId}.png`,
    elements,
    resultContainers: containers.slice(0, 4),
  };
}

/**
 * Read a result region as structured rows rather than concatenated text.
 *
 * `textContent` on a table yields "0295 99N75 4255TlV0312..." — unusable. Agents
 * need cell boundaries, so pull repeated rows and join their cells explicitly.
 */
const readRowsScript = (sel: string) => `(() => {
  const root = document.querySelector(${JSON.stringify(sel)});
  if (!root) return null;
  let rows = Array.prototype.slice.call(root.querySelectorAll('[class*="row"], tr, li'));
  // Keep only outermost rows; nested matches would duplicate every record.
  rows = rows.filter((r) => !rows.some((o) => o !== r && o.contains(r)));
  if (rows.length === 0) {
    const t = (root.textContent || "").replace(/\\s+/g, " ").trim();
    return t ? [t] : [];
  }
  return rows.map((r) => {
    let cells = Array.prototype.slice.call(r.querySelectorAll('[class*="cell"], td, th'));
    cells = cells.filter((c) => !cells.some((o) => o !== c && o.contains(c)));
    const parts = (cells.length ? cells : [r])
      .map((c) => (c.textContent || "").replace(/\\s+/g, " ").trim())
      .filter(Boolean);
    return parts.join(" | ");
  }).filter(Boolean);
})()`;

/**
 * Many legacy "name" fields are autocompletes that reject free text: you must
 * pick a suggestion or the search silently returns nothing. Filling and moving
 * on is the single most common way a generated tool fails, so handle it here.
 */
async function fillMaybeAutocomplete(page: Page, selector: string, value: string): Promise<void> {
  const field = page.locator(selector).first();
  await field.fill(value);
  await page.waitForTimeout(1200);

  const options = page.locator('[role="option"], .oxd-autocomplete-option, [class*="autocomplete-option"]');
  if ((await options.count()) === 0) return;

  const first = (await options.first().textContent().catch(() => "")) || "";
  // "No Records Found" is a message, not a selectable suggestion.
  if (/no records found|no results/i.test(first)) return;
  await options.first().click().catch(() => {});
  await page.waitForTimeout(400);
}

/**
 * Execute a compiled recipe. This is the MCP tool runtime.
 *
 * `arg` steps pull their value from the caller's arguments; `value` steps carry
 * a literal. A `read` step captures the result region and ends the tool's return.
 */
export async function executeRecipe(
  page: Page,
  recipe: Step[],
  args: Record<string, string>,
): Promise<string> {
  let output: string | null = null;

  for (const step of recipe) {
    const value = step.arg ? (args[step.arg] ?? "") : (step.value ?? "");

    switch (step.action) {
      case "goto":
        await page.goto(step.value || "", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1500); // SPA screens render after load
        break;
      case "fill":
        // Skip optional arguments the caller omitted rather than clearing the field.
        if (step.selector && value) await fillMaybeAutocomplete(page, step.selector, value);
        break;
      case "select":
        if (step.selector && value) await page.locator(step.selector).first().selectOption(value);
        break;
      case "click":
        if (step.selector) await page.locator(step.selector).first().click();
        await page.waitForLoadState("networkidle").catch(() => {});
        break;
      case "wait":
        await page.waitForTimeout(step.ms ?? 1000);
        break;
      case "read": {
        const sel = step.selector || "body";
        const rows = (await page.evaluate(readRowsScript(sel)).catch(() => null)) as
          | string[]
          | null;
        if (rows === null) {
          output = `No element matched the result selector "${sel}".`;
        } else if (rows.length === 0) {
          // An empty results table is a real answer, not a failure.
          const toast = await page
            .locator('.oxd-toast, [class*="toast"], [role="alert"]')
            .first()
            .textContent()
            .catch(() => "");
          output = toast?.trim() ? `No results. App reported: ${toast.replace(/\s+/g, " ").trim()}` : "No results.";
        } else {
          output = rows.join("\n");
        }
        break;
      }
    }
  }

  // Never fall back to dumping the page: that returns stylesheets, not answers.
  return output ?? "Recipe completed with no read step, so there is nothing to return.";
}

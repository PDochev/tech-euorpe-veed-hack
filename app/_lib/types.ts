/**
 * The spine of the pipeline. Every stage consumes and produces these shapes,
 * and every fixture on disk is one of them. Change carefully.
 */

/** A single interactive thing on a page that an agent might want to drive. */
export type Element = {
  id: string;
  /** Playwright-resolvable selector. Must survive a page reload. */
  selector: string;
  kind: "input" | "select" | "button" | "link";
  /** Visible label, or the best available proxy (placeholder, aria-label, text). */
  label: string;
  /** Surrounding text, used as context for semantic classification. */
  nearbyText: string;
  /** For inputs: the underlying HTML input type, when we could read one. */
  inputType?: string;
};

export type Screen = {
  id: string;
  url: string;
  title: string;
  /** Path to a screenshot on disk, relative to the repo root. */
  screenshot?: string;
  elements: Element[];
  /**
   * Repeating result regions (tables, card grids, lists) that a read-style tool
   * can return. Without these, every generated tool returns whole-page text.
   */
  resultContainers: ResultContainer[];
};

/** A region holding repeated records — the payload an agent actually wants back. */
export type ResultContainer = {
  selector: string;
  /** Header text or first-row preview, so the model can tell containers apart. */
  preview: string;
  rowCount: number;
};

/** Something the app can reportedly do, and where. */
export type Capability = {
  name: string;
  description: string;
  url?: string;
  /** Provenance, so the UI can show which partner surfaced this. */
  source: "tavily" | "h" | "crawl";
};

export type SiteMap = {
  target: string;
  capabilities: Capability[];
  screens: Screen[];
};

/** What stage 3 concluded a single element actually is. */
export type Labeled = {
  elementId: string;
  /** Role, e.g. "search_input" | "submit" | "nav" | "create" | "filter". */
  semantic: string;
  /** Entity type the field carries, e.g. "person_name" | "date" | "job_title". */
  entity?: string;
};

/**
 * One step of a compiled recipe.
 *
 * `arg` is the load-bearing field: when set, the value is taken from the tool's
 * named input parameter at call time instead of `value`. That is the whole
 * difference between a parameterized tool and a fixed macro replay.
 */
export type Step = {
  action: "goto" | "fill" | "click" | "select" | "read" | "wait";
  selector?: string;
  /** Literal value (login credentials, fixed filters). */
  value?: string;
  /** Name of the tool input parameter supplying this value. Beats `value`. */
  arg?: string;
  /** For `wait`: milliseconds. */
  ms?: number;
};

/** A JSON Schema object describing a tool's inputs. */
export type JSONSchema = {
  type: "object";
  properties: Record<string, { type: string; description?: string }>;
  required?: string[];
};

export type ToolSpec = {
  /** snake_case, MCP tool naming. */
  name: string;
  description: string;
  inputSchema: JSONSchema;
  recipe: Step[];
  /** Selector whose text/table content is returned to the caller. */
  readSelector?: string;
  /** Screen ids this tool was derived from, for UI provenance. */
  derivedFrom: string[];
};

export type Credentials = { username: string; password: string };

/** Both fields filled — otherwise the target is treated as a public site. */
export function hasCredentials(creds: Credentials): boolean {
  return Boolean(creds.username.trim() && creds.password.trim());
}

/** The pipeline stages, in order. Used for SSE progress events. */
export const STAGES = ["seed", "explore", "understand", "synthesize", "emit"] as const;
export type StageName = (typeof STAGES)[number];

export type StageEvent =
  | { type: "stage:start"; stage: StageName; label: string }
  | { type: "stage:log"; stage: StageName; message: string }
  | { type: "stage:done"; stage: StageName; summary: string; cached: boolean }
  | { type: "stage:error"; stage: StageName; message: string }
  | { type: "result"; siteMap: SiteMap; labels: Labeled[]; tools: ToolSpec[] };

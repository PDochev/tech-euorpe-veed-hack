import OpenAI from "openai";
import type { Labeled, Screen, SiteMap, ToolSpec } from "../types";

/**
 * Stage 4: compile a SiteMap into MCP tools.
 *
 * This is the only place a frontier model is used, and it runs once per target
 * app — not once per tool call. Everything it emits is static data (a JSON
 * Schema and a list of steps), which is what lets the runtime stay LLM-free.
 */

const MODEL = process.env.PORTICO_MODEL ?? "gpt-5.5";

/** Trim a screen to what the model needs. Full DOM would blow the context for nothing. */
function describeScreen(screen: Screen, labels: Map<string, Labeled>): string {
  const lines = screen.elements.map((e) => {
    const l = labels.get(`${screen.id}:${e.id}`);
    const role = l ? ` role=${l.semantic}${l.entity ? ` entity=${l.entity}` : ""}` : "";
    return `  - [${e.kind}] "${e.label}"${role}\n    selector: ${e.selector}`;
  });
  const containers = screen.resultContainers.length
    ? `\n  result containers (use one as readSelector):\n` +
      screen.resultContainers
        .map((c) => `    ${c.selector}  (${c.rowCount} rows) — ${c.preview.slice(0, 90)}`)
        .join("\n")
    : "";
  return `### ${screen.id} — ${screen.title}\nURL: ${screen.url}\n${lines.join("\n")}${containers}`;
}

const SYSTEM = `You compile web UIs into MCP tools.

You are given screens from an app that has no API, each with exactly-resolvable
Playwright selectors. Produce tools an AI agent would actually want to call.

Hard rules:
- Only ever use selectors verbatim from the input. Never invent one.
- Every tool must start with a "goto" step whose value is the screen's full URL.
- Parameterise properly: a step that fills a user-supplied value MUST set "arg"
  (the input-schema property name) and MUST NOT set "value". Steps that fill a
  fixed value use "value". A tool with no arg-bound steps is a macro, not a tool
  — prefer tools that take arguments.
- After a step that submits or navigates, add a "wait" step (ms: 2000).
- End read-style tools with a "read" step, and set BOTH that step's selector and
  the tool's "readSelector" to one of the screen's listed result containers.
  Pick the container that holds the records the tool searches for. Never leave
  readSelector null when the screen lists any container — a tool that returns the
  whole page instead of its result set is close to useless to an agent.
- Prefer safe read/search/list tools. Do NOT generate tools that delete records.
- name: snake_case verb_noun, e.g. search_employees, list_job_candidates.
- description: one line saying what an agent gets, written for a tool catalogue.

Return 4-8 of the most useful tools across all screens.`;

export async function synthesize(
  siteMap: SiteMap,
  labels: Labeled[],
  log: (m: string) => void,
): Promise<ToolSpec[]> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const byId = new Map(labels.map((l) => [l.elementId, l]));

  // Screens with almost nothing to drive produce junk tools; skip them.
  const useful = siteMap.screens.filter((s) => s.elements.length >= 3);
  const capabilities = siteMap.capabilities.length
    ? `\nKnown capabilities of this app (from its documentation):\n` +
      siteMap.capabilities.map((c) => `- ${c.name}: ${c.description}`).join("\n")
    : "";

  log(`Compiling ${useful.length} screens with ${MODEL}`);

  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content: `App: ${siteMap.target}${capabilities}\n\n${useful
          .map((s) => describeScreen(s, byId))
          .join("\n\n")}`,
      },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "tool_set",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["tools"],
          properties: {
            tools: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["name", "description", "parameters", "recipe", "readSelector", "derivedFrom"],
                properties: {
                  name: { type: "string" },
                  description: { type: "string" },
                  parameters: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["name", "type", "description", "required"],
                      properties: {
                        name: { type: "string" },
                        type: { type: "string", enum: ["string", "number"] },
                        description: { type: "string" },
                        required: { type: "boolean" },
                      },
                    },
                  },
                  recipe: {
                    type: "array",
                    items: {
                      type: "object",
                      additionalProperties: false,
                      required: ["action", "selector", "value", "arg", "ms"],
                      properties: {
                        action: {
                          type: "string",
                          enum: ["goto", "fill", "click", "select", "read", "wait"],
                        },
                        selector: { type: ["string", "null"] },
                        value: { type: ["string", "null"] },
                        arg: { type: ["string", "null"] },
                        ms: { type: ["number", "null"] },
                      },
                    },
                  },
                  readSelector: { type: ["string", "null"] },
                  derivedFrom: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
        },
      },
    },
  });

  const raw = JSON.parse(response.choices[0].message.content ?? '{"tools":[]}');

  type RawParam = { name: string; type: string; description: string; required: boolean };
  type RawTool = {
    name: string;
    description: string;
    parameters: RawParam[];
    recipe: { action: string; selector: string | null; value: string | null; arg: string | null; ms: number | null }[];
    readSelector: string | null;
    derivedFrom: string[];
  };

  const tools: ToolSpec[] = (raw.tools as RawTool[]).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: {
      type: "object" as const,
      properties: Object.fromEntries(
        t.parameters.map((p) => [p.name, { type: p.type, description: p.description }]),
      ),
      required: t.parameters.filter((p) => p.required).map((p) => p.name),
    },
    // Strip the nulls the strict schema forced us to ask for.
    recipe: t.recipe.map((s) => ({
      action: s.action as ToolSpec["recipe"][number]["action"],
      ...(s.selector ? { selector: s.selector } : {}),
      ...(s.value ? { value: s.value } : {}),
      ...(s.arg ? { arg: s.arg } : {}),
      ...(s.ms ? { ms: s.ms } : {}),
    })),
    ...(t.readSelector ? { readSelector: t.readSelector } : {}),
    derivedFrom: t.derivedFrom,
  }));

  log(`Compiled ${tools.length} tools: ${tools.map((t) => t.name).join(", ")}`);
  return tools;
}

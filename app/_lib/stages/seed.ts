import { tavily } from "@tavily/core";
import OpenAI from "openai";
import type { Capability } from "../types";

/**
 * Stage 1: find out what the app is supposed to do before we open it.
 *
 * A blind crawl only discovers what is linked from the landing page. Public
 * documentation names features by their real-world task ("assign leave",
 * "shortlist a candidate"), which gives the explorer goals and gives the
 * synthesiser vocabulary for tool descriptions that read like a product, not
 * like a DOM dump.
 */

const MODEL = process.env.PORTICO_SEED_MODEL ?? "gpt-5.4-mini";

/** "https://opensource-demo.orangehrmlive.com" -> "orangehrmlive" */
function appNameFrom(target: string): string {
  const host = new URL(target).hostname.replace(/^www\./, "");
  const parts = host.split(".");
  return parts.length > 2 ? parts[parts.length - 2] : parts[0];
}

export async function seed(target: string, log: (m: string) => void): Promise<Capability[]> {
  const name = appNameFrom(target);
  const client = tavily({ apiKey: process.env.TAVILY_API_KEY! });

  log(`Researching "${name}" documentation`);
  const results = await client.search(`${name} user guide features admin modules`, {
    maxResults: 5,
    searchDepth: "advanced",
    includeAnswer: true,
  });

  log(`Found ${results.results.length} documentation sources`);

  // Tavily's own answer plus result snippets is plenty of context; a full
  // extract of every page costs credits and latency we do not need here.
  const context = [
    results.answer ?? "",
    ...results.results.map((r) => `${r.title}: ${r.content.slice(0, 600)}`),
  ].join("\n\n");

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content:
          "Extract the concrete things a user can DO in this application. " +
          "Each capability must be a discrete task an agent could be asked to perform " +
          '(e.g. "search employees by name"), not a marketing feature or a module name. ' +
          "Return 5-10 capabilities.",
      },
      { role: "user", content: context.slice(0, 12_000) },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "capabilities",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          required: ["capabilities"],
          properties: {
            capabilities: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                required: ["name", "description"],
                properties: { name: { type: "string" }, description: { type: "string" } },
              },
            },
          },
        },
      },
    },
  });

  const parsed = JSON.parse(response.choices[0].message.content ?? '{"capabilities":[]}');
  const capabilities: Capability[] = parsed.capabilities.map(
    (c: { name: string; description: string }) => ({ ...c, source: "tavily" as const }),
  );

  log(`Distilled ${capabilities.length} capabilities`);
  return capabilities;
}

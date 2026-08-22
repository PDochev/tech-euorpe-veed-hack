import { HaiAgentsClient } from "hai-agents";
import { z } from "zod";
import { isSameOrigin } from "./explore";
import { hasCredentials, type Capability, type Credentials } from "../types";

/**
 * Stage 2a: send a computer-use agent in to find out what this app can do.
 *
 * A link crawl only finds what is linked from the landing page, and it cannot
 * tell a records screen from a settings page. An agent that can actually look at
 * the UI can — so h decides *where the value is*, and Playwright then extracts
 * exact selectors from those URLs. h never supplies a selector: prose cannot be
 * replayed deterministically, and a hallucinated selector is a broken tool.
 */

const AGENT = process.env.PORTICO_H_AGENT ?? "h/web-surfer-flash";

const ScoutAnswer = z.object({
  capabilities: z
    .array(
      z.object({
        name: z.string().describe("Short task name, e.g. 'search employees by name'"),
        description: z.string().describe("What an agent accomplishes with it"),
        url: z.string().describe("Full URL of the screen where this is done"),
      }),
    )
    .describe("The most useful record-searching or record-listing screens found"),
});

export async function hScout(
  target: string,
  creds: Credentials,
  hints: Capability[],
  log: (m: string) => void,
): Promise<Capability[]> {
  const client = new HaiAgentsClient({ apiKey: process.env.HAI_API_KEY });

  const hintText = hints.length
    ? `\n\nIts documentation suggests it can do things like:\n${hints
        .map((h) => `- ${h.name}`)
        .join("\n")}\nUse these as leads, but only report what you actually see.`
    : "";

  const auth = hasCredentials(creds)
    ? `Go to ${target} and sign in with username "${creds.username}" and password "${creds.password}".`
    : `Go to ${target}. There is no login — this is a public site. Do not click Sign up or Log in.`;

  const prompt = `${auth}

Then explore the site and identify the most useful screens an agent would want tools for
(search, browse, filter, list records, or the main interactive surfaces).

For each one, report the exact full URL of that screen, taken from the address bar.
Stay on this origin. Do not modify, create, or delete any data — only look.
Report at most 8 screens, best first.${hintText}`;

  log(`Dispatching ${AGENT} to explore ${target}`);

  const result = await client.runSession({
    agent: AGENT,
    messages: prompt,
    answerSchema: ScoutAnswer,
    // A scout that has not finished in 8 minutes has already cost more than the
    // crawl fallback is worth.
    timeoutMs: 8 * 60_000,
  });

  const found = result.answer?.capabilities ?? [];
  log(`h reported ${found.length} capability screens`);

  // An agent sent to an app that has no record screens can come back with a
  // different app's URLs. Anything off-origin is discarded here rather than
  // being crawled and compiled into tools for the wrong application.
  const origin = new URL(target).origin;
  const onTarget = found.filter((c) => isSameOrigin(c.url, origin));
  if (onTarget.length < found.length) {
    log(`Discarded ${found.length - onTarget.length} screens outside ${origin}`);
  }

  return onTarget.map((c) => ({ ...c, source: "h" as const }));
}

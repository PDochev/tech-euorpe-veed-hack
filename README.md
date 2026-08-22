# Portico

**Compiles a web app that has no API into an MCP server.**

Point Portico at a URL (abd login credentials if needed). It explores the app, works out
what each control does, and writes a standalone MCP server with typed tools that any agent can call.

- Discovery is agentic and happens once.
- Execution is a compiled Playwright recipe with no model in the loop.

---

## 1. What it solves

A great deal of working software has no API you can use. Internal admin panels, council portals,
twenty-year-old HR systems: the data is right there on screen and completely unreachable by an
agent. And where an API does exist, it is often not one you can get at — wrong tier, no credentials,
or a procurement conversation you are not going to win today.

Today there are two options, and both are bad. Either the task goes unautomated, or the agent burns
a computer-use session on _every single call_: it opens a browser, squints at the page, and clicks
around, spending seconds and cents to answer "what is Linda Anderson's employee ID?" Ask the same
question twice and you pay twice.

Portico makes it a compile step. You pay an agent **once** to understand the app, and from then on
the same question is one typed MCP tool call — a page load and three DOM actions, no model, no
reasoning, no drift. On the OrangeHRM demo below, that call returns a structured record in **about
11 seconds** and costs nothing but the page load.

## 2. The thesis

> **Discovery is agentic. Execution is compiled.**

This is the whole idea, and everything in the repo follows from it.

Understanding an unfamiliar UI genuinely needs intelligence — reading a screen, telling a records
table from a settings pane, knowing that "Employee Name" is a person and "Sub Unit" is a filter.
That is a job for an agent, and it is worth paying real money for.

_Replaying_ a known interaction needs no intelligence at all. Once you know the URL, the selector
and the field, calling the tool is a script. Every model call at execution time is latency, cost
and a chance to hallucinate.

So Portico puts all the intelligence in the compiler and none in the runtime. The generated MCP
server (`mcp-server/server.mts`) contains no LLM calls whatsoever — grep it and see.

## 3. Demo

**Video:** [2-minute walkthrough](https://www.loom.com/share/0fb52888f1dd4192bfedf354c985cc7b)

The walkthrough above is a real run against the [OrangeHRM public
demo](https://opensource-demo.orangehrmlive.com) (`Admin` / `admin123`) — their hosted sandbox of
OrangeHRM OS, a real HR product with no public API. From one URL and a password, Portico compiles
typed tools against the live screens (users, employees, directory, job titles, pay grades, skills).

Credentials are optional.

Verified end to end:

```
$ npx tsx scripts/run-tool.ts search_system_users username=Admin

Calling search_system_users({"username":"Admin"})

--- returned ---
Admin | Admin | Emp_qBPmlQ User_hrEPXuHM | Enabled
```

That same call takes ~11 s from the console's **run** button, and returns the same record over MCP
`tools/call` through the generated server.

## 4. How it works

```
  Tavily          h + Playwright     rule table           OpenAI            MCP SDK
    │                    │                 │                 │                 │
  ┌─▼──────┐   ┌─────────▼───────┐   ┌─────▼──────┐   ┌──────▼─────┐   ┌───────▼──────┐
  │ 1 seed │──▶│   2 explore     │──▶│3 understand│──▶│4 synthesize│──▶│   5 emit     │
  └────────┘   └─────────────────┘   └────────────┘   └────────────┘   └──────────────┘
  Capability[]     SiteMap            Labeled[]         ToolSpec[]       server.mts
  what the app     screens, exact     what each         typed tools +    a runnable
  claims to do     selectors          control *is*      step recipes     MCP server
```

Every stage is cached to `fixtures/<slug>/<stage>.json`, so iterating on stage 4 never re-runs the
browser crawl — and `REPLAY=1` runs the whole pipeline from disk with no network at all.

### Stage 1 — seed (`app/_lib/stages/seed.ts`)

**In:** a URL. **Out:** `Capability[]`. **Powered by:** Tavily search + OpenAI structured outputs.

A blind crawl only ever discovers what is linked from the landing page. Public documentation names
features the way _humans_ do — "assign leave", "shortlist a candidate" — which gives the explorer
goals to aim at and gives the compiler vocabulary for tool descriptions that read like a product
rather than a DOM dump. Tavily returned 10 documented capabilities for OrangeHRM.

### Stage 2 — explore (`app/_lib/stages/h-scout.ts` + `explore.ts`)

**In:** capabilities + credentials. **Out:** `SiteMap`. **Powered by:** h computer-use agent, then
Playwright.

The split here is the most important design decision in the project. h's `web-surfer-flash` agent
logs in and _looks at_ the app, returning the URLs of the screens where records actually live — via
a Zod `answerSchema`, so the answer is structured, not prose. It found 8, including **Job Titles**,
**Pay Grades**, **Organization Structure** and **Skills** — four Admin screens the blind link crawl
never reached.

h is never asked for a selector. Prose cannot be replayed deterministically and a hallucinated
selector is a broken tool. Instead Playwright visits h's URLs and harvests exact,
reload-survivable selectors — plus a screenshot and the repeating result containers (tables, card
grids) that a read tool can return. 9 screens, 180 controls, 0 positional selectors.

If h is slow or unavailable, the pure-Playwright BFS crawl stands in and the pipeline continues.

### Stage 3 — understand (`app/_lib/stages/understand.ts`)

**In:** `SiteMap`. **Out:** `Labeled[]`. **Powered by:** a deterministic rule table.

Every one of those 180 controls needs a verdict: is this a search input, a filter, a submit, a nav
link, a create button, something destructive? And if it takes a value, what kind — a person, a
date, an identifier? Stage 4 cannot write `search_employees_by_name(employee_name)` without knowing
which input is the search box and what it holds.

This is the one stage with **no model in it, by choice.** It is the highest-volume step in the
pipeline — 180 verdicts for this one app, one per control — and the judgment each one needs is
shallow: "Delete" is destructive, a `<select>` narrows a result set, a field labelled "Employee
Name" holds a person. Sending that to a frontier model would add hundreds of calls to every compile
to answer questions a rule table answers in microseconds, and answers the _same way every run_.
That reproducibility is the point: recompiling an app twice yields the same tools.

The honest cost of that choice is that the rules read English label text, which is the main thing
standing between this and "works on any admin panel". See §9.

### Stage 4 — synthesize (`app/_lib/stages/synthesize.ts`)

**In:** `SiteMap` + `Labeled[]`. **Out:** `ToolSpec[]`. **Powered by:** OpenAI structured outputs.

This is the one genuinely hard reasoning step, and it gets the frontier model. Given the screens,
the labelled controls and the documented capabilities, it emits tools with a JSON Schema and a step
recipe. The load-bearing field is `Step.arg`: when set, that step takes its value from a named tool
parameter at call time instead of a literal. That is the difference between a parameterized tool and
a fixed macro. Search tools are parameterized; list tools are macros that open a known screen and
read its table.

### Stage 5 — emit (`app/_lib/mcp/emit.ts`)

**In:** `ToolSpec[]`. **Out:** `mcp-server/server.mts` + `tools.json` + a paste-ready config.
**Powered by:** `@modelcontextprotocol/sdk`.

The emitted server is standalone and contains no model calls. It shares one runtime with the web UI
(`app/_lib/driver/run.ts`), so what you test in the console is exactly what an agent gets.

## 5. Partner technologies

| Partner    | Where                                      | What it does                                                                                |
| ---------- | ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| **Tavily** | `app/_lib/stages/seed.ts`                  | Finds public docs for the target app and distils them into task-shaped capabilities         |
| **h**      | `app/_lib/stages/h-scout.ts`               | Computer-use agent logs in, looks at the app, returns the URLs of screens that hold records |
| **OpenAI** | `app/_lib/stages/seed.ts`, `synthesize.ts` | Distils capabilities; compiles screens + labels into typed tools with step recipes          |

Playwright is the deterministic runtime underneath all of it (`app/_lib/driver/`), and
`@modelcontextprotocol/sdk` writes the output.

### APIs, frameworks, and tools

| Name                                                                     | Role                                      | Where                                           |
| ------------------------------------------------------------------------ | ----------------------------------------- | ----------------------------------------------- |
| [Next.js](https://nextjs.org) 16 (App Router, React 19)                  | Console UI and API routes                 | `app/`                                          |
| TypeScript (strict)                                                      | Whole project                             | `tsconfig.json`                                 |
| Tailwind CSS v4                                                          | Design tokens and layout                  | `app/globals.css`                               |
| [Playwright](https://playwright.dev)                                     | Login, selector harvest, recipe execution | `app/_lib/driver/playwright.ts`                 |
| [OpenAI API](https://platform.openai.com) (`gpt-5.5` by default)         | Distil docs; synthesize `ToolSpec[]`      | `app/_lib/stages/seed.ts`, `synthesize.ts`      |
| [Tavily Search API](https://tavily.com)                                  | Public-docs seed                          | `app/_lib/stages/seed.ts`                       |
| [h / hai-agents](https://hub.hcompany.ai/computer-use-agents/quickstart) | Computer-use scout                        | `app/_lib/stages/h-scout.ts`                    |
| [Zod](https://zod.dev) v4                                                | Structured `answerSchema` for h           | `app/_lib/stages/h-scout.ts`                    |
| [@modelcontextprotocol/sdk](https://modelcontextprotocol.io)             | Generated MCP server                      | `app/_lib/mcp/emit.ts`, `mcp-server/server.mts` |
| `tsx`                                                                    | Run the generated server and CLI scripts  | `package.json`, `scripts/`                      |

The generated MCP server speaks stdio MCP: `tools/list` and `tools/call`. It reads
`mcp-server/tools.json` and executes the same `runTool` the console uses.

## 6. Setup

**Prerequisites:** Node 20+, npm, and a machine that can run Chromium.

```bash
npm install
npx playwright install chromium
```

Create `.env.local` in the repo root:

```bash
# OpenAI — capability distillation (stage 1) and tool synthesis (stage 4).
# https://platform.openai.com/api-keys
OPENAI_API_KEY=sk-...

# Tavily — documentation search (stage 1). https://tavily.com
TAVILY_API_KEY=tvly-...

# h — the computer-use scout (stage 2). https://hub.hcompany.ai
HAI_API_KEY=...
```

Stage 3 needs no key — it is the deterministic one.

Then:

```bash
npm run dev     # http://localhost:3000
```

Paste a URL into the console and press **compile**. Username and password are optional — leave
them empty for a public site. The OrangeHRM sandbox
(`https://opensource-demo.orangehrmlive.com`, `Admin` / `admin123`) is pre-filled.

### Running with no API keys at all

```bash
REPLAY=1 npm run dev                    # the console, served from fixtures
REPLAY=1 npx tsx scripts/compile.ts     # the same pipeline, headless
```

Replay mode serves every stage from the committed fixtures in `fixtures/`, with realistic pacing
and no network calls:

```
[seed]        ✓ 10 documented capabilities (cached)
[explore]     ✓ 9 screens, 180 elements (cached)
[understand]  ✓ 180 elements labelled (cached)
[synthesize]  ✓ 7 tools compiled (cached)
[emit]        ✓ 7 tools -> mcp-server/server.mts
```

## 7. Using the generated MCP server

Compile writes three files under `mcp-server/`:

| File                     | What it is                                                       |
| ------------------------ | ---------------------------------------------------------------- |
| `server.mts`             | The MCP server. Speaks stdio. Contains **no LLM calls**.         |
| `tools.json`             | The compiled catalogue: names, JSON Schemas, Playwright recipes. |
| `claude_mcp_config.json` | A paste-ready block with the **absolute path** on this machine.  |

The console's **copy** button is a template. The `<repo>` token is not a path — replace it, or use `claude_mcp_config.json` which already has yours.

### What the JSON means

```json
{
  "mcpServers": {
    "portico": {
      "command": "npx",
      "args": [
        "tsx",
        "/ABSOLUTE/PATH/TO/tech-euorpe-veed-hack/mcp-server/server.mts"
      ],
      "env": {
        "PORTICO_USERNAME": "Admin",
        "PORTICO_PASSWORD": "admin123"
      }
    }
  }
}
```

- **`portico`** — the name the agent sees. Any string is fine.
- **`command` / `args`** — the client starts this process and talks to it over stdin/stdout. `npx tsx` runs the TypeScript file; Node 20+ and a network fetch of `tsx` on first run are required (or `npm install` in the repo so `tsx` is local).
- **The path must be absolute.** `~/Projects/...` and `./mcp-server/server.mts` both fail in most MCP clients.
- **`env`** — username/password the server uses when a tool logs into the target. OrangeHRM needs this.
- The server also reads `tools.json` next to `server.mts` and launches Chromium via Playwright, so `npx playwright install chromium` must already have been run.

### Claude Code

From the repo root, after a compile:

```bash
claude mcp add portico -- npx tsx "$(pwd)/mcp-server/server.mts"
```

To pass OrangeHRM credentials:

```bash
claude mcp add portico --env PORTICO_USERNAME=Admin --env PORTICO_PASSWORD=admin123 -- npx tsx "$(pwd)/mcp-server/server.mts"
```

Restart the Claude Code session (or `/mcp`) so it picks the server up. Then:

> Search OrangeHRM system users for username Admin.

The agent should call `search_system_users` with `{ "username": "Admin" }`. A live row comes back in about 11 seconds. Follow-ups like “list the configured skills” hit `list_skills` with no arguments.

Check it is attached: `claude mcp list`.

### Cursor

1. Open **Cursor Settings → MCP** (or edit `~/.cursor/mcp.json`).
2. Merge the `mcpServers` object from `mcp-server/claude_mcp_config.json`.
3. Add the `env` block if the target needs a login.
4. Save. Cursor shows the server as connected; if it errors, the path is usually still relative.

Project-local alternative: a `.cursor/mcp.json` in this repo with the same shape.

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS (or the equivalent on Windows/Linux). Paste the same `mcpServers` object, restart Claude Desktop.

### Example calls

Once the server is connected, these are the OrangeHRM tools from a recent compile:

```jsonc
{ "name": "search_system_users", "arguments": { "username": "Admin" } }
{ "name": "search_employees_by_id", "arguments": { "employee_id": "0001" } }
{ "name": "search_directory_by_employee_name", "arguments": { "employee_name": "Admin" } }
{ "name": "search_navigation_menu", "arguments": { "query": "PIM" } }
{ "name": "list_job_titles", "arguments": {} }
{ "name": "list_pay_grades", "arguments": {} }
{ "name": "list_skills", "arguments": {} }
```

Wire format the client sends:

```jsonc
// tools/call
{ "name": "search_system_users", "arguments": { "username": "Admin" } }

// result — a real row from the live OrangeHRM sandbox
{ "content": [{ "type": "text",
  "text": "Admin | Admin | Emp_qBPmlQ User_hrEPXuHM | Enabled" }] }
```

(The sandbox is public; employee names get overwritten. The shape of the row does not change.)

You can also call a tool without an agent:

```bash
npx tsx scripts/run-tool.ts search_system_users username=Admin
```

(`scripts/run-tool.ts` currently targets OrangeHRM. Set `TARGET` if you compiled a different site.)

### If it does not start

- **`npx tsx` not found** — run `npm install` in this repo.
- **Playwright browser missing** — `npx playwright install chromium`.
- **Login fails / empty tables** — `PORTICO_USERNAME` / `PORTICO_PASSWORD` not set, or the sandbox password changed.
- **Cookie wall on a public site** — the runtime dismisses common banners; a new overlay still needs a recompile or a driver tweak.
- **Stale tools** — compile again; `server.mts` and `tools.json` are overwritten.

Recompiling can change the tool set — synthesis is not frozen. A recent OrangeHRM compile produced the seven names listed above.

## 8. Limitations and what's next

Where this is honestly weak:

- **Selectors are brittle against redesigns.** They survive reloads and pagination, not a complete redesign. Recompiling is cheap, but nothing currently _detects_ that a tool has gone stale — a
  health check that replays each recipe and flags empty reads is the obvious next step.
- **No write-tool safety rails.** The compiler can describe `destructive` controls but there is no
  confirmation step, dry-run or audit log, so we deliberately kept the demo to read and search
  tools. Writes need a human-in-the-loop gate before they should exist at all.
- **Auth is username/password or none.** Public sites compile with empty credentials. There is no
  SSO, MFA, or session reuse; when a login is needed, credentials are passed to the generated
  server via environment variables.
- **Stage 3's rules read English.** Classifying controls by label text is fast, free and
  reproducible, but it is monolingual and it inherits whatever vocabulary the app uses — a German
  admin panel, or one that labels its search box "Lookup", degrades to `other` and produces flatter
  tools. The stage is one function (`classify` in `understand.ts`) behind a stable
  `SiteMap -> Labeled[]` signature, so swapping in a small classifier is a contained change; the
  reason to want one is coverage, not accuracy on English apps.
- **It assumes the target is a record-oriented app.** Pointed at a marketing site, stage 1 returns
  generic admin capabilities, and the scout — primed to look for record screens that do not exist —
  can answer with a different application's URLs. Off-origin hints are now discarded in
  `h-scout.ts` and again in `explore.ts`, so the worst case is a thin site map rather than tools
  compiled against the wrong app. Recognising "this app has no records" and saying so is not built.
- **The read heuristic favours tables.** Apps that render records as prose or canvas will produce
  tools that return page text rather than structured rows.
- **Local only.** The generated MCP server runs over stdio on the machine that compiled it.

---

Built at Tech: Europe Hackathon, London.

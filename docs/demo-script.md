# Demo script — 2-minute submission video

Working notes, not part of the judged README. Target **1:50**, hard cap 2:00.

Timings below assume ~2.5 spoken words/second. Every narration block is written to fit its slot;
if you ad-lib you will overrun, because there is no slack left in the budget.

---

## Pre-flight (do all of this before you hit record)

- [ ] `npm run dev` already running, page loaded once so fonts are warm.
- [ ] **Compile OrangeHRM before recording.** A cold explore takes minutes and will blow the clock.
      Verify: `ls fixtures/opensource-demo-orangehrmlive-com/` shows all four stage files.
- [ ] Confirm the sandbox is up and the tools still return rows:
      `npx tsx scripts/run-tool.ts list_skills` — if this fails, the demo fails.
- [ ] Browser at 1440×900, zoom 100%, bookmarks bar hidden, no other tabs.
- [ ] Console scrolled to top, form pre-filled with the OrangeHRM URL / `Admin` / `admin123`.
- [ ] A second terminal open at the repo root for the grep beat (§1:30).
- [ ] Pre-record the Claude Code cutaway (see §1:30) so it costs no live risk.

**Measured call times — do not promise a number you cannot hit.**
`list_skills` ≈ 8s, `search_system_users` ≈ 11s from the console button. Two live calls is ~19
seconds of waiting inside a two-minute video, which is why only two are in the script and why the
narration is written to cover the spinners rather than pause for them.

---

## 0:00–0:18 · The problem

_On screen: the idle console. Do not touch anything._

> Most software has no API. Internal admin panels, council portals, twenty-year-old HR systems —
> the data is on screen and unreachable. An agent either can't do the task, or burns a computer-use
> session on every single call.

_(~44 words)_

## 0:18–0:26 · The claim

> Portico makes it a compile step. Discovery is agentic and happens once. Execution is a compiled
> script with no model in it.

_(~22 words. This is the thesis — say it slowly and let it land.)_

## 0:26–0:50 · Compile

_Press **compile** immediately as you start talking. The rail animates while you narrate — do not
wait for it, and do not read all five stages aloud._

> Tavily reads the app's public docs to find out what it claims to do. Then a computer-use agent
> from h logs in and finds the screens where records actually live — it found two the link crawler
> missed. Playwright follows it and harvests exact selectors. h is never asked for a selector,
> because a hallucinated selector is a broken tool. Then one OpenAI call compiles all of that into
> typed tools.

_(~58 words. Point at each lamp as it lights.)_

## 0:50–1:12 · First call — `list_skills`

_Scroll to **Compiled tools**. Take `list_skills` first: no typing, and it's the faster call._

Press **run**, then talk over the ~8s wait:

> That's not a fixture and it's not an agent. It's a page load and three DOM actions against the
> live sandbox.

_Rows appear (`Java | Programming Language`, etc.)._

> Nothing in that call reasoned about anything.

_(~34 words)_

## 1:12–1:32 · Second call — `search_system_users`

_Type `Admin`, press **run**. ~11 seconds — the longest wait in the video, so this narration has to
carry it._

> This one takes a parameter. When the compiler wrote this tool it bound the username field to a
> typed argument, so it's a real function, not a recorded macro. Ask it again tomorrow and you pay
> the page load again — never another model call.

_Row appears. **Do not read the name aloud** — the public sandbox gets overwritten constantly and
it will not match what you rehearsed. Say "a live row" instead._

_(~48 words)_

## 1:32–1:44 · It's a real MCP server

_Cut to the terminal. Run this — it is the strongest claim in the project and it takes 3 seconds:_

```bash
grep -ci "openai\|anthropic\|llm" mcp-server/server.mts   # 0
```

> The generated server has zero model calls in it. All the intelligence was spent at compile time.

_Cut to the pre-recorded Claude Code clip: the agent calling `search_system_users` and getting the
row back._

> And it's a standard MCP server, so any agent can call it.

_(~30 words)_

## 1:44–1:52 · Close

> Discovery once. Execution forever.

_Stop talking. Do not narrate over the end card._

---

## Contingencies

**Compile looks slow on camera.** Cut, run `REPLAY=1 npm run dev`, and record the rail from
fixtures with no network at all. Then cut to a pre-recorded live **run**. Judges care that the tool
hits the real OrangeHRM, not that explore ran cold in the same take.

**A tool returns "No results."** The sandbox data churns. `list_skills` and `list_job_titles` take
no arguments and are the most stable — fall back to those. Never debug on camera.

**The sandbox is down entirely.** Record fully in `REPLAY=1` and say plainly that it is a replay.
An honest replay beats a broken live demo.

**You overrun.** Cut §0:18–0:26 (the claim) first — it is restated in the close. Cut the Claude
Code cutaway second. Never cut the grep beat; it is 3 seconds and it is the proof.

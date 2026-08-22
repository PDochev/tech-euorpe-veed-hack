"use client";

import { useState } from "react";
import { LogStream, type LogLine } from "./_components/LogStream";
import { PipelineRail, type StageState } from "./_components/PipelineRail";
import { ScreenModal } from "./_components/ScreenModal";
import { ToolCard } from "./_components/ToolCard";
import type {
  Screen,
  SiteMap,
  StageEvent,
  StageName,
  ToolSpec,
} from "./_lib/types";

/** Pluralise a count: 1 control, 2 controls. */
function count(n: number, singular: string, plural = `${singular}s`): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

const IDLE: Record<StageName, StageState> = {
  seed: { status: "idle", label: "Read the app's documentation" },
  explore: { status: "idle", label: "Scout the app and harvest selectors" },
  understand: { status: "idle", label: "Classify every control" },
  synthesize: { status: "idle", label: "Compile screens into typed tools" },
  emit: { status: "idle", label: "Write a runnable MCP server" },
};

type RunResult = { output?: string; error?: string; ms?: number };

const DEMO_TARGET = "https://opensource-demo.orangehrmlive.com";
const isDemoTarget = (url: string) =>
  url.includes("opensource-demo.orangehrmlive.com");

export default function Console() {
  const [target, setTarget] = useState(DEMO_TARGET);
  const [username, setUsername] = useState("Admin");
  const [password, setPassword] = useState("admin123");

  function onTargetChange(url: string) {
    setTarget(url);
    // Demo creds belong to OrangeHRM only. Leaving them on a public site
    // would send the scout looking for a login that does not exist.
    if (!isDemoTarget(url) && username === "Admin" && password === "admin123") {
      setUsername("");
      setPassword("");
    }
    if (isDemoTarget(url) && !username && !password) {
      setUsername("Admin");
      setPassword("admin123");
    }
  }

  const [states, setStates] = useState<Record<StageName, StageState>>(IDLE);
  const [lines, setLines] = useState<LogLine[]>([]);
  const [compiling, setCompiling] = useState(false);
  const [siteMap, setSiteMap] = useState<SiteMap | null>(null);
  const [tools, setTools] = useState<ToolSpec[]>([]);
  const [serverPath, setServerPath] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, RunResult>>({});
  const [runningTool, setRunningTool] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState<Screen | null>(null);

  async function compile() {
    setCompiling(true);
    setStates(IDLE);
    setLines([]);
    setTools([]);
    setServerPath(null);
    setSiteMap(null);
    setResults({});

    const res = await fetch("/api/compile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ target, username, password }),
    });

    // Parse the SSE stream by hand: EventSource cannot issue a POST.
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";

      for (const chunk of chunks) {
        if (!chunk.startsWith("data: ")) continue;
        const event = JSON.parse(chunk.slice(6)) as StageEvent;

        if (event.type === "result") {
          setSiteMap(event.siteMap);
          setTools(event.tools);
          setServerPath(event.serverPath);
          continue;
        }

        const { stage } = event;
        if (event.type === "stage:start") {
          setStates((s) => ({
            ...s,
            [stage]: { status: "run", label: event.label },
          }));
        } else if (event.type === "stage:log") {
          setLines((l) => [
            ...l,
            { stage, message: event.message, kind: "log" },
          ]);
        } else if (event.type === "stage:done") {
          setStates((s) => ({
            ...s,
            [stage]: {
              ...s[stage],
              status: "done",
              summary: event.summary,
              cached: event.cached,
            },
          }));
          setLines((l) => [
            ...l,
            { stage, message: event.summary, kind: "done" },
          ]);
        } else if (event.type === "stage:error") {
          setStates((s) => ({
            ...s,
            [stage]: { ...s[stage], status: "error" },
          }));
          setLines((l) => [
            ...l,
            { stage, message: event.message, kind: "error" },
          ]);
        }
      }
    }

    setCompiling(false);
  }

  async function runTool(tool: ToolSpec, args: Record<string, string>) {
    setRunningTool(tool.name);
    setResults((r) => ({ ...r, [tool.name]: {} }));
    try {
      const res = await fetch("/api/run-tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          username,
          password,
          tool: tool.name,
          args,
        }),
      });
      const payload = (await res.json()) as RunResult;
      setResults((r) => ({ ...r, [tool.name]: payload }));
    } catch (err) {
      setResults((r) => ({
        ...r,
        [tool.name]: { error: (err as Error).message },
      }));
    } finally {
      setRunningTool(null);
    }
  }

  const mcpConfig = JSON.stringify(
    {
      mcpServers: {
        portico: {
          command: "npx",
          args: ["tsx", serverPath ?? "<absolute-path-to-this-repo>/mcp-server/server.mts"],
          ...(username.trim() && password.trim()
            ? {
                env: { PORTICO_USERNAME: username, PORTICO_PASSWORD: password },
              }
            : {}),
        },
      },
    },
    null,
    2,
  );

  const elementCount =
    siteMap?.screens.reduce((n, s) => n + s.elements.length, 0) ?? 0;

  /**
   * The screen's name from its URL, ignoring trailing record identifiers —
   * ".../viewPersonalDetails/empNumber/7" is a personal details screen, not "7".
   */
  function screenLabel(url: string, title: string) {
    const segments = new URL(url).pathname.split("/").filter(Boolean);
    while (segments.length > 1 && /^\d+$/.test(segments[segments.length - 1])) {
      segments.splice(-2); // drop the id and the key naming it
    }
    return segments.pop() ?? title;
  }

  return (
    <main className="relative z-10 mx-auto w-full max-w-[1400px] px-6 py-10">
      {/* Masthead */}
      <header className="border-b border-[var(--color-line)] pb-7">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <h1 className="display text-[46px] leading-[0.88] tracking-[-0.045em]">
              PORT<span className="text-[var(--color-signal)]">I</span>CO
            </h1>
            <p className="mt-2.5 text-[12.5px] text-[var(--color-ink-dim)] max-w-[54ch] leading-relaxed">
              Compiles a web app that has no API into an MCP server. Discovery
              is agentic; execution is compiled.
            </p>
          </div>
          <p className="text-[10.5px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)] leading-relaxed text-right">
            Tavily · h
            <br />
            OpenAI · Playwright
          </p>
        </div>
      </header>

      {/* Target form */}
      <section className="mt-7 flex flex-wrap items-end gap-3">
        <label className="flex-[3] min-w-[280px]">
          <span className="block text-[9.5px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)] mb-1.5">
            target application
          </span>
          <input
            className="field w-full px-3 py-2.5 text-[13px]"
            value={target}
            onChange={(e) => onTargetChange(e.target.value)}
            placeholder="https://www.awwwards.com"
          />
        </label>
        <label className="flex-1 min-w-[130px]">
          <span className="block text-[9.5px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)] mb-1.5">
            username · optional
          </span>
          <input
            className="field w-full px-3 py-2.5 text-[13px]"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label className="flex-1 min-w-[130px]">
          <span className="block text-[9.5px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)] mb-1.5">
            password · optional
          </span>
          <input
            type="password"
            className="field w-full px-3 py-2.5 text-[13px]"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button
          onClick={compile}
          disabled={compiling || !target}
          className="btn-go px-7 py-2.5 text-[12px] uppercase tracking-[0.14em]"
        >
          {compiling ? "compiling…" : "compile"}
        </button>
      </section>

      {/* Pipeline + log */}
      <section className="mt-7 grid gap-5 lg:grid-cols-[320px_1fr]">
        <div className="panel ticked p-5">
          <h2 className="text-[9.5px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)] mb-5">
            pipeline
          </h2>
          <PipelineRail states={states} />
        </div>
        <div className="panel ticked min-h-[320px] max-h-[440px] flex flex-col">
          <h2 className="text-[9.5px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)] px-4 pt-4 pb-2">
            build log
          </h2>
          <div className="flex-1 min-h-0">
            <LogStream lines={lines} />
          </div>
        </div>
      </section>

      {/* Discovered screens */}
      {siteMap && siteMap.screens.length > 0 && (
        <section className="mt-9">
          <div className="flex items-baseline gap-3 mb-4">
            <h2 className="display text-[19px]">Screens discovered</h2>
            <span className="text-[10.5px] text-[var(--color-ink-faint)]">
              {count(siteMap.screens.length, "screen")} · {count(elementCount, "control")}
            </span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {siteMap.screens.map((s, i) => (
              <figure
                key={s.id}
                className="panel rise overflow-hidden"
                style={{ animationDelay: `${i * 45}ms` }}
              >
                {s.screenshot && (
                  <button
                    type="button"
                    className="block w-full cursor-zoom-in"
                    onClick={() => setPreview(s)}
                    aria-label={`View ${screenLabel(s.url, s.title)} full size`}
                  >
                    {/* Screenshots are generated at runtime, so next/image cannot pre-optimise them. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.screenshot}
                      alt={s.title}
                      className="w-full h-[104px] object-cover object-top border-b border-[var(--color-line)] opacity-70 hover:opacity-100 transition-opacity"
                    />
                  </button>
                )}
                <figcaption className="p-2.5">
                  <p className="text-[11px] truncate text-[var(--color-ink)]">
                    {screenLabel(s.url, s.title)}
                  </p>
                  <p className="text-[10px] text-[var(--color-ink-faint)] mt-0.5">
                    {count(s.elements.length, "control")} ·{" "}
                    {count(s.resultContainers.length, "result set")}
                  </p>
                </figcaption>
              </figure>
            ))}
          </div>
          {preview?.screenshot && (
            <ScreenModal
              src={preview.screenshot}
              title={screenLabel(preview.url, preview.title)}
              caption={`${count(preview.elements.length, "control")} · ${count(preview.resultContainers.length, "result set")} · ${preview.url}`}
              onClose={() => setPreview(null)}
            />
          )}
        </section>
      )}

      {/* Compiled tools */}
      {tools.length > 0 && (
        <section className="mt-9">
          <div className="flex items-baseline gap-3 mb-4">
            <h2 className="display text-[19px]">Compiled tools</h2>
            <span className="text-[10.5px] text-[var(--color-ink-faint)]">
              no model runs at call time
            </span>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {tools.map((t, i) => (
              <div
                key={t.name}
                className="rise"
                style={{ animationDelay: `${i * 55}ms` }}
              >
                <ToolCard
                  tool={t}
                  onRun={runTool}
                  running={runningTool === t.name}
                  result={results[t.name]}
                />
              </div>
            ))}
          </div>

          <div className="panel ticked mt-5 p-4">
            <div className="flex items-center justify-between gap-3 mb-2.5">
              <h3 className="text-[9.5px] uppercase tracking-[0.16em] text-[var(--color-ink-faint)]">
                attach to an agent
              </h3>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(mcpConfig);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1600);
                }}
                className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-signal)] hover:brightness-125 transition"
              >
                {copied ? "copied" : "copy"}
              </button>
            </div>
            <pre className="text-[10.5px] leading-[1.6] text-[var(--color-ink-dim)] overflow-x-auto">
              {mcpConfig}
            </pre>
          </div>
        </section>
      )}
    </main>
  );
}

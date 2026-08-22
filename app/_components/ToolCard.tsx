"use client";

import { useState } from "react";
import type { ToolSpec } from "@/app/_lib/types";

type Props = {
  tool: ToolSpec;
  onRun: (tool: ToolSpec, args: Record<string, string>) => void;
  running: boolean;
  result?: { output?: string; error?: string; ms?: number };
};

/**
 * A compiled tool: its signature, the recipe it will replay, and a form to call
 * it for real. Showing the recipe matters — it is the evidence that execution is
 * a deterministic script rather than another agent run.
 */
export function ToolCard({ tool, onRun, running, result }: Props) {
  const [args, setArgs] = useState<Record<string, string>>({});
  const [open, setOpen] = useState(false);
  const params = Object.entries(tool.inputSchema.properties);

  return (
    <div className="panel ticked p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[13.5px] text-[var(--color-signal)] break-all">
            {tool.name}
            <span className="text-[var(--color-ink-faint)]">
              ({params.map(([n]) => n).join(", ")})
            </span>
          </h3>
          <p className="mt-1.5 text-[11.5px] leading-snug text-[var(--color-ink-dim)]">
            {tool.description}
          </p>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex-none text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)] transition-colors"
        >
          {open ? "hide" : "recipe"}
        </button>
      </div>

      {open && (
        <ol className="mt-3 border-l border-[var(--color-line)] pl-3 space-y-1 text-[10.5px] text-[var(--color-ink-faint)]">
          {tool.recipe.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-[var(--color-cool)] w-11 flex-none">{s.action}</span>
              <span className="truncate">{s.selector ?? s.value ?? `${s.ms ?? ""}ms`}</span>
              {s.arg && (
                <span className="text-[var(--color-signal)] flex-none">&lt;{s.arg}&gt;</span>
              )}
            </li>
          ))}
        </ol>
      )}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        {params.map(([name, schema]) => (
          <label key={name} className="flex-1 min-w-[130px]">
            <span className="block text-[9.5px] uppercase tracking-[0.14em] text-[var(--color-ink-faint)] mb-1">
              {name}
            </span>
            <input
              className="field w-full px-2 py-1.5 text-[11.5px]"
              placeholder={schema.description?.slice(0, 28) ?? name}
              value={args[name] ?? ""}
              onChange={(e) => setArgs((a) => ({ ...a, [name]: e.target.value }))}
            />
          </label>
        ))}
        <button
          onClick={() => {
            const trimmed = Object.fromEntries(
              Object.entries(args).map(([k, v]) => [k, v.trim()]),
            );
            setArgs(trimmed);
            onRun(tool, trimmed);
          }}
          disabled={running}
          className="btn-go px-3.5 py-1.5 text-[11px] uppercase tracking-[0.1em]"
        >
          {running ? "running" : "run"}
        </button>
      </div>

      {result && (
        <pre
          className={`mt-3 max-h-52 overflow-auto border p-2.5 text-[10.5px] leading-[1.6] whitespace-pre-wrap break-words ${
            result.error
              ? "border-[var(--color-stop)]/40 text-[var(--color-stop)]"
              : "border-[var(--color-line)] text-[var(--color-ink-dim)]"
          }`}
        >
          {result.error ?? result.output}
          {result.ms !== undefined && (
            <span className="block mt-1.5 text-[var(--color-ink-faint)]">
              — live call, {(result.ms / 1000).toFixed(1)}s
            </span>
          )}
        </pre>
      )}
    </div>
  );
}

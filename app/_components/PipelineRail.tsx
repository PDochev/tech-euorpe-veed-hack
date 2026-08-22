"use client";

import { STAGES, type StageName } from "@/app/_lib/types";

export type StageState = {
  status: "idle" | "run" | "done" | "error";
  label: string;
  summary?: string;
  cached?: boolean;
};

const PARTNER: Record<StageName, string> = {
  seed: "Tavily",
  explore: "h + Playwright",
  understand: "Deterministic",
  synthesize: "OpenAI",
  emit: "MCP",
};

const TITLE: Record<StageName, string> = {
  seed: "Research",
  explore: "Explore",
  understand: "Understand",
  synthesize: "Compile",
  emit: "Emit",
};

/**
 * The pipeline as an electrical conduit: each stage is a lamp, and the segment
 * between two lamps energises once the upper stage lands. It makes a long,
 * mostly-invisible backend run legible at a glance.
 */
export function PipelineRail({ states }: { states: Record<StageName, StageState> }) {
  return (
    <ol className="flex flex-col">
      {STAGES.map((stage, i) => {
        const s = states[stage];
        const done = s.status === "done";
        return (
          <li key={stage}>
            <div className="flex items-start gap-3">
              <div className="flex flex-col items-center self-stretch pt-[5px]">
                <span className="lamp" data-state={s.status === "idle" ? undefined : s.status} />
                {i < STAGES.length - 1 && <span className="conduit" data-on={done ? "1" : "0"} />}
              </div>

              <div className={`pb-5 min-w-0 flex-1 ${s.status === "idle" ? "opacity-45" : ""}`}>
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="display text-[15px] leading-none">{TITLE[stage]}</span>
                  <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-faint)]">
                    {PARTNER[stage]}
                  </span>
                  {s.cached && (
                    <span className="text-[9px] uppercase tracking-[0.14em] text-[var(--color-cool)] border border-[var(--color-cool)]/35 px-1 py-px">
                      cached
                    </span>
                  )}
                </div>
                <p className="mt-1 text-[11.5px] leading-snug text-[var(--color-ink-dim)] break-words">
                  {s.summary ?? s.label}
                </p>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

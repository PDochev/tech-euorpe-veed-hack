"use client";

import { useEffect, useRef } from "react";

export type LogLine = { stage: string; message: string; kind: "log" | "error" | "done" };

/** Build-log view. Pinned to the bottom so the newest line is always visible. */
export function LogStream({ lines }: { lines: LogLine[] }) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines.length]);

  return (
    <div className="h-full overflow-y-auto px-4 py-3 text-[11.5px] leading-[1.65]">
      {lines.length === 0 && (
        <p className="text-[var(--color-ink-faint)]">
          Waiting for a target. Nothing has been compiled yet.
        </p>
      )}
      {lines.map((l, i) => (
        <div key={i} className="rise flex gap-2.5">
          <span className="text-[var(--color-ink-faint)] select-none w-[86px] flex-none text-right">
            {l.stage}
          </span>
          <span
            className={
              l.kind === "error"
                ? "text-[var(--color-stop)]"
                : l.kind === "done"
                  ? "text-[var(--color-go)]"
                  : "text-[var(--color-ink-dim)]"
            }
          >
            {l.kind === "done" ? "✓ " : ""}
            {l.message}
          </span>
        </div>
      ))}
      <div ref={end} />
    </div>
  );
}

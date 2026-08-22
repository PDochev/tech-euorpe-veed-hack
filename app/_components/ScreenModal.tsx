"use client";

import { useEffect } from "react";

type Props = {
  src: string;
  title: string;
  caption: string;
  onClose: () => void;
};

/** Full-size harvest screenshot. The grid crop is only a preview. */
export function ScreenModal({ src, title, caption, onClose }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--color-ground)]/82 p-5"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="screen-modal-title"
    >
      <div
        className="panel ticked flex max-h-[92vh] w-full max-w-[1120px] flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] px-3 py-2">
          <p id="screen-modal-title" className="min-w-0 truncate text-[12px]">
            {title}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="flex-none text-[10px] uppercase tracking-[0.14em] text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
          >
            close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-[#fffdf8]">
          {/* Harvested at runtime — next/image cannot pre-optimise these. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={title} className="mx-auto max-h-[78vh] w-auto max-w-full object-contain" />
        </div>
        <p className="border-t border-[var(--color-line)] px-3 py-2 text-[10.5px] text-[var(--color-ink-faint)]">
          {caption}
        </p>
      </div>
    </div>
  );
}

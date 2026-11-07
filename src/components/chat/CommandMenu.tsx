"use client";

import { useEffect, useRef } from "react";


export type CommandMenuItem = { id: string; label: string; value: string };

export default function CommandMenu({
  open,
  items,
  onSelect,
  onClose,
}: {
  open: boolean;
  items: CommandMenuItem[];
  onSelect: (item: CommandMenuItem) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose();
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div ref={ref} className="absolute bottom-full left-0 z-20 mb-2 w-72 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)] shadow-lg">
      <ul className="max-h-60 overflow-y-auto py-1">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onSelect(item)}
              className="w-full px-3 py-2 text-left text-sm text-[var(--ink)] hover:bg-[var(--bg)]"
            >
              {item.label}
            </button>
          </li>
        ))}
        {!items.length && <li className="px-3 py-2 text-xs text-[var(--ink-muted)]">No matches</li>}
      </ul>
    </div>
  );
}

import type { ReactNode } from "react";
import { ChevronDown, ChevronRight, GripVertical, Power } from "lucide-react";

export interface SummaryChip {
  label: string;
  tone: "on" | "off" | "good" | "warn";
}

const TONE: Record<SummaryChip["tone"], string> = {
  on: "bg-amber-500/10 border-amber-500/30 text-amber-300",
  off: "bg-neutral-800/60 border-neutral-700/60 text-neutral-400",
  good: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
  warn: "bg-rose-500/10 border-rose-500/30 text-rose-300",
};

interface SectionProps {
  title: string;
  subtitle: string;
  summary?: SummaryChip[];
  collapsed: boolean;
  onToggle: () => void;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
  /** False on touch screens, where HTML5 drag-and-drop doesn't work. */
  draggable?: boolean;
  dragging?: boolean;
  over?: boolean;
  children: ReactNode;
  onQuickAction?: () => void;
  quickActionLabel?: string;
}

export function Section({
  title,
  subtitle,
  summary = [],
  collapsed,
  onToggle,
  onDragStart,
  onDragEnter,
  onDrop,
  onDragEnd,
  draggable = true,
  dragging = false,
  over = false,
  children,
  onQuickAction,
  quickActionLabel,
}: SectionProps) {
  return (
    <section
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnter={onDragEnter}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`rounded-3xl border transition-all duration-200 mb-4 sm:mb-6 overflow-hidden ${
        dragging
          ? "opacity-40 scale-[0.98] border-amber-500/50 shadow-2xl"
          : over
            ? "border-amber-400/80 ring-2 ring-amber-400/30 bg-neutral-900/40"
            : "border-neutral-800/80 bg-neutral-950/40 hover:border-neutral-700/60"
      }`}
    >
      <div className="flex items-center justify-between gap-2 p-3 sm:px-6 sm:py-4 bg-neutral-900/40 hover:bg-neutral-900/60 transition select-none">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          {draggable && (
            <span
              className="cursor-grab active:cursor-grabbing p-1 text-neutral-600 hover:text-neutral-300 transition shrink-0"
              title="Drag to reorder section"
            >
              <GripVertical className="w-4 h-4" />
            </span>
          )}

          <button
            onClick={onToggle}
            className="flex flex-1 items-center gap-3 py-1 touch:min-h-11 text-left focus:outline-none group min-w-0"
            aria-expanded={!collapsed}
          >
            <div className="p-1 rounded-lg bg-neutral-800/80 group-hover:bg-neutral-700/80 text-neutral-400 group-hover:text-white transition shrink-0">
              {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </div>
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight group-hover:text-amber-300 transition">
                {title}
              </h2>
              <p className="text-xs text-neutral-400 font-medium">{subtitle}</p>
              {collapsed && summary.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {summary.map((c, i) => (
                    <span
                      key={i}
                      className={`max-w-full truncate px-2 py-0.5 rounded-lg border text-[11px] font-medium ${TONE[c.tone]}`}
                    >
                      {c.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </button>
        </div>

        {onQuickAction && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onQuickAction();
            }}
            className="shrink-0 flex items-center justify-center gap-1.5 px-3 py-1.5 touch:min-h-11 touch:min-w-11 rounded-xl bg-neutral-800/60 hover:bg-neutral-800 border border-neutral-700/60 text-xs font-semibold text-neutral-300 hover:text-white transition"
            aria-label={quickActionLabel || "Toggle"}
          >
            <Power className="w-3.5 h-3.5 text-amber-400" />
            <span className="hidden sm:inline">{quickActionLabel || "Toggle"}</span>
          </button>
        )}
      </div>

      {!collapsed && <div className="p-3 sm:p-6 pt-2 sm:pt-2">{children}</div>}
    </section>
  );
}

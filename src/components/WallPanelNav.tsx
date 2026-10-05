import { History, Home, Radar } from "lucide-react";

export type WallPanelView = "home" | "flights" | "history";

interface WallPanelNavProps {
  view: WallPanelView;
  onChange: (view: WallPanelView) => void;
}

const ITEMS: { view: WallPanelView; label: string; icon: typeof Home }[] = [
  { view: "home", label: "Home", icon: Home },
  { view: "flights", label: "Flights", icon: Radar },
  { view: "history", label: "History", icon: History },
];

export function WallPanelNav({ view, onChange }: WallPanelNavProps) {
  return (
    <nav aria-label="Wall panel views" className="flex items-center gap-1 rounded-2xl border border-slate-800/80 bg-slate-950/70 p-1">
      {ITEMS.map(({ view: itemView, label, icon: Icon }) => {
        const active = view === itemView;
        return (
          <button
            key={itemView}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onChange(itemView)}
            className={`flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-semibold uppercase tracking-[0.12em] transition-colors ${
              active
                ? "bg-slate-800 text-amber-300 shadow-sm"
                : "text-slate-500 hover:bg-slate-900 hover:text-slate-200"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}

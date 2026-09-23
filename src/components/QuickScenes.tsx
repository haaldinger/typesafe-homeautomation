import { Sparkles, Sunset, Moon, Coffee, PartyPopper, X } from "lucide-react";

interface QuickScenesProps {
  onSelectScene: (sceneCommand: string) => void;
  onClose?: () => void;
}

// Each scene is just a natural-language command sent to /api/command, so what
// actually happens is decided by TypeSafe against the current home and zones.
const SCENES = [
  {
    id: "deck-evening",
    name: "Deck Evening",
    icon: Sunset,
    command: "Play some music on the deck and dim the living room lights",
    color: "from-amber-500/20 to-orange-500/10 border-amber-500/30 text-amber-300",
  },
  {
    id: "movie-night",
    name: "Movie Night",
    icon: Sparkles,
    command: "Dim the living room lights and close the blinds",
    color: "from-purple-500/20 to-indigo-500/10 border-purple-500/30 text-purple-300",
  },
  {
    id: "party",
    name: "Party Sync",
    icon: PartyPopper,
    command: "Group the deck with the living room and turn it up",
    color: "from-rose-500/20 to-amber-500/10 border-rose-500/30 text-rose-300",
  },
  {
    id: "leaving",
    name: "Leaving Home",
    icon: Moon,
    command: "Turn off all the lights and lock all the doors",
    color: "from-blue-500/20 to-cyan-500/10 border-blue-500/30 text-blue-300",
  },
  {
    id: "morning",
    name: "Morning",
    icon: Coffee,
    command: "Turn on the kitchen lights and play music in the kitchen",
    color: "from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-300",
  },
];

export function QuickScenes({ onSelectScene, onClose }: QuickScenesProps) {
  return (
    <div className="p-4 sm:p-6 rounded-3xl bg-neutral-900/90 border border-neutral-800 shadow-xl mb-6 backdrop-blur-md">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold text-white tracking-tight">Scenes</h3>
          <span className="text-[11px] text-neutral-500">sent as natural-language commands</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition"
            aria-label="Close scenes"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        {SCENES.map((sc) => {
          const Icon = sc.icon;
          return (
            <button
              key={sc.id}
              onClick={() => onSelectScene(sc.command)}
              className={`p-3.5 rounded-2xl border text-left transition transform hover:-translate-y-0.5 hover:shadow-lg bg-gradient-to-br ${sc.color} flex flex-col justify-between`}
            >
              <Icon className="w-5 h-5 mb-2" />
              <div>
                <h4 className="text-sm font-bold text-white mb-0.5">{sc.name}</h4>
                <p className="text-[11px] text-neutral-400 line-clamp-2 leading-tight">"{sc.command}"</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

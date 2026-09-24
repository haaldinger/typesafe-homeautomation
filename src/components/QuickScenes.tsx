import type { LucideIcon } from "lucide-react";
import { Sparkles, Sunset, Moon, Coffee, PartyPopper, Trophy, Clapperboard, UtensilsCrossed, X } from "lucide-react";

interface QuickScenesProps {
  onSelectScene: (sceneCommand: string) => void;
  onClose?: () => void;
  /** Present when real lights are connected: build scenes for this house instead of the demo one. */
  realHome?: { sceneNames: string[]; zoneName?: string };
}

export interface Scene {
  id: string;
  name: string;
  icon: LucideIcon;
  command: string;
  color: string;
}

// Each scene is just a natural-language command sent to /api/command, so what
// actually happens is decided by TypeSafe against the current home and zones.
const DEMO_SCENES: Scene[] = [
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

/** Scenes for the real house: saved Hue scenes when they exist, plain color commands otherwise. */
function realScenes(sceneNames: string[], zoneName = "the speaker"): Scene[] {
  const has = (name: string) => sceneNames.some((s) => s.toLowerCase() === name.toLowerCase());
  const zone = zoneName.toLowerCase().startsWith("the ") ? zoneName : `the ${zoneName}`;
  const scenes: Scene[] = [
    {
      id: "movie-night",
      name: "Movie Night",
      icon: Clapperboard,
      command: has("Relax")
        ? "Set the living room to Relax and turn off the kitchen light"
        : "Make the living room lights warm white and turn off the kitchen light",
      color: "from-purple-500/20 to-indigo-500/10 border-purple-500/30 text-purple-300",
    },
    {
      id: "dinner",
      name: "Dinner",
      icon: UtensilsCrossed,
      command: `Make the kitchen light warm white and play jazz in ${zone}`,
      color: "from-amber-500/20 to-orange-500/10 border-amber-500/30 text-amber-300",
    },
    {
      id: "party",
      name: "Party",
      icon: PartyPopper,
      command: `Party mode in the living room and turn it up in ${zone}`,
      color: "from-fuchsia-500/20 to-rose-500/10 border-fuchsia-500/30 text-fuchsia-300",
    },
  ];
  if (has("Chiefs")) {
    scenes.push({
      id: "game-day",
      name: "Game Day",
      icon: Trophy,
      command: "Set the living room to Chiefs and set the kitchen to Chiefs",
      color: "from-red-500/25 to-yellow-500/10 border-red-500/40 text-red-300",
    });
  }
  scenes.push(
    {
      id: "morning",
      name: "Morning",
      icon: Coffee,
      command: has("Energize")
        ? `Set the kitchen to Energize and play some pop in ${zone}`
        : `Make the kitchen light daylight and play some pop in ${zone}`,
      color: "from-emerald-500/20 to-teal-500/10 border-emerald-500/30 text-emerald-300",
    },
    {
      id: "good-night",
      name: "Good Night",
      icon: Moon,
      command: `Turn off all the lights and pause ${zone}`,
      color: "from-blue-500/20 to-cyan-500/10 border-blue-500/30 text-blue-300",
    },
  );
  return scenes;
}

/** The scene list for the demo house, or for a real house built from its saved scenes and speaker. */
export function scenesFor(realHome?: { sceneNames: string[]; zoneName?: string }): Scene[] {
  return realHome ? realScenes(realHome.sceneNames, realHome.zoneName) : DEMO_SCENES;
}

export function QuickScenes({ onSelectScene, onClose, realHome }: QuickScenesProps) {
  const scenes = scenesFor(realHome);
  return (
    <div className="p-4 sm:p-6 rounded-3xl bg-neutral-900/90 border border-neutral-800 shadow-xl mb-4 sm:mb-6 backdrop-blur-md">
      <div className="flex items-center justify-between gap-2 mb-3 sm:mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 rounded-lg bg-amber-500/20 text-amber-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-bold text-white tracking-tight">Scenes</h3>
          <span className="hidden min-[420px]:inline text-[11px] text-neutral-500 truncate">sent as natural-language commands</span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="shrink-0 p-1 touch:min-w-11 touch:min-h-11 flex items-center justify-center rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition"
            aria-label="Close scenes"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5 sm:gap-3">
        {scenes.map((sc) => {
          const Icon = sc.icon;
          return (
            <button
              key={sc.id}
              onClick={() => onSelectScene(sc.command)}
              className={`min-w-0 p-3 sm:p-3.5 rounded-2xl border text-left transition transform hover:-translate-y-0.5 hover:shadow-lg active:scale-[0.98] bg-gradient-to-br ${sc.color} flex flex-col justify-between`}
            >
              <Icon className="w-5 h-5 mb-2" />
              <div>
                <h4 className="text-sm font-bold text-white mb-0.5 truncate">{sc.name}</h4>
                <p className="text-[11px] text-neutral-400 line-clamp-2 leading-tight">"{sc.command}"</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

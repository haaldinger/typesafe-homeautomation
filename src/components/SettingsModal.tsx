import { useEffect, useState } from "react";
import { X, Server, CheckCircle2, AlertTriangle, Presentation, House } from "lucide-react";
import { getCustomBackendUrl, setCustomBackendUrl, setProfile, type HealthInfo } from "../api.ts";

const PROFILES = [
  { id: "demo" as const, label: "Demo", icon: Presentation, desc: "Simulated house and speakers. Runs anywhere, touches nothing real." },
  { id: "home" as const, label: "Home", icon: House, desc: "Your real lights and Sonos, as configured in .env." },
];

interface SettingsModalProps {
  health: HealthInfo | null;
  onClose: () => void;
  onRefresh: () => void;
}

function StatusRow({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className="min-w-0 p-3 rounded-2xl bg-neutral-900/70 border border-neutral-800">
      <span className="text-[11px] text-neutral-400 font-medium block mb-1">{label}</span>
      <div className="flex items-start gap-1.5">
        {ok ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />}
        <span className="min-w-0 text-xs font-bold text-white break-words">{value}</span>
      </div>
    </div>
  );
}

const SONOS_LABEL: Record<string, string> = {
  mock: "Simulator (mock)",
  live: "Live (node-sonos-http-api)",
  direct: "Live (direct UPnP)",
};

export function SettingsModal({ health, onClose, onRefresh }: SettingsModalProps) {
  const [url, setUrl] = useState(getCustomBackendUrl() ?? "");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const [switching, setSwitching] = useState(false);
  const [profileErr, setProfileErr] = useState<string | null>(null);
  async function switchProfile(next: "demo" | "home") {
    setSwitching(true);
    setProfileErr(null);
    try {
      await setProfile(next);
      onRefresh();
    } catch (e) {
      setProfileErr(e instanceof Error ? e.message : "Couldn't switch mode.");
    } finally {
      setSwitching(false);
    }
  }

  const apply = (next: string | null) => {
    setCustomBackendUrl(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
    onRefresh();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 bg-black/80 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="relative w-full max-w-lg max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_0.5rem)] sm:max-h-[calc(100dvh_-_2rem)] overflow-y-auto overscroll-contain rounded-t-3xl sm:rounded-3xl bg-neutral-950 border border-neutral-800 shadow-2xl p-5 sm:p-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:pb-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 pb-4 border-b border-neutral-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 id="settings-title" className="text-base font-bold text-white">Backend</h3>
              <p className="text-xs text-neutral-400">Live status from /api/health</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 p-1.5 touch:min-w-11 touch:min-h-11 flex items-center justify-center rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white transition"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-5 space-y-5">
          {health && (
            <div className="space-y-2">
              <span id="profile-label" className="text-xs font-bold text-white">
                Mode
              </span>
              <div className="grid grid-cols-2 gap-2.5 sm:gap-3" role="radiogroup" aria-labelledby="profile-label">
                {PROFILES.map((p) => {
                  const active = (health.profile ?? "home") === p.id;
                  const Icon = p.icon;
                  return (
                    <button
                      key={p.id}
                      role="radio"
                      aria-checked={active}
                      disabled={switching}
                      onClick={() => !active && switchProfile(p.id)}
                      className={`min-w-0 p-3 sm:p-3.5 rounded-2xl border text-left transition disabled:opacity-60 ${
                        active
                          ? "bg-amber-500/15 border-amber-500/50 ring-1 ring-amber-500/30"
                          : "bg-neutral-900/70 border-neutral-800 hover:border-neutral-700"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className={`w-4 h-4 ${active ? "text-amber-400" : "text-neutral-400"}`} />
                        <span className="text-sm font-bold text-white">{p.label}</span>
                      </div>
                      <p className="text-[11px] text-neutral-400 leading-snug">{p.desc}</p>
                    </button>
                  );
                })}
              </div>
              {profileErr && <p className="text-[11px] text-rose-300">{profileErr}</p>}
            </div>
          )}

          {health ? (
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              <StatusRow label="TypeSafe" ok={health.typesafe} value={health.typesafe ? "API key set" : "TYPESAFE_API_KEY missing"} />
              <StatusRow label="LLM (Ollama)" ok={health.llm} value={health.llm ? "On" : "Off (heuristics)"} />
              <StatusRow label="Home gateway" ok value={health.gateway} />
              <StatusRow
                label="Sonos"
                ok={Boolean(health.sonos)}
                value={SONOS_LABEL[health.sonos ?? ""] ?? health.sonos ?? "unknown"}
              />
              <StatusRow label="Spotify search" ok={Boolean(health.spotify)} value={health.spotify ? "Configured" : "Not configured"} />
            </div>
          ) : (
            <div className="p-3 rounded-2xl bg-rose-950/30 border border-rose-500/40 text-xs text-rose-200">
              Can't reach the backend. Start it with <code className="font-mono">npm run dev</code> (server on port 8787).
            </div>
          )}

          <div className="space-y-2">
            <label className="text-xs font-bold text-white flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5" htmlFor="backend-url">
              <span>Backend URL (optional)</span>
              <span className="text-[11px] text-neutral-400 font-normal">Default: same origin via Vite proxy</span>
            </label>
            <input
              id="backend-url"
              type="text"
              placeholder="e.g. http://192.168.1.100:8787"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              className="w-full px-3.5 py-2.5 touch:min-h-11 rounded-xl bg-neutral-900 border border-neutral-800 text-base sm:text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/70"
            />
            <p className="text-[11px] text-neutral-400 leading-normal">
              Leave empty to use <code className="font-mono">/api</code> through the dev server. Set it only to reach an
              Aura server on another host.
            </p>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              onClick={() => {
                setUrl("");
                apply(null);
              }}
              className="touch:min-h-11 text-xs text-neutral-400 hover:text-white underline transition"
            >
              Reset to default
            </button>
            <button
              onClick={() => apply(url.trim() || null)}
              className="px-4 py-2 touch:min-h-11 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs shadow-md transition"
            >
              {saved ? "Saved" : "Save & reconnect"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

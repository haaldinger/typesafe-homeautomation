import { useEffect, useState } from "react";
import { X, Server, CheckCircle2, AlertTriangle } from "lucide-react";
import { getCustomBackendUrl, setCustomBackendUrl, type HealthInfo } from "../api.ts";

interface SettingsModalProps {
  health: HealthInfo | null;
  onClose: () => void;
  onRefresh: () => void;
}

function StatusRow({ label, ok, value }: { label: string; ok: boolean; value: string }) {
  return (
    <div className="p-3 rounded-2xl bg-neutral-900/70 border border-neutral-800">
      <span className="text-[11px] text-neutral-400 font-medium block mb-1">{label}</span>
      <div className="flex items-center gap-1.5">
        {ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <AlertTriangle className="w-4 h-4 text-amber-400" />}
        <span className="text-xs font-bold text-white">{value}</span>
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

  const apply = (next: string | null) => {
    setCustomBackendUrl(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
    onRefresh();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={onClose}>
      <div
        className="relative w-full max-w-lg rounded-3xl bg-neutral-950 border border-neutral-800 shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <Server className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Backend</h3>
              <p className="text-xs text-neutral-400">Live status from /api/health</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-800 text-neutral-400 hover:text-white transition"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mt-5 space-y-5">
          {health ? (
            <div className="grid grid-cols-2 gap-3">
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
            <label className="text-xs font-bold text-white flex items-center justify-between" htmlFor="backend-url">
              <span>Backend URL (optional)</span>
              <span className="text-[11px] text-neutral-400 font-normal">Default: same origin via Vite proxy</span>
            </label>
            <input
              id="backend-url"
              type="text"
              placeholder="e.g. http://192.168.1.100:8787"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500/70"
            />
            <p className="text-[11px] text-neutral-400 leading-normal">
              Leave empty to use <code className="font-mono">/api</code> through the dev server. Set it only to reach an
              Aura server on another host.
            </p>
          </div>

          <div className="flex items-center justify-between pt-2">
            <button onClick={() => { setUrl(""); apply(null); }} className="text-xs text-neutral-400 hover:text-white underline transition">
              Reset to default
            </button>
            <button
              onClick={() => apply(url.trim() || null)}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-bold text-xs shadow-md transition"
            >
              {saved ? "Saved" : "Save & reconnect"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

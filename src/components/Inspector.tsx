import { useState } from "react";
import type { ReactNode } from "react";
import type { AnswerTrace, AudioAction, CommandResponse, DeviceAction } from "../../shared/types.ts";
import {
  X,
  Terminal,
  Cpu,
  CheckCircle2,
  CircleDashed,
  Copy,
  Check,
  Zap,
  Clock,
  Code2,
  ListTree,
  Radio,
  Lightbulb,
} from "lucide-react";

interface InspectorProps {
  result: CommandResponse | null;
  onCollapse: () => void;
}

type Tab = "trace" | "actions" | "json";

function confClass(c: number): string {
  if (c >= 0.75) return "bg-emerald-500/15 text-emerald-300 border-emerald-500/40";
  if (c >= 0.45) return "bg-amber-500/15 text-amber-300 border-amber-500/40";
  return "bg-rose-500/15 text-rose-300 border-rose-500/40";
}

function patchChips(patch: DeviceAction["patch"]): string[] {
  const chips: string[] = [];
  if (patch.on === true) chips.push("on");
  if (patch.on === false) chips.push("off");
  if (patch.level !== undefined) chips.push(`${patch.level}%`);
  if (patch.temperature !== undefined) chips.push(`${patch.temperature}°`);
  if (patch.intensity !== undefined) chips.push(`vol ${patch.intensity}`);
  if (patch.locked === true) chips.push("locked");
  if (patch.locked === false) chips.push("unlocked");
  return chips;
}

function Chip({ children, audio = false }: { children: string; audio?: boolean }) {
  return (
    <span
      className={`text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded border ${
        audio ? "bg-amber-500/15 text-amber-300 border-amber-500/40" : "bg-neutral-800 text-neutral-200 border-neutral-700"
      }`}
    >
      {children}
    </span>
  );
}

function TraceRow({ a }: { a: AnswerTrace }) {
  return (
    <div
      className={`p-3 rounded-xl border space-y-2 ${
        a.used ? "bg-neutral-900/80 border-neutral-700/80" : "bg-neutral-900/30 border-neutral-800/60 opacity-60"
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="text-[9px] uppercase font-mono font-bold px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30 shrink-0">
          {a.kind}
        </span>
        <span className="flex-1 text-[11px] text-neutral-300 leading-snug">{a.question || a.id}</span>
        <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 ${confClass(a.confidence)}`}>
          {a.confidence.toFixed(2)}
        </span>
      </div>
      <div className="flex items-center gap-2 pl-0.5 text-xs">
        {a.used ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        ) : (
          <CircleDashed className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
        )}
        <span className="font-semibold text-white">{a.value}</span>
        <span className={`ml-auto text-[10px] uppercase tracking-wider ${a.used ? "text-emerald-400" : "text-neutral-500"}`}>
          {a.used ? "used" : "ignored"}
        </span>
      </div>
      {a.distribution.length > 0 && (
        <div className="space-y-1">
          {a.distribution.slice(0, 6).map((e) => (
            <div key={e.label} className="flex items-center gap-2 text-[10px] font-mono">
              <span className={`w-24 truncate ${e.top ? "text-amber-300" : "text-neutral-500"}`}>{e.label}</span>
              <span className="flex-1 h-1.5 rounded-full bg-neutral-800 overflow-hidden">
                <span
                  className={`block h-full rounded-full ${e.top ? "bg-amber-400" : "bg-neutral-600"}`}
                  style={{ width: `${Math.round(e.p * 100)}%` }}
                />
              </span>
              <span className="w-8 text-right text-neutral-400">{e.p.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Outcomes({ actions, audioActions }: { actions: DeviceAction[]; audioActions: AudioAction[] }) {
  if (actions.length === 0 && audioActions.length === 0) return null;
  return (
    <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-1.5">
      <div className="text-[10px] uppercase font-bold tracking-wider text-emerald-400">Actions taken</div>
      {actions.map((act) => (
        <div key={act.deviceId} className="flex items-center gap-2 text-xs flex-wrap">
          <Lightbulb className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-neutral-200 font-medium">{act.deviceName}</span>
          {patchChips(act.patch).map((c) => (
            <Chip key={c}>{c}</Chip>
          ))}
        </div>
      ))}
      {audioActions.map((act, i) => (
        <div key={`${act.zone}-${act.kind}-${i}`} className="flex items-center gap-2 text-xs flex-wrap">
          <Radio className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span className="text-neutral-200 font-medium">{act.zoneName}</span>
          {act.chips.map((c) => (
            <Chip key={c} audio>
              {c}
            </Chip>
          ))}
        </div>
      ))}
    </div>
  );
}

export function Inspector({ result, onCollapse }: InspectorProps) {
  const [tab, setTab] = useState<Tab>("trace");
  const [copied, setCopied] = useState(false);

  const copyJson = () => {
    if (!result) return;
    const text = JSON.stringify(result, null, 2);
    // navigator.clipboard only exists in secure contexts (https or localhost), not when a
    // phone opens the dev server by LAN IP; fall back to a hidden textarea there.
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).catch(() => {});
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        // Nothing else to try.
      }
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const tabBtn = (id: Tab, label: string, icon: ReactNode) => (
    <button
      onClick={() => setTab(id)}
      className={`flex items-center gap-1.5 pb-2 touch:pt-2 touch:min-h-11 text-xs font-semibold border-b-2 transition whitespace-nowrap ${
        tab === id ? "border-amber-400 text-amber-300" : "border-transparent text-neutral-400 hover:text-neutral-200"
      }`}
    >
      {icon}
      {label}
    </button>
  );

  const questionCount = result?.resolutions[0]?.answers.length ?? 0;
  const actionCount = result ? result.actions.length + result.audioActions.length : 0;

  return (
    <aside
      role="complementary"
      aria-label="Decision trace"
      className="fixed inset-x-0 bottom-0 z-50 h-[85dvh] max-h-[calc(100dvh_-_env(safe-area-inset-top)_-_1rem)] rounded-t-3xl border-t border-neutral-700/80 shadow-2xl lg:static lg:z-auto lg:h-full lg:max-h-none lg:w-80 xl:w-96 lg:rounded-none lg:border-t-0 lg:border-l lg:border-neutral-800/80 lg:shadow-none shrink-0 bg-neutral-950 lg:bg-neutral-950/95 backdrop-blur-xl flex flex-col overflow-hidden"
    >
      {/* Grab handle (visual only) on the phone/tablet sheet */}
      <div className="lg:hidden flex justify-center pt-2 pb-0.5 bg-neutral-900/60" aria-hidden>
        <span className="w-10 h-1 rounded-full bg-neutral-700" />
      </div>
      <div className="p-4 pt-2 lg:pt-4 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] lg:px-4 border-b border-neutral-800/80 flex items-center justify-between gap-2 bg-neutral-900/60">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="shrink-0 p-1.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-400">
            <Terminal className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight">Decision Trace</h3>
            <p className="text-[11px] text-neutral-400 font-medium">How and why every decision is made</p>
          </div>
        </div>
        <button
          onClick={onCollapse}
          className="shrink-0 p-1.5 touch:min-w-11 touch:min-h-11 flex items-center justify-center rounded-lg hover:bg-neutral-800 text-neutral-400 hover:text-white transition"
          title="Collapse decision trace"
          aria-label="Close decision trace"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex items-center border-b border-neutral-800/80 px-4 pt-2 touch:pt-0 gap-4 lg:gap-3 bg-neutral-950 overflow-x-auto no-scrollbar">
        {tabBtn("trace", "TypeSafe", <ListTree className="w-3.5 h-3.5" />)}
        {tabBtn("actions", `Actions (${actionCount})`, <Zap className="w-3.5 h-3.5" />)}
        {tabBtn("json", "JSON", <Code2 className="w-3.5 h-3.5" />)}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 pb-[max(1rem,env(safe-area-inset-bottom))] lg:pb-4 space-y-4">
        {!result ? (
          <div className="text-center py-16 text-neutral-500">
            <Cpu className="w-10 h-10 mx-auto mb-3 opacity-30 text-amber-400" />
            <p className="text-sm font-semibold text-neutral-300">Awaiting command</p>
            <p className="text-xs text-neutral-500 max-w-xs mx-auto mt-1">
              Send a command to watch TypeSafe evaluate every question in a single call, then see which answers the
              code used to route it, and why.
            </p>
          </div>
        ) : (
          <>
            <p className="text-sm text-neutral-200 italic">"{result.request}"</p>

            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Latency", value: `${result.latencyMs}ms`, cls: "text-emerald-400", icon: <Clock className="w-3 h-3 inline" /> },
                { label: "Questions", value: String(questionCount), cls: "text-blue-300" },
                { label: "Calls", value: String(result.usage.calls), cls: "text-amber-300" },
                { label: "Tokens", value: String(result.usage.inputTokens + result.usage.outputTokens), cls: "text-neutral-200" },
              ].map((s) => (
                <div key={s.label} className="p-2 rounded-xl bg-neutral-900/80 border border-neutral-800 text-center">
                  <span className="text-[9px] text-neutral-400 uppercase font-semibold block">{s.label}</span>
                  <span className={`text-xs font-bold font-mono flex items-center justify-center gap-1 ${s.cls}`}>
                    {s.icon}
                    {s.value}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-1.5">
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-500/15 text-blue-300 border border-blue-500/30">
                category: {result.category}
              </span>
              {result.isCompound && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  compound → split
                </span>
              )}
              {result.usedLlm && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  LLM paired
                </span>
              )}
            </div>

            {tab === "trace" && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-neutral-500">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" /> used by code
                  </span>
                  <span className="flex items-center gap-1">
                    <CircleDashed className="w-3 h-3" /> ignored (speculative)
                  </span>
                </div>
                {result.resolutions.map((res, i) => (
                  <div key={i} className="space-y-2">
                    {result.resolutions.length > 1 && (
                      <p className="text-xs text-neutral-300">
                        <span className="font-mono text-amber-400 mr-1">#{i + 1}</span>"{res.request}"
                      </p>
                    )}
                    {res.answers.map((a) => (
                      <TraceRow key={a.id} a={a} />
                    ))}
                    <Outcomes actions={res.actions} audioActions={res.audioActions} />
                    {res.note && res.actions.length === 0 && (
                      <p className="text-[11px] text-neutral-400">{res.note}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {tab === "actions" && (
              <div className="space-y-2.5">
                <div className="p-3 rounded-2xl bg-neutral-900/60 border border-neutral-800">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-amber-400 block mb-1">Reply</span>
                  <p className="text-xs text-neutral-200 leading-relaxed">{result.reply}</p>
                </div>
                {actionCount === 0 ? (
                  <p className="text-xs text-neutral-500">No device or speaker actions for this request.</p>
                ) : (
                  <>
                    {result.actions.map((act) => (
                      <div key={act.deviceId} className="p-3 rounded-xl bg-neutral-900/70 border border-neutral-800 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-white flex items-center gap-1.5">
                            <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                            {act.deviceName}
                          </span>
                          <span className="flex flex-wrap justify-end gap-1">
                            {patchChips(act.patch).map((c) => (
                              <Chip key={c}>{c}</Chip>
                            ))}
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-400">{act.summary}</p>
                      </div>
                    ))}
                    {result.audioActions.map((aud, i) => (
                      <div key={`aud-${i}`} className="p-3 rounded-xl bg-neutral-900/70 border border-neutral-800 space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-white flex items-center gap-1.5">
                            <Radio className="w-3.5 h-3.5 text-amber-400" />
                            {aud.zoneName}
                          </span>
                          <Chip audio>{aud.kind}</Chip>
                        </div>
                        <p className="text-[11px] text-neutral-400">{aud.summary}</p>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            {tab === "json" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-neutral-400">CommandResponse</span>
                  <button
                    onClick={copyJson}
                    className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 touch:min-h-11 touch:px-3 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-300 hover:text-white transition"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
                <pre className="p-3 rounded-xl bg-neutral-900/90 border border-neutral-800 text-[11px] font-mono text-amber-200/90 overflow-x-auto leading-relaxed">
                  {JSON.stringify(result, null, 2)}
                </pre>
              </div>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

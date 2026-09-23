import type { AnswerTrace, AudioAction, CommandResponse, DeviceAction } from "../../shared/types.ts";

function confClass(c: number): string {
  if (c >= 0.75) return "high";
  if (c >= 0.45) return "mid";
  return "low";
}

function Distribution({ entries }: { entries: AnswerTrace["distribution"] }) {
  return (
    <div className="dist">
      {entries.slice(0, 6).map((e) => (
        <div key={e.label} className={`dist-row ${e.top ? "top" : ""}`}>
          <span className="dist-name">{e.label}</span>
          <span className="dist-track">
            <span className="dist-fill" style={{ width: `${Math.round(e.p * 100)}%` }} />
          </span>
          <span className="dist-p">{e.p.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

function TraceRow({ a }: { a: AnswerTrace }) {
  return (
    <div className={`trace ${a.used ? "used" : "ignored"}`}>
      <div className="trace-head">
        <span className={`kind-badge kind-${a.kind}`}>{a.kind}</span>
        <span className="trace-q">{a.question || a.id}</span>
        <span className={`conf-pill ${confClass(a.confidence)}`}>{a.confidence.toFixed(2)}</span>
      </div>
      <div className="trace-answer">
        <span className="trace-arrow">→</span>
        <span className="trace-value">{a.value}</span>
        <span className={`trace-flag ${a.used ? "used" : ""}`}>{a.used ? "used" : "ignored"}</span>
      </div>
      <Distribution entries={a.distribution} />
    </div>
  );
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

function Outcomes({ actions, audioActions }: { actions: DeviceAction[]; audioActions: AudioAction[] }) {
  if (actions.length === 0 && audioActions.length === 0) return null;
  return (
    <div className="outcomes">
      <div className="outcomes-title">Actions taken</div>
      {actions.map((act) => (
        <div className="outcome" key={act.deviceId}>
          <span className="outcome-arrow">→</span>
          <span className="outcome-name">{act.deviceName}</span>
          <span className="outcome-chips">
            {patchChips(act.patch).map((c) => (
              <span className="outcome-chip" key={c}>
                {c}
              </span>
            ))}
          </span>
        </div>
      ))}
      {audioActions.map((act) => (
        <div className="outcome" key={`audio-${act.zone}-${act.kind}`}>
          <span className="outcome-arrow audio">♪</span>
          <span className="outcome-name">{act.zoneName}</span>
          <span className="outcome-chips">
            {act.chips.map((c) => (
              <span className="outcome-chip audio" key={c}>
                {c}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

function CollapseButton({ onCollapse }: { onCollapse?: () => void }) {
  if (!onCollapse) return null;
  return (
    <button className="inspector-collapse" onClick={onCollapse} aria-label="Collapse decision trace">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="9 6 15 12 9 18" />
      </svg>
    </button>
  );
}

export function Inspector({ result, onCollapse }: { result: CommandResponse | null; onCollapse?: () => void }) {
  if (!result) {
    return (
      <aside className="inspector">
        <div className="inspector-head">
          <h3>Decision Trace</h3>
          <CollapseButton onCollapse={onCollapse} />
        </div>
        <p className="sub">See how and why every decision is made.</p>
        <div className="empty-inspector">
          <div className="big">🧠</div>
          Send a command to watch TypeSafe evaluate every question in a single
          call — then see which answers the code used to route it, and why.
        </div>
      </aside>
    );
  }

  const { usage, latencyMs, category, isCompound, usedLlm, resolutions, request } = result;
  const promptCount = resolutions[0]?.answers.length ?? 0;

  return (
    <aside className="inspector">
      <div className="inspector-head">
        <h3>Decision Trace</h3>
        <CollapseButton onCollapse={onCollapse} />
      </div>
      <p className="trace-request">“{request}”</p>
      <div className="trace-headline">
        <span className="trace-brand">TypeSafe</span>
        <span className="trace-latency">{latencyMs}ms</span>
        <span className="trace-dot">·</span>
        <span>{promptCount} questions</span>
        <span className="trace-dot">·</span>
        <span>
          {usage.calls} call{usage.calls === 1 ? "" : "s"}
        </span>
        <span className="trace-dot">·</span>
        <span>{usage.inputTokens + usage.outputTokens} tokens</span>
      </div>

      <div className="trace-tags">
        <span className="tag blue">category: {category}</span>
        {isCompound && <span className="tag amber">compound → split</span>}
        {usedLlm && <span className="tag green">LLM paired</span>}
      </div>

      <div className="legend">
        <span>
          <i className="dot-green" /> used by code
        </span>
        <span>
          <i className="dot-dim" /> ignored (speculative)
        </span>
      </div>

      {resolutions.map((res, i) => (
        <div className="res-block" key={i}>
          {resolutions.length > 1 && (
            <p className="res-sub">
              <span className="res-index">#{i + 1}</span> “{res.request}”
            </p>
          )}
          {res.answers.map((a) => (
            <TraceRow key={a.id} a={a} />
          ))}
          <Outcomes actions={res.actions} audioActions={res.audioActions} />
          {res.note && res.actions.length === 0 && (
            <p className="sub" style={{ marginTop: 10, marginBottom: 0 }}>
              {res.note}
            </p>
          )}
        </div>
      ))}
    </aside>
  );
}

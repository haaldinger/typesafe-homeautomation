import type { ReactNode } from "react";

interface SectionProps {
  title: string;
  subtitle: string;
  collapsed: boolean;
  onToggle: () => void;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
  dragging: boolean;
  over: boolean;
  children: ReactNode;
}

export function Section({
  title,
  subtitle,
  collapsed,
  onToggle,
  onDragStart,
  onDragEnter,
  onDrop,
  onDragEnd,
  dragging,
  over,
  children,
}: SectionProps) {
  return (
    <section
      className={`room section ${dragging ? "dragging" : ""} ${over ? "over" : ""}`}
      onDragOver={(e) => e.preventDefault()}
      onDragEnter={onDragEnter}
      onDrop={onDrop}
    >
      <div
        className="section-head"
        draggable
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <span className="drag-handle" aria-hidden>
          <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
            <circle cx="3" cy="3" r="1.4" />
            <circle cx="9" cy="3" r="1.4" />
            <circle cx="3" cy="8" r="1.4" />
            <circle cx="9" cy="8" r="1.4" />
            <circle cx="3" cy="13" r="1.4" />
            <circle cx="9" cy="13" r="1.4" />
          </svg>
        </span>
        <button className="section-toggle" onClick={onToggle} aria-expanded={!collapsed}>
          <svg
            className={`chevron ${collapsed ? "" : "open"}`}
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 6 15 12 9 18" />
          </svg>
          <h2>{title}</h2>
        </button>
        <span className="section-sub">{subtitle}</span>
      </div>
      <div className={`sec-body ${collapsed ? "collapsed" : ""}`}>
        <div className="sec-body-inner">{children}</div>
      </div>
    </section>
  );
}

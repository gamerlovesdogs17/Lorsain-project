import { useState, type ReactNode } from "react";

export type WhyFactor = {
  label: string;
  direction?: "support" | "oppose" | "neutral";
  weight?: number;
};

export type WhyPanelProps = {
  title?: string;
  summary?: string;
  factors: WhyFactor[];
  debug?: boolean;
  children?: ReactNode;
};

function isDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("lorsain-debug-why") === "1";
  } catch {
    return false;
  }
}

export function WhyPanel(props: WhyPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const showWeights = props.debug ?? isDebugEnabled();
  if (props.factors.length === 0 && !props.summary) return null;
  return (
    <div className="why-panel">
      <button
        type="button"
        className="why-panel-toggle"
        aria-expanded={expanded}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="why-panel-toggle-icon" aria-hidden>
          ?
        </span>
        <span>{props.title ?? "Why?"}</span>
        <span className="why-panel-chevron">{expanded ? "−" : "+"}</span>
      </button>
      {expanded ? (
        <div className="why-panel-body">
          {props.summary ? <p className="why-panel-summary">{props.summary}</p> : null}
          {props.factors.length > 0 ? (
            <ul className="why-panel-factors">
              {props.factors.map((f) => (
                <li
                  key={f.label}
                  className={`why-factor why-factor-${f.direction ?? "neutral"}`}
                >
                  <span className="why-factor-dir" aria-hidden>
                    {f.direction === "support" ? "+" : f.direction === "oppose" ? "−" : "·"}
                  </span>
                  <span className="why-factor-label">{f.label}</span>
                  {showWeights && f.weight != null ? (
                    <span className="why-factor-weight">{f.weight.toFixed(2)}</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
          {props.children}
        </div>
      ) : null}
    </div>
  );
}

export function DebugWhyToggle() {
  const [on, setOn] = useState(isDebugEnabled);
  return (
    <label className="debug-why-toggle">
      <input
        type="checkbox"
        checked={on}
        onChange={() => {
          const next = !on;
          setOn(next);
          try {
            window.localStorage.setItem("lorsain-debug-why", next ? "1" : "0");
          } catch {}
        }}
      />
      Debug weights
    </label>
  );
}

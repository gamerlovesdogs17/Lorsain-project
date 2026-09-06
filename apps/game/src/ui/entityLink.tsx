import type { ReactNode } from "react";

export type EntityLinkKind =
  | "Politician"
  | "Party"
  | "Province"
  | "Bill"
  | "Law"
  | "Court case"
  | "Election"
  | "Organization"
  | "Caucus"
  | "Amendment"
  | "Constituency"
  | "Office";

export type EntityLinkProps = {
  kind: EntityLinkKind;
  id: string;
  children?: ReactNode;
  label?: string;
  onNavigate?: ((kind: EntityLinkKind, id: string) => void) | undefined;
  className?: string;
};

const KIND_SCREEN: Record<EntityLinkKind, string> = {
  Politician: "career",
  Party: "party",
  Province: "terena",
  Bill: "assembly",
  Law: "assembly",
  "Court case": "courts",
  Election: "elections",
  Organization: "organizations",
  Caucus: "party",
  Amendment: "assembly",
  Constituency: "terena",
  Office: "executive",
};

export function entityKindIcon(kind: EntityLinkKind): string {
  switch (kind) {
    case "Politician":
      return "◉";
    case "Party":
    case "Caucus":
      return "◆";
    case "Province":
    case "Constituency":
      return "◎";
    case "Bill":
    case "Law":
      return "▣";
    case "Court case":
      return "⚖";
    case "Election":
      return "✓";
    case "Organization":
      return "◎";
    case "Amendment":
      return "▣";
    case "Office":
      return "★";
  }
}

export function entityScreen(kind: EntityLinkKind): string {
  return KIND_SCREEN[kind] ?? "home";
}

export function EntityLink(props: EntityLinkProps) {
  const display = props.children ?? props.label ?? props.id;
  if (!props.onNavigate) {
    return <span className={`entity-link no-nav ${props.className ?? ""}`}>{display}</span>;
  }
  return (
    <button
      type="button"
      className={`entity-link ${props.className ?? ""}`}
      onClick={() => props.onNavigate!(props.kind, props.id)}
      title={`View ${props.kind}: ${props.label ?? props.id}`}
    >
      <span className="entity-link-icon" aria-hidden>
        {entityKindIcon(props.kind)}
      </span>
      <span className="entity-link-label">{display}</span>
    </button>
  );
}

import type { ReactNode } from "react";

export function ListDetailPanel(props: {
  title: string;
  searchPlaceholder?: string;
  search: string;
  onSearch: (q: string) => void;
  list: ReactNode;
  detail: ReactNode;
  toolbar?: ReactNode;
}) {
  return (
    <div className="studio-list-detail">
      <aside className="studio-list-pane">
        <div className="studio-list-head">
          <h2>{props.title}</h2>
          {props.toolbar}
        </div>
        <input
          className="studio-list-search"
          type="search"
          placeholder={props.searchPlaceholder ?? "Filter…"}
          value={props.search}
          onChange={(e) => props.onSearch(e.target.value)}
        />
        <div className="studio-list-scroll">{props.list}</div>
      </aside>
      <section className="studio-detail-pane">{props.detail}</section>
    </div>
  );
}

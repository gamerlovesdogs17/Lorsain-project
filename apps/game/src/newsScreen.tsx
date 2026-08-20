import {
  storiesChronological,
  type KernelWorld,
  type MediaStory,
  type SimState,
} from "@lorsain/sim";
import { useMemo, useState } from "react";
import { EmptyState, PageHeader, TabBar } from "./ui/kit.js";
import { eventDisplay, mediaHeadlineForEvent, type PresentationCatalog } from "./presentation.js";

const TABS = [
  "all",
  "politics",
  "elections",
  "government",
  "economy",
  "courts",
  "organizations",
  "foreign",
] as const;

function eventKey(story: MediaStory): string {
  const source = story.sourceEventIds[0];
  if (source) return source;
  return `${story.date}:${story.factEventType}:${story.subjectIds.join(",")}`;
}

export function NewsPage(props: {
  world: KernelWorld;
  snap: SimState;
  catalog: PresentationCatalog;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");
  const groups = useMemo(() => {
    const all = storiesChronological(props.snap).filter((s) =>
      tab === "all" ? true : s.category === tab,
    );
    const map = new Map<string, { stories: MediaStory[]; importance: number }>();
    for (const s of all) {
      const key = eventKey(s);
      const cur = map.get(key) ?? { stories: [], importance: 0 };
      cur.stories.push(s);
      cur.importance = Math.max(cur.importance, s.importance);
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => {
      if (b.importance !== a.importance) return b.importance - a.importance;
      const ad = a.stories[0]?.date ?? "";
      const bd = b.stories[0]?.date ?? "";
      return bd < ad ? -1 : bd > ad ? 1 : 0;
    });
  }, [props.snap, tab]);

  return (
    <div>
      <PageHeader
        kicker="Press"
        title="News"
        subtitle="Coverage is selected from public events. Outlets may frame, not invent."
      />
      <TabBar tabs={TABS.map((id) => ({ id, label: id }))} value={tab} onChange={setTab} />
      {groups.length === 0 ? <EmptyState>No stories this month yet.</EmptyState> : null}
      {groups.map((group, i) => {
        const lead = group.stories[0]!;
        const sourceId = lead.sourceEventIds[0];
        const sourceEvent = sourceId
          ? props.snap.history.find((e) => e.id === sourceId)
          : undefined;
        const headline = sourceEvent
          ? eventDisplay(props.catalog, props.world, props.snap, sourceEvent)
          : lead.headlineKey === "Political developments" ||
              lead.headlineKey === "Political storm in Valen"
            ? mediaHeadlineForEvent(lead.factEventType, lead.framing)
            : lead.headlineKey;
        return (
          <article key={`${eventKey(lead)}-${i}`} className={`news-event${i === 0 ? " lead" : ""}`}>
            <div className="news-event-lead">
              <div className="kicker">
                {lead.category} · {lead.date}
              </div>
              <h3 className="serif-head">{headline}</h3>
            </div>
            <div className="outlet-treatments">
              {group.stories.map((s) => (
                <div key={s.id} className="outlet-treatment">
                  <strong>{props.world.mediaOutlets[s.outletId]?.name ?? s.outletId}</strong>
                  <span>
                    {s.headlineKey === "Political developments" ||
                    s.headlineKey === "Political storm in Valen"
                      ? mediaHeadlineForEvent(s.factEventType, s.framing)
                      : s.headlineKey}
                  </span>
                  <span className="muted">{s.framing}</span>
                </div>
              ))}
            </div>
          </article>
        );
      })}
    </div>
  );
}

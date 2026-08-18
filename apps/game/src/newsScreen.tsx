import { storiesChronological, type KernelWorld, type MediaStory, type SimState } from "@lorsain/sim";
import { useMemo, useState } from "react";
import { EmptyState, NewsItem, PageHeader, TabBar, LeadStory } from "./ui/kit.js";

const TABS = [
  "all",
  "politics",
  "elections",
  "government",
  "economy",
  "courts",
  "organizations",
] as const;

export function NewsPage(props: { world: KernelWorld; snap: SimState }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");
  const stories = useMemo(() => {
    const all = storiesChronological(props.snap);
    if (tab === "all") return all;
    return all.filter((s) => s.category === tab);
  }, [props.snap, tab]);

  return (
    <div>
      <PageHeader
        kicker="Press"
        title="News"
        subtitle="Coverage is selected from public events. Outlets may frame, not invent."
      />
      <TabBar tabs={TABS.map((id) => ({ id, label: id }))} value={tab} onChange={setTab} />
      {stories.length === 0 ? <EmptyState>No stories this month yet.</EmptyState> : null}
      {stories[0] ? (
        <LeadStory
          kicker={props.world.mediaOutlets[stories[0].outletId]?.name ?? stories[0].outletId}
          headline={stories[0].headlineKey}
          date={stories[0].date}
        />
      ) : null}
      {stories.slice(1).map((s: MediaStory) => (
        <NewsItem
          key={s.id}
          headline={s.headlineKey}
          outlet={props.world.mediaOutlets[s.outletId]?.name ?? s.outletId}
          date={s.date}
          category={s.category}
          summary={`${s.factEventType.replace(/_/g, " ")} · ${s.framing} framing`}
        />
      ))}
    </div>
  );
}

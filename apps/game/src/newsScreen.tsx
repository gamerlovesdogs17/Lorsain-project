import {
  storiesChronological,
  type KernelWorld,
  type MediaStory,
  type SimState,
} from "@lorsain/sim";
import { useMemo, useState } from "react";
import {
  EmptyState,
  LeadStory,
  PageHeader,
  SectionDivider,
  TabBar,
  WorkLayout,
} from "./ui/kit.js";
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

const PAGE_SIZE = 12;

function eventKey(story: MediaStory): string {
  const source = story.sourceEventIds[0];
  if (source) return source;
  return `${story.date}:${story.factEventType}:${story.subjectIds.join(",")}`;
}

function storyHeadline(
  catalog: PresentationCatalog,
  world: KernelWorld,
  snap: SimState,
  story: MediaStory,
): string {
  const sourceId = story.sourceEventIds[0];
  const sourceEvent = sourceId ? snap.history.find((e) => e.id === sourceId) : undefined;
  if (sourceEvent) return eventDisplay(catalog, world, snap, sourceEvent);
  if (
    story.headlineKey === "Political developments" ||
    story.headlineKey === "Political storm in Valen"
  ) {
    return mediaHeadlineForEvent(story.factEventType, story.framing);
  }
  return story.headlineKey;
}

function outletHeadline(story: MediaStory): string {
  if (
    story.headlineKey === "Political developments" ||
    story.headlineKey === "Political storm in Valen"
  ) {
    return mediaHeadlineForEvent(story.factEventType, story.framing);
  }
  return story.headlineKey;
}

type StoryGroup = {
  key: string;
  stories: MediaStory[];
  importance: number;
  category: string;
  date: string;
};

export function NewsPage(props: {
  world: KernelWorld;
  snap: SimState;
  catalog: PresentationCatalog;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");
  const [page, setPage] = useState(0);

  const groups = useMemo(() => {
    const all = storiesChronological(props.snap).filter((s) =>
      tab === "all" ? true : s.category === tab,
    );
    const map = new Map<string, StoryGroup>();
    for (const s of all) {
      const key = eventKey(s);
      const cur = map.get(key) ?? {
        key,
        stories: [],
        importance: 0,
        category: s.category,
        date: s.date,
      };
      cur.stories.push(s);
      cur.importance = Math.max(cur.importance, s.importance);
      if (s.date > cur.date) cur.date = s.date;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => {
      if (b.importance !== a.importance) return b.importance - a.importance;
      return b.date < a.date ? -1 : b.date > a.date ? 1 : 0;
    });
  }, [props.snap, tab]);

  const lead = groups[0] ?? null;
  const secondary = groups.slice(1, 3);
  const rest = groups.slice(3);
  const pageCount = Math.max(1, Math.ceil(rest.length / PAGE_SIZE) || 1);
  const pageIndex = Math.min(Math.max(0, page), pageCount - 1);
  const pagedRest = rest.slice(pageIndex * PAGE_SIZE, pageIndex * PAGE_SIZE + PAGE_SIZE);

  const byTopic = (() => {
    const map = new Map<string, StoryGroup[]>();
    for (const g of pagedRest) {
      const list = map.get(g.category) ?? [];
      list.push(g);
      map.set(g.category, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  })();

  function renderOutlets(group: StoryGroup) {
    return (
      <div className="outlet-treatments">
        {group.stories.map((s) => (
          <div key={s.id} className="outlet-treatment">
            <strong>{props.world.mediaOutlets[s.outletId]?.name ?? s.outletId}</strong>
            <span>{outletHeadline(s)}</span>
            <span className="muted">{s.framing}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <WorkLayout
      header={
        <PageHeader
          kicker="Press"
          title="News"
          subtitle="Coverage selected from public events. Outlets may frame, not invent."
        />
      }
      main={
        <>
          <TabBar
            tabs={TABS.map((id) => ({ id, label: id }))}
            value={tab}
            onChange={(id) => {
              setTab(id);
              setPage(0);
            }}
          />

          {groups.length === 0 ? <EmptyState>No stories this month yet.</EmptyState> : null}

          {lead ? (
            <section className="news-lead">
              <LeadStory
                kicker={`${lead.category} · ${lead.date}`}
                headline={storyHeadline(props.catalog, props.world, props.snap, lead.stories[0]!)}
                date={`${lead.stories.length} outlet${lead.stories.length === 1 ? "" : "s"}`}
              />
              {renderOutlets(lead)}
            </section>
          ) : null}

          {secondary.length > 0 ? (
            <>
              <SectionDivider title="Also in the press" />
              <div className="news-secondary">
                {secondary.map((group) => (
                  <article key={group.key} className="news-secondary-item">
                    <div className="kicker">
                      {group.category} · {group.date}
                    </div>
                    <h3 className="serif-head">
                      {storyHeadline(props.catalog, props.world, props.snap, group.stories[0]!)}
                    </h3>
                    {renderOutlets(group)}
                  </article>
                ))}
              </div>
            </>
          ) : null}

          {byTopic.length > 0 ? (
            <>
              <SectionDivider
                title="By topic"
                {...(rest.length > PAGE_SIZE
                  ? {
                      hint: `Showing ${pageIndex * PAGE_SIZE + 1}–${Math.min((pageIndex + 1) * PAGE_SIZE, rest.length)} of ${rest.length}`,
                    }
                  : {})}
              />
              {byTopic.map(([category, topicGroups]) => (
                <section key={category} className="news-topic-group">
                  <h4 className="news-topic-label">{category}</h4>
                  {topicGroups.map((group) => (
                    <article key={group.key} className="news-topic-item">
                      <div className="kicker">{group.date}</div>
                      <h4 className="serif-head">
                        {storyHeadline(props.catalog, props.world, props.snap, group.stories[0]!)}
                      </h4>
                      {renderOutlets(group)}
                    </article>
                  ))}
                </section>
              ))}
              {pageCount > 1 ? (
                <div className="pager">
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={pageIndex <= 0}
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                  >
                    Previous
                  </button>
                  <span className="muted">
                    Page {pageIndex + 1} of {pageCount}
                  </span>
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={pageIndex >= pageCount - 1}
                    onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  >
                    Next
                  </button>
                </div>
              ) : null}
            </>
          ) : null}
        </>
      }
    />
  );
}

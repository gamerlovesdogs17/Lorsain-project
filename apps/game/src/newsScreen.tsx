import {
  articleStructureFor,
  buildArticleBody,
  storiesChronological,
  type KernelWorld,
  type MediaStory,
  type SimState,
} from "@lorsain/sim";
import { useMemo, useState } from "react";
import { EmptyState, LeadStory, PageHeader, SectionDivider, TabBar, WorkLayout } from "./ui/kit.js";
import {
  eventDisplay,
  mediaHeadlineForEvent,
  partyDisplayName,
  politicianDisplayName,
  type PresentationCatalog,
} from "./presentation.js";
import { EntityLink, type EntityLinkKind } from "./ui/entityLink.js";

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
  onEntityNavigate?: (kind: EntityLinkKind, id: string) => void;
}) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("all");
  const [selectedOutletId, setSelectedOutletId] = useState<string>("all");
  const [page, setPage] = useState(0);
  const [selectedStoryKey, setSelectedStoryKey] = useState<string | null>(null);

  const groups = useMemo(() => {
    const all = storiesChronological(props.snap).filter(
      (s) =>
        (tab === "all" || s.category === tab) &&
        (selectedOutletId === "all" || s.outletId === selectedOutletId),
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
  }, [props.snap, selectedOutletId, tab]);

  const outlets = Object.values(props.world.mediaOutlets).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const selectedOutlet =
    selectedOutletId === "all" ? null : (props.world.mediaOutlets[selectedOutletId] ?? null);

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
  const selectedGroup = selectedStoryKey
    ? (groups.find((group) => group.key === selectedStoryKey) ?? null)
    : null;

  function articleDeck(group: StoryGroup): string {
    const primary = group.stories[0]!;
    const sourceId = primary.sourceEventIds[0];
    const sourceEvent = sourceId
      ? (props.snap.history.find((event) => event.id === sourceId) ?? null)
      : null;
    const facts = publicEventDetails(sourceEvent);
    if (facts.length > 0) {
      return `${facts.slice(0, 2).join(". ")}.`;
    }
    const category = group.category;
    if (category === "elections")
      return "The race moved into a new public phase as campaigns, parties and voters assessed the latest development.";
    if (category === "economy")
      return "The development adds to the public record on economic conditions and the choices facing Terenan institutions.";
    if (category === "courts")
      return "The constitutional and legal consequences now form part of the public institutional record.";
    if (category === "foreign")
      return "Officials and the press are assessing the diplomatic consequences for Terena and its partners.";
    if (category === "organizations")
      return "Political organizations are responding publicly as the issue moves through Terenan politics.";
    if (category === "government")
      return "The development now moves through the institutions responsible for public action and oversight.";
    return "The development is reshaping the current political argument and the choices facing elected officials.";
  }

  function publicEventDetails(event: SimState["history"][number] | null): string[] {
    if (!event) return [];
    const details: string[] = [];
    const payload = event.payload;
    const winnerId = typeof payload.winnerId === "string" ? payload.winnerId : null;
    const partyId = typeof payload.partyId === "string" ? payload.partyId : null;
    const provinceId = typeof payload.provinceId === "string" ? payload.provinceId : null;
    const billId = typeof payload.billId === "string" ? payload.billId : null;
    const lawId = typeof payload.lawId === "string" ? payload.lawId : null;
    const electionId = typeof payload.electionId === "string" ? payload.electionId : null;
    const officeId = typeof payload.officeId === "string" ? payload.officeId : null;
    const amendmentId = typeof payload.amendmentId === "string" ? payload.amendmentId : null;
    const organizationId =
      typeof payload.organizationId === "string" ? payload.organizationId : null;
    const countryId =
      typeof payload.countryId === "string"
        ? payload.countryId
        : typeof payload.targetCountryId === "string"
          ? payload.targetCountryId
          : null;
    if (winnerId) details.push(`Winner: ${politicianDisplayName(props.catalog, winnerId)}`);
    if (partyId) details.push(`Party: ${partyDisplayName(props.world, partyId, props.snap)}`);
    if (provinceId)
      details.push(`Province: ${props.catalog.places.get(provinceId)?.name ?? "Province"}`);
    if (officeId) details.push(`Office: ${props.world.offices[officeId]?.title ?? officeId}`);
    if (billId) {
      const bill =
        props.snap.legislatureRuntime.bills[billId] ??
        props.snap.provincialRuntime.bills[billId] ??
        null;
      details.push(
        `Bill: ${bill?.title ?? (typeof payload.title === "string" ? payload.title : billId)}`,
      );
    } else if (typeof payload.title === "string" && payload.title.length > 0) {
      details.push(`Measure: ${payload.title}`);
    }
    if (lawId) {
      const law = props.snap.legislatureRuntime.enactedLaws[lawId];
      details.push(`Law: ${law?.title ?? lawId}`);
    }
    if (electionId) details.push(`Election: ${electionId}`);
    if (amendmentId) {
      const amendment = props.snap.provincialRuntime.constitutionalAmendments[amendmentId];
      details.push(`Amendment: ${amendment?.title ?? amendmentId}`);
    }
    if (organizationId) {
      const orgName =
        props.world.interestOrganizations[organizationId]?.name ??
        (typeof payload.organizationName === "string" ? payload.organizationName : organizationId);
      details.push(`Organization: ${orgName}`);
    }
    if (countryId) {
      details.push(`Foreign actor: ${props.world.worldCountries[countryId]?.name ?? countryId}`);
    }
    if (typeof payload.yes === "number" && typeof payload.no === "number")
      details.push(
        `Recorded vote: ${payload.yes} aye, ${payload.no} nay${typeof payload.abstain === "number" ? `, ${payload.abstain} abstaining` : ""}`,
      );
    if (typeof payload.uphold === "number" && typeof payload.invalidate === "number")
      details.push(
        `Court holding: ${payload.uphold}–${payload.invalidate} (${String(payload.disposition ?? "decision")})`,
      );
    if (typeof payload.margin === "number") details.push(`Margin: ${payload.margin}`);
    else if (typeof payload.finalMargin === "number")
      details.push(`Margin: ${payload.finalMargin}`);
    if (typeof payload.seats === "number") details.push(`Seats filled: ${payload.seats}`);
    if (typeof payload.seatCount === "number") details.push(`Seats: ${payload.seatCount}`);
    if (typeof payload.constituencies === "number")
      details.push(`Constituencies counted: ${payload.constituencies}`);
    if (typeof payload.turnoutRate === "number")
      details.push(`Turnout: ${(payload.turnoutRate * 100).toFixed(1)}%`);
    if (typeof payload.ratifyingProvinces === "number")
      details.push(`Provinces ratifying: ${payload.ratifyingProvinces}`);
    if (typeof payload.role === "string")
      details.push(`Role: ${payload.role.replaceAll("_", " ")}`);
    if (typeof payload.behavior === "string")
      details.push(`Organization action: ${payload.behavior.replaceAll("_", " ")}`);
    return details;
  }

  function articleBodyParagraphs(
    group: StoryGroup,
    sourceEvent: SimState["history"][number] | null,
    details: string[],
  ): string[] {
    const primary = group.stories[0]!;
    const stored = primary.publicEffects?.bodyStructure;
    const structure =
      stored === "consequence_first" ||
      stored === "event_first" ||
      stored === "institutional" ||
      stored === "political_reaction" ||
      stored === "regional"
        ? stored
        : articleStructureFor(primary);
    const headline = sourceEvent
      ? eventDisplay(props.catalog, props.world, props.snap, sourceEvent)
      : outletHeadline(primary);
    const provinceId =
      sourceEvent && typeof sourceEvent.payload.provinceId === "string"
        ? sourceEvent.payload.provinceId
        : null;
    const provinceHint = provinceId
      ? (props.catalog.places.get(provinceId)?.name ?? provinceId)
      : null;
    return buildArticleBody({
      structure,
      headline,
      date: group.date,
      category: group.category,
      framing: primary.framing,
      provinceHint,
      outletName: props.world.mediaOutlets[primary.outletId]?.name ?? null,
      facts: details,
    });
  }

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

  if (selectedGroup) {
    const primary = selectedGroup.stories[0]!;
    const sourceId = primary.sourceEventIds[0];
    const sourceEvent = sourceId
      ? (props.snap.history.find((event) => event.id === sourceId) ?? null)
      : null;
    const relatedPoliticians = primary.subjectIds.filter((id) =>
      Boolean(props.snap.politicians[id]),
    );
    const publicDetails = publicEventDetails(sourceEvent);
    const bodyParagraphs = articleBodyParagraphs(selectedGroup, sourceEvent, publicDetails);
    return (
      <WorkLayout
        header={
          <PageHeader
            kicker={selectedOutlet?.name ?? "News desk"}
            title="Article"
            subtitle={
              selectedOutlet
                ? `An article from the ${selectedOutlet.name} archive; its framing remains distinct from the public fact.`
                : "One public event, with each outlet's framing kept distinct from the underlying facts."
            }
          />
        }
        main={
          <article className="news-article-reader">
            <button
              type="button"
              className="news-article-back"
              onClick={() => setSelectedStoryKey(null)}
            >
              ← Back to front page
            </button>
            <header className="news-article-header">
              <div className="news-article-masthead">
                {selectedOutlet?.name.toUpperCase() ?? "THE TERENA POLITICAL DESK"}
              </div>
              <div className="kicker">
                {selectedGroup.category} · {selectedGroup.date}
              </div>
              <h1>{storyHeadline(props.catalog, props.world, props.snap, primary)}</h1>
              <p className="news-article-deck">{articleDeck(selectedGroup)}</p>
              <div className="news-article-byline">
                Public record · {selectedGroup.stories.length} outlet treatment
                {selectedGroup.stories.length === 1 ? "" : "s"}
              </div>
            </header>
            <div className="news-article-copy">
              {bodyParagraphs.map((paragraph) => (
                <p
                  key={paragraph}
                  className={paragraph === bodyParagraphs[0] ? "news-article-lede" : undefined}
                >
                  {paragraph}
                </p>
              ))}
              {publicDetails.length > 0 ? (
                <dl className="news-article-facts">
                  {publicDetails.map((detail) => {
                    const [label, ...rest] = detail.split(": ");
                    return (
                      <div key={detail}>
                        <dt>{label}</dt>
                        <dd>{rest.join(": ")}</dd>
                      </div>
                    );
                  })}
                </dl>
              ) : null}
              {relatedPoliticians.length > 0 ? (
                <aside className="news-article-figures">
                  <strong>Figures in this story</strong>
                  {relatedPoliticians.map((id) => (
                    <EntityLink
                      key={id}
                      kind="Politician"
                      id={id}
                      label={politicianDisplayName(props.catalog, id)}
                      onNavigate={props.onEntityNavigate}
                    />
                  ))}
                </aside>
              ) : null}
              <h2>How the press covered it</h2>
              <div className="news-article-outlets">
                {selectedGroup.stories.map((story) => (
                  <section key={story.id}>
                    <div>
                      <strong>
                        {props.world.mediaOutlets[story.outletId]?.name ?? "Terenan press"}
                      </strong>
                      <span>{story.framing} framing</span>
                    </div>
                    <h3>{outletHeadline(story)}</h3>
                    <p>
                      {story.framing === "critical"
                        ? "Coverage emphasizes scrutiny, political risk and the case made by opponents."
                        : story.framing === "sympathetic"
                          ? "Coverage emphasizes the case made by supporters and the intended public purpose."
                          : story.framing === "sensational"
                            ? "Coverage leads with conflict and immediate political consequence."
                            : "Coverage leads with the institutional facts and the next formal step."}
                    </p>
                  </section>
                ))}
              </div>
              <footer className="news-article-record">
                This article is generated from saved public events. Outlet framing does not alter
                the recorded result.
              </footer>
            </div>
          </article>
        }
      />
    );
  }

  return (
    <div className="news-paper">
      <WorkLayout
        header={
          <PageHeader
            kicker="Terenan press"
            title={selectedOutlet?.name ?? "The Front Page"}
            subtitle={
              selectedOutlet
                ? `${selectedOutlet.name} front page and archive. Headlines reflect its public framing; recorded events remain unchanged.`
                : "A state-aware press desk. Outlets may frame coverage; they do not invent results."
            }
          />
        }
        main={
          <>
            <nav className="news-outlet-switcher" aria-label="News outlet front pages">
              <button
                type="button"
                className={selectedOutletId === "all" ? "active" : ""}
                onClick={() => {
                  setSelectedOutletId("all");
                  setPage(0);
                  setSelectedStoryKey(null);
                }}
              >
                All Press
              </button>
              {outlets.map((outlet) => (
                <button
                  type="button"
                  className={selectedOutletId === outlet.id ? "active" : ""}
                  key={outlet.id}
                  onClick={() => {
                    setSelectedOutletId(outlet.id);
                    setPage(0);
                    setSelectedStoryKey(null);
                  }}
                >
                  {outlet.name}
                </button>
              ))}
            </nav>
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
                <button
                  type="button"
                  className="news-open-story news-open-lead"
                  onClick={() => setSelectedStoryKey(lead.key)}
                >
                  <LeadStory
                    kicker={`${lead.category} · ${lead.date}`}
                    headline={storyHeadline(
                      props.catalog,
                      props.world,
                      props.snap,
                      lead.stories[0]!,
                    )}
                    date={`${lead.stories.length} outlet${lead.stories.length === 1 ? "" : "s"}`}
                  />
                  <span>Read / compare coverage →</span>
                </button>
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
                      <button
                        type="button"
                        className="news-open-story"
                        onClick={() => setSelectedStoryKey(group.key)}
                      >
                        <h3 className="serif-head">
                          {storyHeadline(props.catalog, props.world, props.snap, group.stories[0]!)}
                        </h3>
                        <span>Read →</span>
                      </button>
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
                        <button
                          type="button"
                          className="news-open-story"
                          onClick={() => setSelectedStoryKey(group.key)}
                        >
                          <h4 className="serif-head">
                            {storyHeadline(
                              props.catalog,
                              props.world,
                              props.snap,
                              group.stories[0]!,
                            )}
                          </h4>
                          <span>Read →</span>
                        </button>
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
    </div>
  );
}

import {
  MAX_ORG_MEETINGS_PER_MONTH,
  type CommandResult,
  type KernelWorld,
  type SimState,
  type Simulation,
} from "@lorsain/sim";
import { useEffect, useMemo, useState } from "react";
import {
  ActionPanel,
  DataTable,
  EmptyState,
  EntityHeader,
  EntityRow,
  MasterDetail,
  MetricStrip,
  PageHeader,
  SectionDivider,
  StatCard,
  StatusBadge,
  WorkLayout,
} from "./ui/kit.js";
import {
  issueDisplayName,
  politicianDisplayName,
  type PresentationCatalog,
} from "./presentation.js";
import { relationshipPublicLabel } from "./presentation/display.js";

export function OrganizationsPage(props: {
  world: KernelWorld;
  snap: SimState;
  sim: Simulation;
  catalog: PresentationCatalog;
  onDone: () => void;
  report: (r: CommandResult) => boolean;
  globalFocus?: { kind: string; id: string } | null;
}) {
  const ids = Object.keys(props.world.interestOrganizations).sort();
  const [sel, setSel] = useState(ids[0] ?? "");
  useEffect(() => {
    if (
      props.globalFocus?.kind === "Organization" &&
      props.world.interestOrganizations[props.globalFocus.id]
    ) {
      setSel(props.globalFocus.id);
    }
  }, [props.globalFocus, props.world]);
  const canon = props.world.interestOrganizations[sel];
  const actor = props.snap.organizationRuntime.actors[sel];
  const remaining = MAX_ORG_MEETINGS_PER_MONTH - props.snap.organizationRuntime.meetingsThisMonth;
  const campaign = Object.values(props.snap.campaignRuntime.campaigns).find(
    (c) =>
      c.politicianId === props.snap.playerPoliticianId &&
      (c.status === "active" || c.status === "exploring"),
  );
  const relationship = actor?.relationships[props.snap.playerPoliticianId];
  const knownLabel = relationshipPublicLabel(relationship?.affinity);
  const trustLabel = relationshipPublicLabel(relationship?.trust);
  const alignmentLabel = relationshipPublicLabel(relationship?.policyAlignment);
  const currentStance =
    actor?.billPressure.find((pressure) => pressure.stance !== "watch")?.stance ?? "watch";
  const bills = Object.values(props.snap.legislatureRuntime.bills).filter((b) =>
    ["committee", "floor_scheduled", "sent_to_president"].includes(b.status),
  );
  const scorecard = Object.values(props.snap.legislatureRuntime.legislativeVotes)
    .flatMap((vote) => {
      const choice = vote.votes[props.snap.playerPoliticianId];
      const bill = props.snap.legislatureRuntime.bills[vote.billId];
      if (
        !choice ||
        !bill ||
        !bill.policyItems.some((item) => canon?.issues.includes(item.issueId))
      )
        return [];
      const pressure = actor?.billPressure.find((item) => item.billId === bill.id);
      const aligned = pressure
        ? (pressure.stance === "support" && choice === "yes") ||
          (pressure.stance === "oppose" && choice === "no")
        : null;
      return [{ id: vote.id, date: vote.date, bill, choice, pressure, aligned }];
    })
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 12);
  const influenceLabel = !canon
    ? "—"
    : canon.strength >= 0.75
      ? "National heavyweight"
      : canon.strength >= 0.55
        ? "Strong national voice"
        : canon.strength >= 0.35
          ? "Established advocate"
          : "Specialist association";

  function run(type: "meet" | "endorse" | "bill", billId?: string) {
    if (!sel) return;
    if (type === "meet") {
      props.report(props.sim.executeCommand({ type: "MEET_ORGANIZATION", organizationId: sel }));
    } else if (type === "endorse" && campaign) {
      props.report(
        props.sim.executeCommand({
          type: "SEEK_ORGANIZATION_ENDORSEMENT",
          organizationId: sel,
          campaignId: campaign.id,
        }),
      );
    } else if (type === "bill" && billId) {
      props.report(
        props.sim.executeCommand({
          type: "ASK_ORGANIZATION_BILL_SUPPORT",
          organizationId: sel,
          billId,
        }),
      );
    }
    props.onDone();
  }

  const list = useMemo(
    () =>
      ids.map((id) => ({
        id,
        name: props.world.interestOrganizations[id]?.name ?? "Unknown organization",
        type: props.world.interestOrganizations[id]?.type ?? "",
        lean: props.world.interestOrganizations[id]?.lean ?? "",
      })),
    [ids, props.world],
  );

  return (
    <WorkLayout
      header={
        <PageHeader
          kicker="Civil society"
          title="Organizations"
          subtitle={`${remaining} interaction${remaining === 1 ? "" : "s"} remaining this month`}
        />
      }
      main={
        <MasterDetail
          listWidth="narrow"
          list={
            <>
              <SectionDivider title="Directory" />
              {list.length === 0 ? <EmptyState>No civil society organizations are active in this scenario. Organizations appear when interest groups form or are loaded from scenario data.</EmptyState> : null}
              {list.map((o) => (
                <EntityRow
                  key={o.id}
                  title={o.name}
                  meta={[o.type, o.lean].filter(Boolean).join(" · ")}
                  selected={sel === o.id}
                  onClick={() => setSel(o.id)}
                />
              ))}
            </>
          }
          detail={
            canon ? (
              <>
                <EntityHeader name={canon.name} office={canon.type} party={canon.lean} />

                <SectionDivider title="Public profile" />
                <p>
                  Influence <StatusBadge>{influenceLabel}</StatusBadge>
                </p>
                <p className="muted">
                  Issues: {canon.issues.map((i) => issueDisplayName(props.catalog, i)).join(", ")}
                </p>
                <MetricStrip>
                  <StatCard label="Relationship" value={knownLabel} />
                  <StatCard label="Trust" value={trustLabel} />
                  <StatCard label="Policy alignment" value={alignmentLabel} />
                  <StatCard
                    label="Current stance"
                    value={
                      currentStance === "support"
                        ? "Supportive"
                        : currentStance === "oppose"
                          ? "Opposed"
                          : "Watching"
                    }
                  />
                </MetricStrip>
                {relationship?.lastReason ? (
                  <p className="muted">Latest change: {relationship.lastReason}</p>
                ) : null}
                <p className="muted">
                  Current public positions are issue leanings, not hidden scores.
                </p>

                <SectionDivider
                  title="Political scorecard"
                  hint="Public behavior, not meeting grind"
                />
                {scorecard.length === 0 ? (
                  <EmptyState>No relevant recorded vote by this politician.</EmptyState>
                ) : (
                  <DataTable dense headers={["Date", "Measure", "Your vote", "Organization"]}>
                    {scorecard.map((row) => (
                      <tr key={row.id}>
                        <td>{row.date}</td>
                        <td>{row.bill.title}</td>
                        <td>
                          {row.choice === "yes" ? "Aye" : row.choice === "no" ? "Nay" : "Abstain"}
                        </td>
                        <td>
                          {row.pressure ? (
                            <StatusBadge tone={row.aligned ? "ok" : "warn"}>
                              {row.aligned ? "Aligned" : "At odds"}
                            </StatusBadge>
                          ) : (
                            "No formal position"
                          )}
                        </td>
                      </tr>
                    ))}
                  </DataTable>
                )}

                <SectionDivider title="Positions and support" />
                {actor?.billPressure.length ? (
                  actor.billPressure.map((p) => (
                    <EntityRow
                      key={p.billId}
                      title={props.snap.legislatureRuntime.bills[p.billId]?.title ?? "Public bill"}
                      status={p.stance}
                    />
                  ))
                ) : (
                  <EmptyState>No current bill positions.</EmptyState>
                )}
                {actor?.endorsements.length ? (
                  actor.endorsements.map((e, i) => (
                    <EntityRow
                      key={`${e.politicianId}-${i}`}
                      title={`Endorsed ${politicianDisplayName(props.catalog, e.politicianId)}`}
                      meta={`${e.date}${e.status === "withdrawn" ? ` · withdrawn ${e.withdrawnDate ?? ""}` : " · active"}`}
                    />
                  ))
                ) : (
                  <EmptyState>No historical endorsements yet.</EmptyState>
                )}

                <SectionDivider title="Player interactions" />
                <ActionPanel title="Actions">
                  <button
                    type="button"
                    className="btn"
                    disabled={remaining <= 0}
                    onClick={() => run("meet")}
                  >
                    Meet
                  </button>
                  <button
                    type="button"
                    className="btn secondary"
                    disabled={remaining <= 0 || !campaign}
                    onClick={() => run("endorse")}
                  >
                    Seek endorsement
                  </button>
                  {bills[0] ? (
                    <button
                      type="button"
                      className="btn secondary"
                      disabled={remaining <= 0}
                      onClick={() => run("bill", bills[0]!.id)}
                    >
                      Ask support on {bills[0].title}
                    </button>
                  ) : null}
                  {canon.issues[0] ? (
                    <button
                      type="button"
                      className="btn secondary"
                      disabled={remaining <= 0}
                      onClick={() => {
                        props.report(
                          props.sim.executeCommand({
                            type: "DISCUSS_ORGANIZATION_POLICY",
                            organizationId: sel,
                            issueId: canon.issues[0]!,
                            direction: 1,
                          }),
                        );
                        props.onDone();
                      }}
                    >
                      Discuss {issueDisplayName(props.catalog, canon.issues[0])}
                    </button>
                  ) : null}
                </ActionPanel>

                <SectionDivider title="Recent public actions" />
                {(actor?.recentActions ?? []).length === 0 ? (
                  <EmptyState>No recent public actions.</EmptyState>
                ) : (
                  (actor?.recentActions ?? []).map((a, i) => (
                    <EntityRow key={`${a.date}-${i}`} title={a.summary} meta={a.date} />
                  ))
                )}
              </>
            ) : (
              <EmptyState>No canonical organizations loaded.</EmptyState>
            )
          }
        />
      }
    />
  );
}

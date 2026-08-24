import {
  MAX_ORG_MEETINGS_PER_MONTH,
  type CommandResult,
  type KernelWorld,
  type SimState,
  type Simulation,
} from "@lorsain/sim";
import { useMemo, useState } from "react";
import {
  ActionPanel,
  EmptyState,
  EntityHeader,
  EntityRow,
  MasterDetail,
  PageHeader,
  SectionDivider,
  StatusBadge,
  WorkLayout,
} from "./ui/kit.js";
import { issueDisplayName, politicianDisplayName, type PresentationCatalog } from "./presentation.js";
import { relationshipPublicLabel } from "./presentation/display.js";

export function OrganizationsPage(props: {
  world: KernelWorld;
  snap: SimState;
  sim: Simulation;
  catalog: PresentationCatalog;
  onDone: () => void;
  report: (r: CommandResult) => boolean;
}) {
  const ids = Object.keys(props.world.interestOrganizations).sort();
  const [sel, setSel] = useState(ids[0] ?? "");
  const canon = props.world.interestOrganizations[sel];
  const actor = props.snap.organizationRuntime.actors[sel];
  const remaining = MAX_ORG_MEETINGS_PER_MONTH - props.snap.organizationRuntime.meetingsThisMonth;
  const campaign = Object.values(props.snap.campaignRuntime.campaigns).find(
    (c) =>
      c.politicianId === props.snap.playerPoliticianId &&
      (c.status === "active" || c.status === "exploring"),
  );
  const known = actor?.relationships[props.snap.playerPoliticianId]?.affinity;
  const knownLabel = relationshipPublicLabel(known);
  const bills = Object.values(props.snap.legislatureRuntime.bills).filter((b) =>
    ["committee", "floor_scheduled", "sent_to_president"].includes(b.status),
  );

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
              {list.length === 0 ? <EmptyState>No organizations loaded.</EmptyState> : null}
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
                  Strength <StatusBadge>{canon.strength.toFixed(2)}</StatusBadge>
                </p>
                <p className="muted">
                  Issues: {canon.issues.map((i) => issueDisplayName(props.catalog, i)).join(", ")}
                </p>
                <p className="muted">Known relationship: {knownLabel}</p>
                <p className="muted">Current public positions are issue leanings, not hidden scores.</p>

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
                      meta={e.date}
                    />
                  ))
                ) : (
                  <EmptyState>No historical endorsements yet.</EmptyState>
                )}

                <SectionDivider title="Player interactions" />
                <ActionPanel title="Actions">
                  <button type="button" className="btn" disabled={remaining <= 0} onClick={() => run("meet")}>
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

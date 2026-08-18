import {
  MAX_ORG_MEETINGS_PER_MONTH,
  type CommandResult,
  type KernelWorld,
  type SimState,
  type Simulation,
} from "@lorsain/sim";
import { useMemo, useState } from "react";
import { ActionPanel, EmptyState, EntityHeader, PageHeader, SectionCard, StatusBadge } from "./ui/kit.js";
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
    (c) => c.politicianId === props.snap.playerPoliticianId && (c.status === "active" || c.status === "exploring"),
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
        name: props.world.interestOrganizations[id]?.name ?? id,
        type: props.world.interestOrganizations[id]?.type ?? "",
      })),
    [ids, props.world],
  );

  return (
    <div>
      <PageHeader
        kicker="Civil society"
        title="Organizations"
        subtitle={`${remaining} interaction${remaining === 1 ? "" : "s"} remaining this month`}
      />
      <div className="dash dash-2">
        <SectionCard title="Directory">
          {list.map((o) => (
            <button
              key={o.id}
              type="button"
              className={`pick ${sel === o.id ? "active" : ""}`}
              onClick={() => setSel(o.id)}
            >
              <strong>{o.name}</strong>
              <div className="muted">{o.type}</div>
            </button>
          ))}
        </SectionCard>
        <div>
          {canon ? (
            <>
              <EntityHeader name={canon.name} office={canon.type} party={canon.lean} />
              <SectionCard title="Public profile">
                <p>
                  Strength <StatusBadge>{canon.strength.toFixed(2)}</StatusBadge>
                </p>
                <p className="muted">
                  Issues: {canon.issues.map((i) => issueDisplayName(props.catalog, i)).join(", ")}
                </p>
                <p className="muted">Known relationship: {knownLabel}</p>
                <p className="muted">Current public positions are issue leanings, not hidden scores.</p>
              </SectionCard>
              <SectionCard title="Positions and support">
                {actor?.billPressure.length ? (
                  actor.billPressure.map((p) => <div key={p.billId}>{p.billId} · {p.stance}</div>)
                ) : (
                  <EmptyState>No current bill positions.</EmptyState>
                )}
                {actor?.endorsements.length ? (
                  actor.endorsements.map((e, i) => (
                    <div key={`${e.politicianId}-${i}`}>
                      Endorsed {politicianDisplayName(props.catalog, e.politicianId)} ({e.date})
                    </div>
                  ))
                ) : (
                  <EmptyState>No historical endorsements yet.</EmptyState>
                )}
              </SectionCard>
              <ActionPanel title="Player interactions">
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
              <SectionCard title="Recent public actions">
                {(actor?.recentActions ?? []).map((a, i) => (
                  <div key={`${a.date}-${i}`} className="muted">
                    {a.date} · {a.summary}
                  </div>
                ))}
              </SectionCard>
            </>
          ) : (
            <EmptyState>No canonical organizations loaded.</EmptyState>
          )}
        </div>
      </div>
    </div>
  );
}

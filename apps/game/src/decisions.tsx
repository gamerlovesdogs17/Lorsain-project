import type { Command, KernelWorld, SimState, Simulation } from "@lorsain/sim";
import { collectPlayerActionableDecisions } from "@lorsain/sim";
import type { CommandResult } from "@lorsain/sim";
import { isPresident } from "./format.js";
import { foreignPresidentialActionLabel } from "./presentation.js";
import { interruptDisplay } from "./presentation/display.js";

function VoteRow({
  label,
  onCast,
}: {
  label: string;
  onCast: (c: "yes" | "no" | "abstain") => void;
}) {
  return (
    <div className="row" style={{ marginTop: "0.4rem" }}>
      <span>{label}</span>
      <button type="button" className="btn" onClick={() => onCast("yes")}>
        Yes
      </button>
      <button type="button" className="btn secondary" onClick={() => onCast("no")}>
        No
      </button>
      <button type="button" className="btn secondary" onClick={() => onCast("abstain")}>
        Abstain
      </button>
    </div>
  );
}

export function DecisionPanel(props: {
  world: KernelWorld;
  snap: SimState;
  sim: Simulation;
  onDone: () => void;
  report: (result: CommandResult) => boolean;
  countingElection: boolean;
  onResolveAssembly: () => void;
  onResolvePresidential: () => void;
}) {
  const { snap, sim, world } = props;
  const interrupt = snap.pendingInterrupt;
  const decisions = collectPlayerActionableDecisions(world, snap);
  const president = isPresident(world, snap, snap.playerPoliticianId);
  const warTrigger = snap.executiveRuntime.warTrigger;
  if (decisions.length === 0 && !(president && warTrigger)) return null;

  function run(command: Command) {
    props.report(sim.executeCommand(command));
    props.onDone();
  }

  const votes = decisions.filter(
    (d) =>
      d.kind !== "interrupt" &&
      d.kind !== "sign_bill" &&
      d.kind !== "foreign_presidential_action" &&
      d.kind !== "assembly_filing",
  );
  const signs = decisions.filter((d) => d.kind === "sign_bill");
  const incomingDiplomacy = decisions.filter((d) => d.kind === "foreign_presidential_action");
  const assemblyFiling = decisions.filter((d) => d.kind === "assembly_filing");

  return (
    <div className="alert">
      <strong>Required decisions</strong>
      <p className="muted">
        {decisions.length} item{decisions.length === 1 ? "" : "s"} need your action before the month
        can close without abstention.
      </p>
      {interrupt ? (
        <div>
          <div>{interruptDisplay(interrupt)}</div>
          {interrupt.code === "PRESIDENTIAL_ELECTION_DUE" ? (
            <button
              type="button"
              className="btn"
              onClick={props.onResolvePresidential}
            >
              Resolve presidential election
            </button>
          ) : interrupt.code === "ASSEMBLY_ELECTION_DUE" ? (
            <button
              type="button"
              className="btn"
              disabled={props.countingElection}
              onClick={props.onResolveAssembly}
            >
              {props.countingElection ? "Counting election…" : "Resolve Assembly election"}
            </button>
          ) : interrupt.requiresResolution ? (
            <p className="muted">This event cannot be skipped. Use the legal action above.</p>
          ) : (
            <button
              type="button"
              className="btn"
              onClick={() => {
                run({ type: "ACKNOWLEDGE_INTERRUPT" });
                run({ type: "RESUME_TURN" });
              }}
            >
              Continue
            </button>
          )}
        </div>
      ) : null}
      {president && warTrigger ? (
        <div className="row" style={{ marginTop: "0.5rem" }}>
          <span>International crisis requires war powers authorization</span>
          <button type="button" className="btn" onClick={() => run({ type: "BEGIN_WAR_POWERS" })}>
            Begin war powers
          </button>
        </div>
      ) : null}
      {assemblyFiling.map((d) => (
        <div key={d.key} className="decision-choice" style={{ marginTop: "0.5rem" }}>
          <span>{d.label}</span>
          <div className="row" style={{ marginTop: "0.4rem" }}>
            <button
              type="button"
              className="btn"
              onClick={() =>
                run({
                  type: "FILE_ASSEMBLY_CANDIDACY",
                  electionId: d.electionId!,
                  constituencyId: d.constituencyId!,
                })
              }
            >
              Run for reelection
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() =>
                run({ type: "DECLINE_ASSEMBLY_CANDIDACY", electionId: d.electionId! })
              }
            >
              Do not run
            </button>
          </div>
        </div>
      ))}
      {incomingDiplomacy.map((d) => {
        const action = snap.foreignAffairsRuntime.pendingPresidentialActions.find(
          (a) =>
            d.targetCountryId != null
              ? a.targetCountryId === d.targetCountryId && d.key.includes(a.kind)
              : d.key.includes(a.kind),
        );
        const label = action
          ? foreignPresidentialActionLabel(world, snap, action)
          : d.label;
        return (
          <div key={d.key} className="row incoming-diplomacy-decision" style={{ marginTop: "0.5rem" }}>
            <span>{label}</span>
            <button
              type="button"
              className="btn"
              onClick={() =>
                run({
                  type: "RESPOND_INCOMING_DIPLOMACY",
                  accept: true,
                  kind: action?.kind,
                  targetCountryId: action?.targetCountryId ?? d.targetCountryId,
                } as unknown as Command)
              }
            >
              Accept
            </button>
            <button
              type="button"
              className="btn secondary"
              onClick={() =>
                run({
                  type: "RESPOND_INCOMING_DIPLOMACY",
                  accept: false,
                  kind: action?.kind,
                  targetCountryId: action?.targetCountryId ?? d.targetCountryId,
                } as unknown as Command)
              }
            >
              Decline
            </button>
          </div>
        );
      })}
      {signs.map((d) => (
        <div key={d.key} className="row" style={{ marginTop: "0.5rem" }}>
          <span>{d.label}</span>
          <button
            type="button"
            className="btn"
            onClick={() => run({ type: "SIGN_BILL", billId: d.billId! })}
          >
            Sign
          </button>
          <button
            type="button"
            className="btn danger"
            onClick={() => run({ type: "RETURN_BILL", billId: d.billId! })}
          >
            Return
          </button>
        </div>
      ))}
      <div className="decision-list">
        {votes.map((d) => {
          if (d.kind === "motion_vote") {
            return (
              <VoteRow
                key={d.key}
                label={d.label}
                onCast={(choice) =>
                  run({ type: "CAST_MOTION_VOTE", motionId: d.motionId!, choice })
                }
              />
            );
          }
          if (d.kind === "confirmation_vote") {
            return (
              <VoteRow
                key={d.key}
                label={d.label}
                onCast={(choice) =>
                  run({ type: "CAST_CONFIRMATION_VOTE", nominationId: d.nominationId!, choice })
                }
              />
            );
          }
          if (d.kind === "impeachment_vote") {
            return (
              <VoteRow
                key={d.key}
                label={d.label}
                onCast={(choice) =>
                  run({ type: "CAST_IMPEACHMENT_VOTE", proceedingId: d.proceedingId!, choice })
                }
              />
            );
          }
          if (d.kind === "recall_vote") {
            return (
              <VoteRow
                key={d.key}
                label={d.label}
                onCast={(choice) =>
                  run({ type: "CAST_RECALL_REFERRAL_VOTE", proceedingId: d.proceedingId!, choice })
                }
              />
            );
          }
          if (d.kind === "treaty_ratification_vote") {
            return (
              <VoteRow
                key={d.key}
                label={d.label}
                onCast={(choice) =>
                  run({
                    type: "CAST_TREATY_RATIFICATION_VOTE",
                    treatyId: d.treatyId!,
                    choice,
                  })
                }
              />
            );
          }
          if (d.kind === "judicial_vote") {
            return (
              <div key={d.key} className="row" style={{ marginTop: "0.4rem" }}>
                <span>{d.label}</span>
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    run({ type: "CAST_JUDICIAL_VOTE", caseId: d.caseId!, choice: "uphold" })
                  }
                >
                  Uphold
                </button>
                <button
                  type="button"
                  className="btn danger"
                  onClick={() =>
                    run({ type: "CAST_JUDICIAL_VOTE", caseId: d.caseId!, choice: "invalidate" })
                  }
                >
                  Invalidate
                </button>
              </div>
            );
          }
          if (
            d.kind === "committee_vote" ||
            d.kind === "floor_vote" ||
            d.kind === "repassage_vote" ||
            d.kind === "amendment_vote"
          ) {
            return (
              <VoteRow
                key={d.key}
                label={d.label}
                onCast={(choice) =>
                  run({
                    type: "CAST_LEGISLATIVE_VOTE",
                    billId: d.billId!,
                    stage: d.stage!,
                    choice,
                    ...(d.amendmentId ? { amendmentId: d.amendmentId } : {}),
                  })
                }
              />
            );
          }
          return (
            <div key={d.key} className="muted" style={{ marginTop: "0.4rem" }}>
              {d.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

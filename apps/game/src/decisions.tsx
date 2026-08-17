import type { Command, KernelWorld, SimState, Simulation } from "@lorsain/sim";
import { collectPlayerActionableDecisions } from "@lorsain/sim";
import type { CommandResult } from "@lorsain/sim";

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
}) {
  const { snap, sim, world } = props;
  const interrupt = snap.pendingInterrupt;
  const decisions = collectPlayerActionableDecisions(world, snap);
  if (decisions.length === 0) return null;

  function run(command: Command) {
    props.report(sim.executeCommand(command));
    props.onDone();
  }

  const votes = decisions.filter((d) => d.kind !== "interrupt" && d.kind !== "sign_bill");
  const signs = decisions.filter((d) => d.kind === "sign_bill");

  return (
    <div className="alert">
      <strong>Required decisions</strong>
      <p className="muted">
        {decisions.length} item{decisions.length === 1 ? "" : "s"} need your action before the month
        can close without abstention.
      </p>
      {interrupt ? (
        <div>
          <div>{interrupt.message}</div>
          {interrupt.code === "PRESIDENTIAL_ELECTION_DUE" ? (
            <button
              type="button"
              className="btn"
              onClick={() => {
                run({ type: "RESOLVE_PRESIDENTIAL_ELECTION" });
                run({ type: "RESUME_TURN" });
              }}
            >
              Resolve presidential election
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

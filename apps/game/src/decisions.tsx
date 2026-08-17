import type { Command, PendingInterrupt, SimState, Simulation } from "@lorsain/sim";
import type { KernelWorld } from "@lorsain/sim";

function run(sim: Simulation, command: Command) {
  return sim.executeCommand(command);
}

export function DecisionPanel(props: {
  world: KernelWorld;
  snap: SimState;
  sim: Simulation;
  interrupt: PendingInterrupt | null;
  mp: boolean;
  president: boolean;
  speaker: boolean;
  onDone: () => void;
}) {
  const { snap, sim, interrupt, mp, president } = props;
  const bills = Object.values(snap.legislatureRuntime.bills);
  const pendingSign = president ? bills.filter((b) => b.status === "sent_to_president") : [];
  const committeeBills = mp
    ? bills.filter((b) => {
        if (b.status !== "committee" || !b.assignedCommitteeId) return false;
        return (
          snap.legislatureRuntime.committees[b.assignedCommitteeId]?.memberIds.includes(
            snap.playerPoliticianId,
          ) ?? false
        );
      })
    : [];
  const floorBills = mp ? bills.filter((b) => b.status === "floor_scheduled") : [];
  const repass = mp ? bills.filter((b) => b.status === "repassage_scheduled") : [];
  const motions = mp
    ? Object.values(snap.executiveRuntime.motions).filter((m) => m.status === "scheduled")
    : [];
  const amendments = Object.values(snap.legislatureRuntime.amendments).filter((a) => {
    if (a.status !== "proposed") return false;
    return [...committeeBills, ...floorBills, ...repass].some((b) => b.id === a.billId);
  });
  if (
    !interrupt &&
    pendingSign.length === 0 &&
    committeeBills.length === 0 &&
    floorBills.length === 0 &&
    repass.length === 0 &&
    motions.length === 0 &&
    amendments.length === 0
  ) {
    return null;
  }
  return (
    <div className="alert">
      <strong>Required decisions</strong>
      {interrupt ? (
        <div>
          <div>
            {interrupt.code}: {interrupt.message}
          </div>
          {interrupt.code === "PRESIDENTIAL_ELECTION_DUE" ? (
            <button
              className="btn"
              onClick={() => {
                run(sim, { type: "RESOLVE_PRESIDENTIAL_ELECTION" });
                run(sim, { type: "RESUME_TURN" });
                props.onDone();
              }}
            >
              Resolve presidential election
            </button>
          ) : interrupt.requiresResolution ? (
            <p className="muted">This event cannot be skipped. Use the legal action above.</p>
          ) : (
            <button
              className="btn"
              onClick={() => {
                run(sim, { type: "ACKNOWLEDGE_INTERRUPT" });
                run(sim, { type: "RESUME_TURN" });
                props.onDone();
              }}
            >
              Continue
            </button>
          )}
        </div>
      ) : null}
      {pendingSign.map((b) => (
        <div key={b.id} className="row" style={{ marginTop: "0.5rem" }}>
          <span>{b.title}</span>
          <button
            className="btn"
            onClick={() => {
              run(sim, { type: "SIGN_BILL", billId: b.id });
              props.onDone();
            }}
          >
            Sign
          </button>
          <button
            className="btn danger"
            onClick={() => {
              run(sim, { type: "RETURN_BILL", billId: b.id });
              props.onDone();
            }}
          >
            Return
          </button>
        </div>
      ))}
      {committeeBills.slice(0, 3).map((b) => (
        <VoteRow
          key={`c-${b.id}`}
          label={`Committee: ${b.title}`}
          onCast={(choice) => {
            run(sim, { type: "CAST_LEGISLATIVE_VOTE", billId: b.id, stage: "committee", choice });
            props.onDone();
          }}
        />
      ))}
      {floorBills.slice(0, 2).map((b) => (
        <VoteRow
          key={`f-${b.id}`}
          label={`Floor: ${b.title}`}
          onCast={(choice) => {
            run(sim, { type: "CAST_LEGISLATIVE_VOTE", billId: b.id, stage: "floor", choice });
            props.onDone();
          }}
        />
      ))}
      {repass.slice(0, 1).map((b) => (
        <VoteRow
          key={`r-${b.id}`}
          label={`Repassage: ${b.title}`}
          onCast={(choice) => {
            run(sim, { type: "CAST_LEGISLATIVE_VOTE", billId: b.id, stage: "repassage", choice });
            props.onDone();
          }}
        />
      ))}
      {amendments.slice(0, 3).map((a) => {
        const parent = snap.legislatureRuntime.bills[a.billId];
        const stage =
          parent?.status === "floor_scheduled"
            ? "floor"
            : parent?.status === "repassage_scheduled"
              ? "repassage"
              : "committee";
        return (
          <VoteRow
            key={a.id}
            label={`Amendment ${a.id}`}
            onCast={(choice) => {
              run(sim, {
                type: "CAST_LEGISLATIVE_VOTE",
                billId: a.billId,
                stage,
                choice,
                amendmentId: a.id,
              });
              props.onDone();
            }}
          />
        );
      })}
      {motions.slice(0, 2).map((m) => (
        <VoteRow
          key={m.id}
          label={`Motion ${m.kind}`}
          onCast={(choice) => {
            run(sim, { type: "CAST_MOTION_VOTE", motionId: m.id, choice });
            props.onDone();
          }}
        />
      ))}
    </div>
  );
}

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
      <button className="btn" onClick={() => onCast("yes")}>
        Yes
      </button>
      <button className="btn secondary" onClick={() => onCast("no")}>
        No
      </button>
      <button className="btn secondary" onClick={() => onCast("abstain")}>
        Abstain
      </button>
    </div>
  );
}

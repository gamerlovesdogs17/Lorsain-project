import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
function run(sim, command) {
    return sim.executeCommand(command);
}
export function DecisionPanel(props) {
    const { snap, sim, interrupt, mp, president } = props;
    const bills = Object.values(snap.legislatureRuntime.bills);
    const pendingSign = president ? bills.filter((b) => b.status === "sent_to_president") : [];
    const committeeBills = mp
        ? bills.filter((b) => {
            if (b.status !== "committee" || !b.assignedCommitteeId)
                return false;
            return (snap.legislatureRuntime.committees[b.assignedCommitteeId]?.memberIds.includes(snap.playerPoliticianId) ?? false);
        })
        : [];
    const floorBills = mp ? bills.filter((b) => b.status === "floor_scheduled") : [];
    const repass = mp ? bills.filter((b) => b.status === "repassage_scheduled") : [];
    const motions = mp
        ? Object.values(snap.executiveRuntime.motions).filter((m) => m.status === "scheduled")
        : [];
    const amendments = Object.values(snap.legislatureRuntime.amendments).filter((a) => {
        if (a.status !== "proposed")
            return false;
        return [...committeeBills, ...floorBills, ...repass].some((b) => b.id === a.billId);
    });
    if (!interrupt &&
        pendingSign.length === 0 &&
        committeeBills.length === 0 &&
        floorBills.length === 0 &&
        repass.length === 0 &&
        motions.length === 0 &&
        amendments.length === 0) {
        return null;
    }
    return (_jsxs("div", { className: "alert", children: [_jsx("strong", { children: "Required decisions" }), interrupt ? (_jsxs("div", { children: [_jsxs("div", { children: [interrupt.code, ": ", interrupt.message] }), interrupt.code === "PRESIDENTIAL_ELECTION_DUE" ? (_jsx("button", { className: "btn", onClick: () => {
                            run(sim, { type: "RESOLVE_PRESIDENTIAL_ELECTION" });
                            run(sim, { type: "RESUME_TURN" });
                            props.onDone();
                        }, children: "Resolve presidential election" })) : interrupt.requiresResolution ? (_jsx("p", { className: "muted", children: "This event cannot be skipped. Use the legal action above." })) : (_jsx("button", { className: "btn", onClick: () => {
                            run(sim, { type: "ACKNOWLEDGE_INTERRUPT" });
                            run(sim, { type: "RESUME_TURN" });
                            props.onDone();
                        }, children: "Continue" }))] })) : null, pendingSign.map((b) => (_jsxs("div", { className: "row", style: { marginTop: "0.5rem" }, children: [_jsx("span", { children: b.title }), _jsx("button", { className: "btn", onClick: () => {
                            run(sim, { type: "SIGN_BILL", billId: b.id });
                            props.onDone();
                        }, children: "Sign" }), _jsx("button", { className: "btn danger", onClick: () => {
                            run(sim, { type: "RETURN_BILL", billId: b.id });
                            props.onDone();
                        }, children: "Return" })] }, b.id))), committeeBills.slice(0, 3).map((b) => (_jsx(VoteRow, { label: `Committee: ${b.title}`, onCast: (choice) => {
                    run(sim, { type: "CAST_LEGISLATIVE_VOTE", billId: b.id, stage: "committee", choice });
                    props.onDone();
                } }, `c-${b.id}`))), floorBills.slice(0, 2).map((b) => (_jsx(VoteRow, { label: `Floor: ${b.title}`, onCast: (choice) => {
                    run(sim, { type: "CAST_LEGISLATIVE_VOTE", billId: b.id, stage: "floor", choice });
                    props.onDone();
                } }, `f-${b.id}`))), repass.slice(0, 1).map((b) => (_jsx(VoteRow, { label: `Repassage: ${b.title}`, onCast: (choice) => {
                    run(sim, { type: "CAST_LEGISLATIVE_VOTE", billId: b.id, stage: "repassage", choice });
                    props.onDone();
                } }, `r-${b.id}`))), amendments.slice(0, 3).map((a) => {
                const parent = snap.legislatureRuntime.bills[a.billId];
                const stage = parent?.status === "floor_scheduled"
                    ? "floor"
                    : parent?.status === "repassage_scheduled"
                        ? "repassage"
                        : "committee";
                return (_jsx(VoteRow, { label: `Amendment ${a.id}`, onCast: (choice) => {
                        run(sim, {
                            type: "CAST_LEGISLATIVE_VOTE",
                            billId: a.billId,
                            stage,
                            choice,
                            amendmentId: a.id,
                        });
                        props.onDone();
                    } }, a.id));
            }), motions.slice(0, 2).map((m) => (_jsx(VoteRow, { label: `Motion ${m.kind}`, onCast: (choice) => {
                    run(sim, { type: "CAST_MOTION_VOTE", motionId: m.id, choice });
                    props.onDone();
                } }, m.id)))] }));
}
function VoteRow({ label, onCast, }) {
    return (_jsxs("div", { className: "row", style: { marginTop: "0.4rem" }, children: [_jsx("span", { children: label }), _jsx("button", { className: "btn", onClick: () => onCast("yes"), children: "Yes" }), _jsx("button", { className: "btn secondary", onClick: () => onCast("no"), children: "No" }), _jsx("button", { className: "btn secondary", onClick: () => onCast("abstain"), children: "Abstain" })] }));
}
//# sourceMappingURL=decisions.js.map
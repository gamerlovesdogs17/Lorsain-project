import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { collectPlayerActionableDecisions } from "@lorsain/sim";
import { isPresident } from "./format.js";
import { foreignPresidentialActionLabel } from "./presentation.js";
import { interruptDisplay } from "./presentation/display.js";
function VoteRow({ label, onCast, }) {
    return (_jsxs("div", { className: "row", style: { marginTop: "0.4rem" }, children: [_jsx("span", { children: label }), _jsx("button", { type: "button", className: "btn", onClick: () => onCast("yes"), children: "Yes" }), _jsx("button", { type: "button", className: "btn secondary", onClick: () => onCast("no"), children: "No" }), _jsx("button", { type: "button", className: "btn secondary", onClick: () => onCast("abstain"), children: "Abstain" })] }));
}
export function DecisionPanel(props) {
    const { snap, sim, world } = props;
    const interrupt = snap.pendingInterrupt;
    const decisions = collectPlayerActionableDecisions(world, snap);
    const president = isPresident(world, snap, snap.playerPoliticianId);
    const warTrigger = snap.executiveRuntime.warTrigger;
    if (decisions.length === 0 && !(president && warTrigger))
        return null;
    function run(command) {
        props.report(sim.executeCommand(command));
        props.onDone();
    }
    const votes = decisions.filter((d) => d.kind !== "interrupt" &&
        d.kind !== "sign_bill" &&
        d.kind !== "foreign_presidential_action" &&
        d.kind !== "assembly_filing");
    const signs = decisions.filter((d) => d.kind === "sign_bill");
    const incomingDiplomacy = decisions.filter((d) => d.kind === "foreign_presidential_action");
    const assemblyFiling = decisions.filter((d) => d.kind === "assembly_filing");
    return (_jsxs("div", { className: "alert", children: [_jsx("strong", { children: "Required decisions" }), _jsxs("p", { className: "muted", children: [decisions.length, " item", decisions.length === 1 ? "" : "s", " need your action before the month can close without abstention."] }), interrupt ? (_jsxs("div", { children: [_jsx("div", { children: interruptDisplay(interrupt) }), interrupt.code === "PRESIDENTIAL_ELECTION_DUE" ? (_jsx("button", { type: "button", className: "btn", onClick: props.onResolvePresidential, children: "Resolve presidential election" })) : interrupt.code === "ASSEMBLY_ELECTION_DUE" ? (_jsx("button", { type: "button", className: "btn", disabled: props.countingElection, onClick: props.onResolveAssembly, children: props.countingElection ? "Counting election…" : "Resolve Assembly election" })) : interrupt.requiresResolution ? (_jsx("p", { className: "muted", children: "This event cannot be skipped. Use the legal action above." })) : (_jsx("button", { type: "button", className: "btn", onClick: () => {
                            run({ type: "ACKNOWLEDGE_INTERRUPT" });
                            run({ type: "RESUME_TURN" });
                        }, children: "Continue" }))] })) : null, president && warTrigger ? (_jsxs("div", { className: "row", style: { marginTop: "0.5rem" }, children: [_jsx("span", { children: "International crisis requires war powers authorization" }), _jsx("button", { type: "button", className: "btn", onClick: () => run({ type: "BEGIN_WAR_POWERS" }), children: "Begin war powers" })] })) : null, assemblyFiling.map((d) => (_jsxs("div", { className: "decision-choice", style: { marginTop: "0.5rem" }, children: [_jsx("span", { children: d.label }), _jsxs("div", { className: "row", style: { marginTop: "0.4rem" }, children: [_jsx("button", { type: "button", className: "btn", onClick: () => run({
                                    type: "FILE_ASSEMBLY_CANDIDACY",
                                    electionId: d.electionId,
                                    constituencyId: d.constituencyId,
                                }), children: "Run for reelection" }), _jsx("button", { type: "button", className: "btn secondary", onClick: () => run({ type: "DECLINE_ASSEMBLY_CANDIDACY", electionId: d.electionId }), children: "Do not run" })] })] }, d.key))), incomingDiplomacy.map((d) => {
                const action = snap.foreignAffairsRuntime.pendingPresidentialActions.find((a) => d.targetCountryId != null
                    ? a.targetCountryId === d.targetCountryId && d.key.includes(a.kind)
                    : d.key.includes(a.kind));
                const label = action
                    ? foreignPresidentialActionLabel(world, snap, action)
                    : d.label;
                return (_jsxs("div", { className: "row incoming-diplomacy-decision", style: { marginTop: "0.5rem" }, children: [_jsx("span", { children: label }), _jsx("button", { type: "button", className: "btn", onClick: () => run({
                                type: "RESPOND_INCOMING_DIPLOMACY",
                                accept: true,
                                kind: action?.kind,
                                targetCountryId: action?.targetCountryId ?? d.targetCountryId,
                            }), children: "Accept" }), _jsx("button", { type: "button", className: "btn secondary", onClick: () => run({
                                type: "RESPOND_INCOMING_DIPLOMACY",
                                accept: false,
                                kind: action?.kind,
                                targetCountryId: action?.targetCountryId ?? d.targetCountryId,
                            }), children: "Decline" })] }, d.key));
            }), signs.length ? _jsx("div", { className: "decision-action-grid", children: signs.map((d) => (_jsxs("div", { className: "row decision-action-row", children: [_jsx("span", { children: d.label }), _jsx("button", { type: "button", className: "btn", onClick: () => run({ type: "SIGN_BILL", billId: d.billId }), children: "Sign" }), _jsx("button", { type: "button", className: "btn danger", onClick: () => run({ type: "RETURN_BILL", billId: d.billId }), children: "Return" })] }, d.key))) }) : null, _jsx("div", { className: "decision-list", children: votes.map((d) => {
                    if (d.kind === "motion_vote") {
                        return (_jsx(VoteRow, { label: d.label, onCast: (choice) => run({ type: "CAST_MOTION_VOTE", motionId: d.motionId, choice }) }, d.key));
                    }
                    if (d.kind === "confirmation_vote") {
                        return (_jsx(VoteRow, { label: d.label, onCast: (choice) => run({ type: "CAST_CONFIRMATION_VOTE", nominationId: d.nominationId, choice }) }, d.key));
                    }
                    if (d.kind === "impeachment_vote") {
                        return (_jsx(VoteRow, { label: d.label, onCast: (choice) => run({ type: "CAST_IMPEACHMENT_VOTE", proceedingId: d.proceedingId, choice }) }, d.key));
                    }
                    if (d.kind === "recall_vote") {
                        return (_jsx(VoteRow, { label: d.label, onCast: (choice) => run({ type: "CAST_RECALL_REFERRAL_VOTE", proceedingId: d.proceedingId, choice }) }, d.key));
                    }
                    if (d.kind === "treaty_ratification_vote") {
                        return (_jsx(VoteRow, { label: d.label, onCast: (choice) => run({
                                type: "CAST_TREATY_RATIFICATION_VOTE",
                                treatyId: d.treatyId,
                                choice,
                            }) }, d.key));
                    }
                    if (d.kind === "judicial_vote") {
                        return (_jsxs("div", { className: "row", style: { marginTop: "0.4rem" }, children: [_jsx("span", { children: d.label }), _jsx("button", { type: "button", className: "btn", onClick: () => run({ type: "CAST_JUDICIAL_VOTE", caseId: d.caseId, choice: "uphold" }), children: "Uphold" }), _jsx("button", { type: "button", className: "btn danger", onClick: () => run({ type: "CAST_JUDICIAL_VOTE", caseId: d.caseId, choice: "invalidate" }), children: "Invalidate" })] }, d.key));
                    }
                    if (d.kind === "committee_vote" ||
                        d.kind === "floor_vote" ||
                        d.kind === "repassage_vote" ||
                        d.kind === "amendment_vote") {
                        return (_jsx(VoteRow, { label: d.label, onCast: (choice) => run({
                                type: "CAST_LEGISLATIVE_VOTE",
                                billId: d.billId,
                                stage: d.stage,
                                choice,
                                ...(d.amendmentId ? { amendmentId: d.amendmentId } : {}),
                            }) }, d.key));
                    }
                    return (_jsx("div", { className: "muted", style: { marginTop: "0.4rem" }, children: d.label }, d.key));
                }) })] }));
}
//# sourceMappingURL=decisions.js.map
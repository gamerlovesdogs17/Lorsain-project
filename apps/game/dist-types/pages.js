import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { canAssumeOffice, currentAssemblyMemberIds, currentPresidentialAuthorityId, whipEstimate, } from "@lorsain/sim";
import { cabinet, isMp, isPresident, isSpeaker, partyName, playerCampaign, politicianName, qualitativeStanding, } from "./format.js";
const PARTY_COLORS = {
    PARTY_LAB: "#b42318",
    PARTY_NU: "#1d4e89",
    PARTY_CR: "#c45c26",
    PARTY_GRN: "#2f6b3c",
    PARTY_RL: "#6b4c9a",
    PARTY_PM: "#8a6d3b",
    PARTY_IND: "#6b7280",
};
function run(sim, command) {
    return sim.executeCommand(command);
}
export function GamePages(props) {
    const { screen } = props;
    if (screen === "home")
        return _jsx(Home, { ...props });
    if (screen === "career")
        return _jsx(Career, { ...props });
    if (screen === "assembly")
        return _jsx(Assembly, { ...props });
    if (screen === "party")
        return _jsx(Party, { ...props });
    if (screen === "campaign")
        return _jsx(Campaign, { ...props });
    if (screen === "elections")
        return _jsx(Elections, { ...props });
    if (screen === "executive")
        return _jsx(Executive, { ...props });
    if (screen === "terena")
        return _jsx(Terena, { ...props });
    return _jsx(Archive, { ...props });
}
function Home(props) {
    const polls = Object.values(props.snap.polls).slice(-3);
    const bills = Object.values(props.snap.legislatureRuntime.bills).filter((b) => ["committee", "floor_scheduled", "sent_to_president", "repassage_scheduled"].includes(b.status));
    const upcoming = props.snap.scheduler.events
        .filter((e) => e.status === "pending")
        .sort((a, b) => (a.dueDate < b.dueDate ? -1 : 1))
        .slice(0, 6);
    return (_jsxs("div", { className: "grid", children: [_jsxs("div", { className: "card", children: [_jsx("h3", { children: "Your situation" }), _jsx("div", { children: politicianName(props.figures, props.snap.playerPoliticianId) }), _jsx("div", { className: "muted", children: props.offices.join(" · ") || "No current office" }), _jsx("div", { className: "muted", children: partyName(props.world, props.snap.politicians[props.snap.playerPoliticianId]?.partyId ?? null) }), props.campaign ? (_jsxs("div", { children: ["Campaign: ", props.campaign.type] })) : (_jsx("div", { className: "muted", children: "Not campaigning" }))] }), _jsxs("div", { className: "card", children: [_jsx("h3", { children: "What happened" }), (props.events.length ? props.events : props.snap.history.slice(-8)).slice(-10).map((e) => (_jsxs("div", { className: "muted", children: [e.date, " \u00B7 ", e.type] }, e.id)))] }), _jsxs("div", { className: "card", children: [_jsx("h3", { children: "Needs attention" }), upcoming.map((e) => (_jsxs("div", { className: "muted", children: [e.dueDate, " \u00B7 ", e.eventType] }, e.id)))] }), _jsxs("div", { className: "card", children: [_jsx("h3", { children: "Polls" }), polls.map((p) => (_jsxs("div", { className: "muted", children: [p.publicationDate, " \u00B7 ", p.pollsterId] }, p.id)))] }), _jsxs("div", { className: "card", children: [_jsx("h3", { children: "Active bills" }), bills.slice(0, 6).map((b) => (_jsxs("div", { children: [b.title, " ", _jsx("span", { className: "muted", children: b.status })] }, b.id)))] })] }));
}
function Career(props) {
    const figure = props.figures.get(props.snap.playerPoliticianId);
    const standing = props.snap.candidateStanding[props.snap.playerPoliticianId];
    const age = figure?.birth_date
        ? Number(props.snap.currentDate.slice(0, 4)) - Number(figure.birth_date.slice(0, 4))
        : null;
    return (_jsxs("div", { className: "card", children: [_jsx("h3", { children: figure?.name ?? props.snap.playerPoliticianId }), _jsx("p", { children: figure?.notes ?? figure?.display_summary }), age != null ? _jsxs("p", { children: ["Age: ", age] }) : null, _jsxs("p", { children: ["Office: ", props.offices.join(", ") || "none"] }), _jsxs("p", { children: ["Party / faction: ", figure?.party, " / ", figure?.faction] }), _jsxs("p", { children: ["Home: ", figure?.home] }), _jsxs("p", { children: ["Public standing: ", qualitativeStanding(standing?.favorability)] }), _jsxs("label", { children: [_jsx("input", { type: "checkbox", checked: props.debug, onChange: (e) => props.setDebug(e.target.checked) }), " ", "Developer numbers"] }), props.debug ? _jsx("pre", { children: JSON.stringify(standing, null, 2) }) : null] }));
}
function Assembly(props) {
    const mps = currentAssemblyMemberIds(props.world, props.snap);
    const counts = new Map();
    for (const id of mps) {
        const party = props.snap.politicians[id]?.partyId ?? "none";
        counts.set(party, (counts.get(party) ?? 0) + 1);
    }
    const bill = props.selectedBill ? props.snap.legislatureRuntime.bills[props.selectedBill] : null;
    const issueId = props.world.issueIds[0] ?? "ISS_TAX";
    const mp = isMp(props.world, props.snap, props.snap.playerPoliticianId);
    const speaker = isSpeaker(props.world, props.snap, props.snap.playerPoliticianId);
    return (_jsxs("div", { children: [_jsxs("div", { className: "card", children: [_jsx("h3", { children: "Assembly overview" }), _jsxs("p", { children: [mps.length, " sitting of ", props.world.legislativeConstitution.assemblySeatCount, " authorized seats."] }), _jsx("div", { className: "chamber", children: Array.from({ length: props.world.legislativeConstitution.assemblySeatCount }, (_, i) => {
                            const id = mps[i];
                            const party = id ? (props.snap.politicians[id]?.partyId ?? "PARTY_IND") : null;
                            return (_jsx("span", { className: `seat ${id ? "" : "vacant"}`, style: {
                                    background: id ? (PARTY_COLORS[party ?? "PARTY_IND"] ?? "#444") : undefined,
                                }, title: id ? politicianName(props.figures, id) : "vacant" }, i));
                        }) }), _jsx("table", { className: "table", children: _jsx("tbody", { children: [...counts.entries()].map(([party, n]) => (_jsxs("tr", { children: [_jsx("td", { children: partyName(props.world, party === "none" ? null : party) }), _jsx("td", { children: n })] }, party))) }) })] }), mp ? (_jsx("div", { className: "row", style: { margin: "0.8rem 0" }, children: _jsx("button", { className: "btn", onClick: () => {
                        run(props.sim, {
                            type: "INTRODUCE_BILL",
                            title: "Player bill",
                            policyItems: [{ issueId, direction: 1, magnitude: 0.4, fiscalImpact: null }],
                        });
                        props.onDone();
                    }, children: "Introduce bill" }) })) : null, _jsxs("div", { className: "card", children: [_jsx("h3", { children: "Bills" }), _jsxs("table", { className: "table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Title" }), _jsx("th", { children: "Status" }), _jsx("th", { children: "Sponsor" })] }) }), _jsx("tbody", { children: Object.values(props.snap.legislatureRuntime.bills)
                                    .slice(-20)
                                    .reverse()
                                    .map((b) => (_jsxs("tr", { onClick: () => props.setSelectedBill(b.id), children: [_jsx("td", { children: b.title }), _jsx("td", { children: b.status }), _jsx("td", { children: politicianName(props.figures, b.sponsorId) })] }, b.id))) })] })] }), bill ? (_jsxs("div", { className: "card", children: [_jsx("h3", { children: bill.title }), _jsxs("p", { className: "muted", children: [bill.status, " \u00B7 ", bill.id] }), _jsx("pre", { children: JSON.stringify(bill.policyItems, null, 2) }), mp ? (_jsxs("div", { className: "row", children: [_jsx("button", { className: "btn secondary", onClick: () => {
                                    run(props.sim, { type: "COSPONSOR_BILL", billId: bill.id });
                                    props.onDone();
                                }, children: "Cosponsor" }), _jsx("button", { className: "btn secondary", onClick: () => {
                                    run(props.sim, {
                                        type: "PROPOSE_AMENDMENT",
                                        billId: bill.id,
                                        policyItems: bill.policyItems.map((p) => ({
                                            ...p,
                                            magnitude: Math.max(0.1, p.magnitude * 0.5),
                                        })),
                                    });
                                    props.onDone();
                                }, children: "Propose amendment" }), speaker &&
                                (bill.status === "floor_scheduled" || bill.status === "repassage_scheduled") ? (_jsxs(_Fragment, { children: [_jsx("button", { className: "btn", onClick: () => {
                                            run(props.sim, { type: "SCHEDULE_BILL", billId: bill.id });
                                            props.onDone();
                                        }, children: "Schedule" }), _jsx("button", { className: "btn secondary", onClick: () => {
                                            run(props.sim, { type: "DELAY_BILL", billId: bill.id });
                                            props.onDone();
                                        }, children: "Delay" })] })) : null] })) : null, _jsxs("p", { className: "muted", children: ["Whip yes range:", " ", JSON.stringify(whipEstimate(props.world, props.snap, bill.id)?.yesRange)] })] })) : null] }));
}
function Party(props) {
    const partyId = props.snap.politicians[props.snap.playerPoliticianId]?.partyId;
    const party = partyId ? props.world.partyDefinitions[partyId] : null;
    const runtime = partyId ? props.snap.partyStates[partyId] : null;
    const contests = Object.values(props.snap.partyContests).filter((c) => c.partyId === partyId);
    const caucus = currentAssemblyMemberIds(props.world, props.snap).filter((id) => props.snap.politicians[id]?.partyId === partyId).length;
    return (_jsxs("div", { className: "card", children: [_jsx("h3", { children: party?.name ?? "No party" }), _jsxs("p", { children: ["Leader: ", runtime?.leaderId ? politicianName(props.figures, runtime.leaderId) : "vacant"] }), _jsxs("p", { children: ["Assembly caucus: ", caucus] }), (party?.factionIds ?? []).map((fid) => (_jsxs("div", { children: [props.world.factionDefinitions[fid]?.name ?? fid, " \u00B7 chair", " ", props.snap.factionStates[fid]?.chairId
                        ? politicianName(props.figures, props.snap.factionStates[fid].chairId)
                        : "vacant"] }, fid))), contests.map((c) => (_jsxs("div", { children: [c.id, " \u00B7 ", c.status, " \u00B7 ", Object.keys(c.entries).length, " candidates"] }, c.id)))] }));
}
function Campaign(props) {
    const c = playerCampaign(props.snap);
    const cid = Object.keys(props.world.constituencyElectorate)[0] ?? "C001";
    if (!c) {
        const open = Object.values(props.snap.partyContests).find((x) => x.partyId === props.snap.politicians[props.snap.playerPoliticianId]?.partyId &&
            x.type === "presidential_nomination" &&
            (x.status === "open" || x.status === "planned" || x.status === "qualification"));
        return (_jsxs("div", { className: "card", children: [_jsx("h3", { children: "Campaign" }), _jsx("p", { className: "muted", children: "You are not running an active campaign." }), open ? (_jsx("button", { className: "btn", onClick: () => {
                        const r = run(props.sim, {
                            type: "DECLARE_CAMPAIGN",
                            politicianId: props.snap.playerPoliticianId,
                            campaignType: "presidential_nomination",
                            contestId: open.id,
                        });
                        if (!r.ok)
                            alert(r.error.message);
                        props.onDone();
                    }, children: "Explore / declare" })) : (_jsx("p", { children: "No open nomination contest is available to join right now." }))] }));
    }
    const actions = [
        { label: "Fundraise", command: { type: "CAMPAIGN_FUNDRAISE", campaignId: c.id } },
        {
            label: "Visit",
            command: { type: "CAMPAIGN_VISIT", campaignId: c.id, geographyKind: "national" },
        },
        {
            label: "Organize",
            command: { type: "CAMPAIGN_ORGANIZE", campaignId: c.id, constituencyId: cid },
        },
        {
            label: "Advertise",
            command: {
                type: "CAMPAIGN_ADVERTISE",
                campaignId: c.id,
                spend: Math.min(25000, Math.floor(c.cashOnHand)),
                messageType: "positive",
            },
        },
        { label: "Message", command: { type: "CAMPAIGN_MESSAGE", campaignId: c.id } },
        { label: "Prepare debate", command: { type: "CAMPAIGN_PREPARE_DEBATE", campaignId: c.id } },
        { label: "Seek endorsement", command: { type: "CAMPAIGN_SEEK_ENDORSEMENT", campaignId: c.id } },
        {
            label: "Seek nomination support",
            command: { type: "CAMPAIGN_SEEK_NOMINATION_SUPPORT", campaignId: c.id },
        },
        { label: "Withdraw", command: { type: "WITHDRAW_CAMPAIGN", campaignId: c.id } },
    ];
    return (_jsxs("div", { className: "card", children: [_jsx("h3", { children: c.type }), _jsxs("p", { children: ["Cash ", Math.round(c.cashOnHand), " \u00B7 raised ", Math.round(c.totalRaised), " \u00B7 spent", " ", Math.round(c.totalSpent)] }), _jsxs("p", { children: ["AP ", c.actionPointsRemaining, "/", c.actionPointsMax, " \u00B7 org ", c.fieldOrganization.toFixed(2)] }), _jsx("div", { className: "row", children: actions.map((a) => (_jsx("button", { className: "btn secondary", onClick: () => {
                        const r = run(props.sim, a.command);
                        if (!r.ok)
                            alert(r.error.message);
                        props.onDone();
                    }, children: a.label }, a.label))) })] }));
}
function Elections(props) {
    const elections = Object.values(props.snap.elections);
    const due = props.snap.pendingInterrupt?.code === "PRESIDENTIAL_ELECTION_DUE";
    return (_jsxs("div", { className: "card", children: [_jsx("h3", { children: "Elections" }), elections.map((el) => (_jsxs("div", { style: { marginBottom: "1rem" }, children: [_jsx("strong", { children: el.id }), " \u00B7 ", el.status, " \u00B7 ", el.date, _jsxs("div", { children: ["Candidates: ", Object.keys(el.candidates).length] }), due && el.id === "ELEC_PRES_2028" ? (_jsx("button", { className: "btn", onClick: () => {
                            run(props.sim, { type: "RESOLVE_PRESIDENTIAL_ELECTION" });
                            props.onDone();
                        }, children: "Resolve" })) : null, el.countArchive && "firstPreferences" in el.countArchive ? (_jsxs("div", { children: ["First preferences:", " ", Object.entries(el.countArchive.firstPreferences)
                                .map(([id, w]) => `${politicianName(props.figures, id)} ${w}`)
                                .join(" · ")] })) : null, el.countArchive && "rounds" in el.countArchive ? (_jsxs("table", { className: "table", children: [_jsx("thead", { children: _jsxs("tr", { children: [_jsx("th", { children: "Round" }), _jsx("th", { children: "Eliminated" })] }) }), _jsx("tbody", { children: el.countArchive.rounds.map((r, i) => (_jsxs("tr", { children: [_jsx("td", { children: r.round ?? i + 1 }), _jsx("td", { children: r.eliminatedId ?? r.electedId ?? "—" })] }, i))) })] })) : null, el.winnerIds.map((id) => (_jsxs("div", { children: ["Winner: ", politicianName(props.figures, id)] }, id)))] }, el.id))), Object.values(props.snap.polls)
                .slice(-5)
                .map((p) => (_jsxs("div", { className: "muted", children: ["Poll ", p.publicationDate, " ", p.pollsterId, ":", " ", p.firstPreference
                        .map((s) => `${s.politicianId} ${(s.share * 100).toFixed(1)}%`)
                        .join(" · ")] }, p.id)))] }));
}
function Executive(props) {
    const cab = cabinet(props.world, props.snap);
    const presidentId = currentPresidentialAuthorityId(props.world, props.snap);
    const president = isPresident(props.world, props.snap, props.snap.playerPoliticianId);
    const mp = isMp(props.world, props.snap, props.snap.playerPoliticianId);
    const vacant = cab.find((m) => m.holderId == null);
    return (_jsxs("div", { className: "card", children: [_jsx("h3", { children: "Executive" }), _jsxs("p", { children: ["President: ", presidentId ? politicianName(props.figures, presidentId) : "vacant"] }), _jsx("table", { className: "table", children: _jsx("tbody", { children: cab.map((m) => (_jsxs("tr", { children: [_jsx("td", { children: m.title }), _jsx("td", { children: m.holderId ? politicianName(props.figures, m.holderId) : "vacant" }), president && m.holderId ? (_jsx("td", { children: _jsx("button", { className: "btn danger", onClick: () => {
                                        run(props.sim, { type: "DISMISS_MINISTER", officeId: m.officeId });
                                        props.onDone();
                                    }, children: "Dismiss" }) })) : (_jsx("td", {}))] }, m.officeId))) }) }), president && vacant ? (_jsxs("button", { className: "btn", onClick: () => {
                    const candidate = Object.keys(props.snap.politicians).find((id) => {
                        if (id === props.snap.playerPoliticianId)
                            return false;
                        return (canAssumeOffice(props.snap, props.world, vacant.officeId, id, "substantive", {
                            ignoreOfficeCapacity: true,
                        }) == null);
                    });
                    const r = run(props.sim, {
                        type: "APPOINT_MINISTER",
                        officeId: vacant.officeId,
                        politicianId: candidate ?? "NPC030",
                    });
                    if (!r.ok)
                        alert(r.error.message);
                    props.onDone();
                }, children: ["Appoint minister to ", vacant.title] })) : null, president ? (_jsx("button", { className: "btn secondary", onClick: () => {
                    const r = run(props.sim, {
                        type: "ISSUE_REGULATION",
                        ministryOfficeId: cab[0]?.officeId ?? "OFFICE_MINISTER_FINANCE",
                        policyItems: [
                            {
                                issueId: props.world.issueIds[0] ?? "ISS_TAX",
                                direction: 1,
                                magnitude: 0.2,
                                fiscalImpact: null,
                            },
                        ],
                        major: true,
                    });
                    if (!r.ok)
                        alert(r.error.message);
                    props.onDone();
                }, children: "Issue regulation" })) : null, _jsx("h3", { children: "Budget" }), Object.values(props.snap.executiveRuntime.budgets).map((b) => (_jsxs("div", { children: ["FY ", b.fiscalYear, " \u00B7 ", b.status, mp && b.status === "proposed" ? (_jsx("button", { className: "btn secondary", onClick: () => {
                            run(props.sim, {
                                type: "INTRODUCE_MOTION",
                                kind: "budget_approval",
                                targetId: b.id,
                            });
                            props.onDone();
                        }, children: "Move to approve" })) : null] }, b.id))), president ? (_jsx("button", { className: "btn secondary", onClick: () => {
                    const allocations = {};
                    for (const m of cab)
                        allocations[m.officeId] = 1;
                    const r = run(props.sim, { type: "PROPOSE_BUDGET", allocations });
                    if (!r.ok)
                        alert(r.error.message);
                    props.onDone();
                }, children: "Propose budget" })) : null, mp
                ? cab
                    .filter((m) => m.holderId)
                    .slice(0, 1)
                    .map((m) => (_jsxs("button", { className: "btn secondary", onClick: () => {
                        const r = run(props.sim, {
                            type: "INTRODUCE_MOTION",
                            kind: "ministerial_censure",
                            targetId: m.officeId,
                        });
                        if (!r.ok)
                            alert(r.error.message);
                        props.onDone();
                    }, children: ["Move to censure ", m.title] }, `censure-${m.officeId}`)))
                : null, _jsx("h3", { children: "Regulations" }), Object.values(props.snap.executiveRuntime.regulations).map((r) => (_jsxs("div", { children: [r.id, " \u00B7 ", r.status, mp && r.major && r.status === "active" ? (_jsx("button", { className: "btn secondary", onClick: () => {
                            run(props.sim, {
                                type: "INTRODUCE_MOTION",
                                kind: "regulation_annulment",
                                targetId: r.id,
                            });
                            props.onDone();
                        }, children: "Move to annul" })) : null] }, r.id))), _jsx("h3", { children: "Emergency / war" }), Object.values(props.snap.executiveRuntime.emergencies).map((e) => (_jsxs("div", { children: [e.id, " \u00B7 ", e.status, " \u00B7 expires ", e.expiresDate] }, e.id))), Object.values(props.snap.executiveRuntime.warPowers).map((w) => (_jsxs("div", { children: [w.id, " \u00B7 ", w.status] }, w.id)))] }));
}
function Terena(props) {
    return (_jsxs("div", { className: "card", children: [_jsx("h3", { children: "Terena" }), _jsx("p", { className: "muted", children: props.mapHover ?? "Hover a constituency or province" }), _jsx("div", { className: "map-wrap", dangerouslySetInnerHTML: { __html: props.bundle.content.terena_svg }, onMouseOver: (e) => {
                    const t = e.target;
                    if (t.id)
                        props.setMapHover(t.id);
                } })] }));
}
function Archive(props) {
    const laws = Object.values(props.snap.legislatureRuntime.enactedLaws);
    const elections = Object.values(props.snap.elections).filter((e) => e.status === "resolved");
    const cabinetEvents = props.snap.history.filter((e) => e.type.includes("MINISTER") || e.type.includes("PRESIDENT"));
    return (_jsxs("div", { className: "card", children: [_jsx("h3", { children: "Archive" }), _jsx("h4", { children: "Elections" }), elections.map((e) => (_jsxs("div", { children: [e.id, " won by ", e.winnerIds.map((id) => politicianName(props.figures, id)).join(", ")] }, e.id))), _jsx("h4", { children: "Laws" }), laws.map((l) => (_jsxs("div", { children: [l.title, " (", l.enactedDate, ")"] }, l.id))), _jsx("h4", { children: "Executive" }), cabinetEvents.slice(-12).map((e) => (_jsxs("div", { className: "muted", children: [e.date, " \u00B7 ", e.type] }, e.id)))] }));
}
//# sourceMappingURL=pages.js.map
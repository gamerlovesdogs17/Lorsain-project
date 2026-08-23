import { occupyingTerms } from "@lorsain/sim";
import { currentAssemblyMemberIds, currentPresidentialAuthorityId, currentSpeakerId, deriveCabinet, } from "@lorsain/sim";
export function politicianName(figures, id) {
    return figures.get(id)?.name ?? id;
}
export function partyName(world, partyId) {
    if (!partyId)
        return "Independent";
    return world.partyDefinitions[partyId]?.name ?? partyId;
}
export function qualitativeStanding(n) {
    if (n == null)
        return "unknown";
    if (n >= 0.7)
        return "high";
    if (n >= 0.5)
        return "solid";
    if (n >= 0.35)
        return "mixed";
    return "weak";
}
export function playerOffices(world, state, id) {
    const titles = [];
    for (const term of Object.values(state.officeTerms)) {
        if (term.holderId !== id)
            continue;
        if (term.status !== "active" && term.status !== "suspended")
            continue;
        const office = world.offices[term.officeId];
        if (!office)
            continue;
        const acting = term.holdingKind === "acting" ? " (acting)" : "";
        titles.push(`${office.title}${acting}`);
    }
    return titles;
}
export function isMp(world, state, id) {
    return currentAssemblyMemberIds(world, state).includes(id);
}
export function isSpeaker(world, state, id) {
    return currentSpeakerId(world, state) === id;
}
export function isPresident(world, state, id) {
    return currentPresidentialAuthorityId(world, state) === id;
}
export function playerCampaign(state) {
    return Object.values(state.campaignRuntime.campaigns).filter((c) => c.politicianId === state.playerPoliticianId &&
        (c.status === "active" || c.status === "exploring")).sort((a, b) => b.launchedDate.localeCompare(a.launchedDate) || b.id.localeCompare(a.id))[0];
}
export function cabinet(world, state) {
    return deriveCabinet(world, state);
}
export function holdersOfKind(world, state, officeId) {
    return occupyingTerms(state, officeId)
        .filter((t) => t.status === "active")
        .map((t) => t.holderId);
}
//# sourceMappingURL=format.js.map
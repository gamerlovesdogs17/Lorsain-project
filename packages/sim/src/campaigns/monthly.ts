import type { KernelWorld, SimEvent, SimState } from "../types.js";
import type { RngService } from "../rng.js";
import { parseIsoDate } from "../calendar.js";
import { createPoll } from "../elections/polls.js";
import { activeElectionCandidateIds } from "../elections/field.js";
import { processAssemblyFilingCalendar } from "../elections/assembly-cycle.js";
import { decayMomentum, monthStart } from "./effects.js";
import { activeCampaigns, ensureActionPoints } from "./state.js";
import {
  campaignAdvertise,
  campaignAttack,
  campaignFundraise,
  campaignMessage,
  campaignOrganize,
  campaignPrepareDebate,
  campaignSeekEndorsement,
  campaignSeekNominationSupport,
  campaignVisit,
  declareCampaign,
  withdrawCampaign,
} from "./actions.js";
import { chooseCampaignAction, chooseDeclare, shouldConsiderWithdraw } from "./decisions.js";
import { holdDebate, shouldHoldDebate } from "./debates.js";
import { openDueNominationContests, processNominationCalendar } from "./timeline.js";
import { currentPresidentialElection } from "./timeline.js";
import { presidentialNominationContestsForElection } from "../parties/state.js";
import type { CampaignGeography, CampaignMessageType } from "./types.js";

export function processCampaignMonth(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const month = monthStart(state.currentDate);
  if (state.campaignRuntime.lastMonthProcessed === month) return [];
  const events: SimEvent[] = [];

  events.push(...processAssemblyFilingCalendar(state, world, commandId));
  events.push(...openDueNominationContests(state, commandId));
  events.push(...npcDeclarations(state, world, rng, commandId));

  for (const campaign of activeCampaigns(state)) {
    decayMomentum(world, state, campaign.politicianId);
    ensureActionPoints(world, state, campaign);
    if (campaign.politicianId === state.playerPoliticianId) continue;
    if (campaign.status !== "active") continue;
    if (shouldConsiderWithdraw(world, state, campaign)) {
      const opt = chooseCampaignAction(world, state, campaign, rng);
      if (opt?.actionType === "WITHDRAW_CAMPAIGN") {
        const out = withdrawCampaign(
          world,
          state,
          { campaignId: campaign.id, actorId: campaign.politicianId },
          commandId,
        );
        if (!("error" in out)) events.push(...out.events);
        continue;
      }
    }
    const steps = campaign.actionPointsRemaining;
    for (let i = 0; i < steps; i++) {
      const live = state.campaignRuntime.campaigns[campaign.id];
      if (!live || live.status !== "active") break;
      if (live.actionPointsRemaining < 1) break;
      const choice = chooseCampaignAction(world, state, live, rng);
      if (!choice || choice.actionType === "WITHDRAW_CAMPAIGN") break;
      const applied = applyChosenAction(
        world,
        state,
        rng,
        live.id,
        live.politicianId,
        choice,
        commandId,
      );
      if (applied && !("error" in applied)) events.push(...applied.events);
      else break;
    }
  }

  events.push(...maybeDebates(state, world, rng, commandId));
  events.push(...maybePublicPolls(state, world, rng, commandId));
  events.push(...processNominationCalendar(state, world, rng, commandId));
  state.campaignRuntime.lastMonthProcessed = month;
  return events;
}

function npcDeclarations(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  const election = currentPresidentialElection(state);
  const contests = election
    ? presidentialNominationContestsForElection(state, election.id).filter(
        (contest) => contest.status === "open" || contest.status === "qualification",
      )
    : [];
  for (const contest of contests) {
    const ids = Object.keys(contest.entries).sort();
    for (const politicianId of ids) {
      if (politicianId === state.playerPoliticianId) continue;
      const entry = contest.entries[politicianId];
      if (!entry) continue;
      if (entry.status !== "potential" && entry.status !== "exploring") continue;
      const already = Object.values(state.campaignRuntime.campaigns).some(
        (c) =>
          c.politicianId === politicianId &&
          c.type === "presidential_nomination" &&
          (c.status === "active" || c.status === "exploring"),
      );
      if (already) continue;
      if (!chooseDeclare(world, state, politicianId, contest.id, rng)) continue;
      const out = declareCampaign(
        state,
        world,
        { politicianId, type: "presidential_nomination", contestId: contest.id },
        commandId,
      );
      if (!("error" in out)) events.push(...out.events);
    }
  }
  return events;
}

function applyChosenAction(
  world: KernelWorld,
  state: SimState,
  rng: RngService,
  campaignId: string,
  actorId: string,
  choice: { actionType: string; metadata: Record<string, unknown> },
  commandId: string,
): { events: SimEvent[] } | { error: { code: string; message: string } } | null {
  const meta = choice.metadata;
  switch (choice.actionType) {
    case "CAMPAIGN_FUNDRAISE":
      return campaignFundraise(world, state, rng, { campaignId, actorId }, commandId);
    case "CAMPAIGN_VISIT": {
      const geography = (meta.geography ?? { kind: "national", id: null }) as CampaignGeography;
      return campaignVisit(world, state, rng, { campaignId, geography, actorId }, commandId);
    }
    case "CAMPAIGN_ORGANIZE": {
      const constituencyId =
        typeof meta.constituencyId === "string"
          ? meta.constituencyId
          : Object.keys(world.constituencyElectorate).sort()[0];
      if (!constituencyId) return null;
      return campaignOrganize(world, state, { campaignId, constituencyId, actorId }, commandId);
    }
    case "CAMPAIGN_ADVERTISE": {
      const spend = typeof meta.spend === "number" ? Math.floor(meta.spend) : 0;
      if (spend < 1)
        return campaignFundraise(world, state, rng, { campaignId, actorId }, commandId);
      return campaignAdvertise(
        world,
        state,
        rng,
        {
          campaignId,
          spend,
          messageType: (typeof meta.messageType === "string"
            ? meta.messageType
            : "positive") as CampaignMessageType,
          geography: (meta.geography ?? { kind: "national", id: null }) as CampaignGeography,
          targetPoliticianId:
            typeof meta.targetPoliticianId === "string" ? meta.targetPoliticianId : null,
          issueId: typeof meta.issueId === "string" ? meta.issueId : null,
          actorId,
        },
        commandId,
      );
    }
    case "CAMPAIGN_MESSAGE":
      return campaignMessage(
        world,
        state,
        rng,
        {
          campaignId,
          issueId: typeof meta.issueId === "string" ? meta.issueId : null,
          actorId,
        },
        commandId,
      );
    case "CAMPAIGN_ATTACK":
      if (typeof meta.targetPoliticianId !== "string") return null;
      return campaignAttack(
        world,
        state,
        rng,
        { campaignId, targetPoliticianId: meta.targetPoliticianId, actorId },
        commandId,
      );
    case "CAMPAIGN_SEEK_ENDORSEMENT":
      return campaignSeekEndorsement(world, state, rng, { campaignId, actorId }, commandId);
    case "CAMPAIGN_SEEK_NOMINATION_SUPPORT":
      return campaignSeekNominationSupport(world, state, rng, { campaignId, actorId }, commandId);
    case "CAMPAIGN_PREPARE_DEBATE":
      return campaignPrepareDebate(world, state, { campaignId, actorId }, commandId);
    default:
      return null;
  }
}

function maybeDebates(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const events: SimEvent[] = [];
  const election = currentPresidentialElection(state);
  const contests = election
    ? presidentialNominationContestsForElection(state, election.id).filter(
        (contest) => contest.status === "open" || contest.status === "qualification",
      )
    : [];
  if (shouldHoldDebate(state.currentDate, "presidential_nomination")) {
    for (const contest of contests) {
      const already = Object.values(state.campaignRuntime.debates).some(
        (d) => d.contestId === contest.id && d.date === state.currentDate,
      );
      if (already) continue;
      const ids = Object.values(state.campaignRuntime.campaigns)
        .filter(
          (c) =>
            c.contestId === contest.id &&
            c.type === "presidential_nomination" &&
            c.status === "active",
        )
        .map((c) => c.politicianId)
        .sort();
      if (ids.length < 2) continue;
      const out = holdDebate(world, state, rng, {
        campaignType: "presidential_nomination",
        contestId: contest.id,
        electionId: null,
        participantIds: ids,
        commandId,
      });
      if (!("error" in out)) events.push(...out.events);
    }
  }
  if (shouldHoldDebate(state.currentDate, "presidential_general")) {
    const elections = Object.values(state.elections)
      .filter(
        (e) => e.type === "presidential" && e.status !== "resolved" && e.status !== "cancelled",
      )
      .sort((a, b) => (a.id < b.id ? -1 : 1));
    for (const election of elections) {
      const already = Object.values(state.campaignRuntime.debates).some(
        (d) => d.electionId === election.id && d.date === state.currentDate,
      );
      if (already) continue;
      const ids = Object.values(state.campaignRuntime.campaigns)
        .filter(
          (c) =>
            c.electionId === election.id &&
            c.type === "presidential_general" &&
            c.status === "active",
        )
        .map((c) => c.politicianId)
        .sort();
      if (ids.length < 2) continue;
      const out = holdDebate(world, state, rng, {
        campaignType: "presidential_general",
        contestId: null,
        electionId: election.id,
        participantIds: ids,
        commandId,
      });
      if (!("error" in out)) events.push(...out.events);
    }
  }
  return events;
}

function maybePublicPolls(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  void commandId;
  const events: SimEvent[] = [];
  const pollsters = Object.values(world.pollsters)
    .filter((p) => p.scope === "national")
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  if (pollsters.length === 0) return events;
  const month = parseIsoDate(state.currentDate).month;
  const cadenceOk = (cadence: string): boolean => {
    if (cadence === "weekly" || cadence === "monthly") return true;
    if (cadence === "quarterly") return month % 3 === 1;
    return month % 2 === 1;
  };
  const currentElection = currentPresidentialElection(state);
  const contests = currentElection
    ? presidentialNominationContestsForElection(state, currentElection.id).filter(
        (contest) => contest.status === "open" || contest.status === "qualification",
      )
    : [];
  const eligibleContests = contests
    .map((contest) => ({
      contest,
      ids: Object.values(contest.entries)
        .filter((e) => e.status === "declared" || e.status === "qualified")
        .map((e) => e.politicianId)
        .sort(),
    }))
    .filter((row) => row.ids.length >= 2)
    .sort((a, b) => (a.contest.id < b.contest.id ? -1 : 1));
  if (eligibleContests.length > 0) {
    const picked = eligibleContests[(month - 1) % eligibleContests.length]!;
    const p = pollsters.find((x) => cadenceOk(x.cadence)) ?? pollsters[0]!;
    const partyByCandidate: Record<string, string | null> = {};
    for (const id of picked.ids) partyByCandidate[id] = state.politicians[id]?.partyId ?? null;
    const out = createPoll(world, state, rng, {
      pollsterId: p.id,
      electionId: null,
      geographyKind: "national",
      candidateIds: picked.ids,
      partyByCandidate,
      fieldStart: state.currentDate,
      fieldEnd: state.currentDate,
      publicationDate: state.currentDate,
    });
    if (!("error" in out)) {
      out.poll.metadata.contestId = picked.contest.id;
      out.poll.metadata.purpose = "nomination";
    }
  }
  const elections = Object.values(state.elections)
    .filter(
      (e) =>
        e.type === "presidential" &&
        e.status !== "resolved" &&
        e.status !== "cancelled" &&
        activeElectionCandidateIds(e).length >= 2,
    )
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const election = elections[0];
  if (election) {
    const ids = activeElectionCandidateIds(election).sort();
    const p = pollsters.find((x) => cadenceOk(x.cadence)) ?? pollsters[0]!;
    const partyByCandidate: Record<string, string | null> = {};
    for (const id of ids) {
      partyByCandidate[id] =
        election.candidates[id]?.partyId ?? state.politicians[id]?.partyId ?? null;
    }
    createPoll(world, state, rng, {
      pollsterId: p.id,
      electionId: election.id,
      geographyKind: "national",
      candidateIds: ids,
      partyByCandidate,
      fieldStart: state.currentDate,
      fieldEnd: state.currentDate,
      publicationDate: state.currentDate,
    });
  }
  return events;
}

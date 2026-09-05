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
  campaignGotv,
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
import type { CampaignGeography, CampaignMessageType, CampaignState } from "./types.js";
import { nominationQualificationNeed } from "./qualification.js";

function stableCampaignHash(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function monthlyNpcFieldPlan(
  world: KernelWorld,
  state: SimState,
  campaign: CampaignState,
): { actionType: string; metadata: Record<string, unknown> } {
  const need = nominationQualificationNeed(world, state, campaign);
  if (need === "member" || need === "provincial")
    return { actionType: "CAMPAIGN_SEEK_NOMINATION_SUPPORT", metadata: {} };
  if (campaign.contestId && (need === "caucus" || need === "orgs"))
    return { actionType: "CAMPAIGN_SEEK_ENDORSEMENT", metadata: {} };
  if (campaign.cashOnHand < 12_000) return { actionType: "CAMPAIGN_FUNDRAISE", metadata: {} };
  const home =
    state.politicians[campaign.politicianId]?.homeProvinceId ??
    world.politicianHomeProvince[campaign.politicianId] ??
    null;
  const geography: CampaignGeography = home
    ? { kind: "province", id: home }
    : { kind: "national", id: null };
  if (campaign.fieldOrganization < 0.28 && home)
    return { actionType: "CAMPAIGN_ORGANIZE", metadata: { geography } };
  const rotation = stableCampaignHash(`${campaign.id}:${state.currentDate}`) % 5;
  if (rotation === 0) return { actionType: "CAMPAIGN_VISIT", metadata: { geography } };
  if (rotation === 1)
    return {
      actionType: "CAMPAIGN_MESSAGE",
      metadata: {
        issueId:
          world.issueIds[
            stableCampaignHash(`${campaign.id}:issue`) % Math.max(1, world.issueIds.length)
          ] ?? null,
      },
    };
  if (rotation === 2)
    return {
      actionType: "CAMPAIGN_ADVERTISE",
      metadata: {
        spend: Math.min(campaign.cashOnHand, 25_000),
        messageType: "positive",
        geography: { kind: "national", id: null },
      },
    };
  if (rotation === 3) return { actionType: "CAMPAIGN_PREPARE_DEBATE", metadata: {} };
  return { actionType: "CAMPAIGN_FUNDRAISE", metadata: {} };
}

export function processCampaignMonth(
  state: SimState,
  world: KernelWorld,
  rng: RngService,
  commandId: string,
): SimEvent[] {
  const month = monthStart(state.currentDate);
  if (state.campaignRuntime.lastMonthProcessed === month) return [];
  const events: SimEvent[] = [];
  const profile = (
    globalThis as typeof globalThis & { __lorsainStageTimings?: Record<string, number[]> }
  ).__lorsainStageTimings;
  const timed = <T>(stage: string, fn: () => T): T => {
    if (!profile) return fn();
    const started = performance.now();
    const result = fn();
    (profile[`campaign.${stage}`] ??= []).push(performance.now() - started);
    return result;
  };

  events.push(
    ...timed("assembly_filing", () => processAssemblyFilingCalendar(state, world, commandId)),
  );
  events.push(...timed("open_contests", () => openDueNominationContests(state, world, commandId)));
  events.push(...timed("declarations", () => npcDeclarations(state, world, rng, commandId)));

  timed("npc_actions", () => {
    for (const campaign of activeCampaigns(state)) {
      applyOrganizationMaintenance(campaign);
      decayMomentum(world, state, campaign.politicianId);
      ensureActionPoints(world, state, campaign);
      if (campaign.politicianId === state.playerPoliticianId) continue;
      if (campaign.status !== "active") continue;
      const monthlyChoice = monthlyNpcFieldPlan(world, state, campaign);
      if (shouldConsiderWithdraw(world, state, campaign)) {
        const withdrawalChoice = chooseCampaignAction(world, state, campaign, rng);
        if (withdrawalChoice?.actionType === "WITHDRAW_CAMPAIGN") {
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
      if (monthlyChoice.actionType === "WITHDRAW_CAMPAIGN") continue;
      // One composite NPC field plan per month keeps large multi-candidate cycles responsive.
      // The player retains the full action-point interface and explicit control.
      const steps = Math.min(1, campaign.actionPointsRemaining);
      for (let i = 0; i < steps; i++) {
        const live = state.campaignRuntime.campaigns[campaign.id];
        if (!live || live.status !== "active") break;
        if (live.actionPointsRemaining < 1) break;
        const applied = applyChosenAction(
          world,
          state,
          rng,
          live.id,
          live.politicianId,
          monthlyChoice,
          commandId,
        );
        if (applied && !("error" in applied)) events.push(...applied.events);
        else break;
      }
    }
  });

  events.push(...timed("debates", () => maybeDebates(state, world, rng, commandId)));
  events.push(...timed("polls", () => maybePublicPolls(state, world, rng, commandId)));
  events.push(
    ...timed("nomination_calendar", () => processNominationCalendar(state, world, rng, commandId)),
  );
  state.campaignRuntime.lastMonthProcessed = month;
  return events;
}

export function applyOrganizationMaintenance(campaign: CampaignState): void {
  campaign.fieldOrganization = Math.max(0.05, campaign.fieldOrganization * 0.992);
  for (const [provinceId, value] of Object.entries(campaign.organizationByProvince)) {
    campaign.organizationByProvince[provinceId] = Math.max(0.015, value * 0.985);
  }
  for (const [constituencyId, value] of Object.entries(campaign.organizationByConstituency)) {
    campaign.organizationByConstituency[constituencyId] = Math.max(0.008, value * 0.97);
  }
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
      const geography = isCampaignGeography(meta.geography) ? meta.geography : null;
      if (!geography) return null;
      return campaignOrganize(world, state, { campaignId, geography, actorId }, commandId);
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
    case "CAMPAIGN_GOTV": {
      const geography = isCampaignGeography(meta.geography) ? meta.geography : null;
      if (!geography) return null;
      return campaignGotv(world, state, { campaignId, geography, actorId }, commandId);
    }
    default:
      return null;
  }
}

function isCampaignGeography(value: unknown): value is CampaignGeography {
  if (value == null || typeof value !== "object") return false;
  const raw = value as { kind?: unknown; id?: unknown };
  return (raw.kind === "province" || raw.kind === "constituency") && typeof raw.id === "string";
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
  // Public national fieldwork is quarterly outside the final count; this avoids
  // manufacturing a new poll every month and keeps long saves compact.
  if (month % 3 !== 1) return events;
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

    // One rotating provincial sample gives the public a legitimate geographic
    // window without pretending that every province is polled every quarter.
    const provinceId = world.provinceIds.slice().sort()[
      stableCampaignHash(`${election.id}:${state.currentDate.slice(0, 7)}:province-poll`) %
        Math.max(1, world.provinceIds.length)
    ];
    if (provinceId) {
      const regional = createPoll(world, state, rng, {
        pollsterId: p.id,
        electionId: election.id,
        geographyKind: "province",
        provinceId,
        candidateIds: ids,
        partyByCandidate,
        fieldStart: state.currentDate,
        fieldEnd: state.currentDate,
        publicationDate: state.currentDate,
      });
      if (!("error" in regional)) regional.poll.metadata.purpose = "presidential_province";
    }
  }

  const assemblyElection = Object.values(state.elections)
    .filter(
      (candidate) =>
        candidate.type === "assembly" &&
        candidate.status !== "resolved" &&
        candidate.status !== "cancelled" &&
        candidate.assembly,
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))[0];
  const constituencyFields = Object.values(assemblyElection?.assembly?.constituencyFields ?? {})
    .filter((field) => field.candidateIds.length >= 2)
    .sort((a, b) => {
      const aHash = stableCampaignHash(`${assemblyElection?.id}:${a.constituencyId}:public-poll`);
      const bHash = stableCampaignHash(`${assemblyElection?.id}:${b.constituencyId}:public-poll`);
      return aHash - bHash || a.constituencyId.localeCompare(b.constituencyId);
    });
  const constituencyField =
    constituencyFields[
      stableCampaignHash(`${state.currentDate.slice(0, 7)}:constituency-poll`) %
        Math.max(1, constituencyFields.length)
    ];
  if (assemblyElection && constituencyField) {
    const partyByCandidate = Object.fromEntries(
      constituencyField.candidateIds.map((candidateId) => [
        candidateId,
        assemblyElection.assembly?.candidacies[candidateId]?.partyId ??
          state.politicians[candidateId]?.partyId ??
          null,
      ]),
    );
    const local = createPoll(world, state, rng, {
      pollsterId: pollsters[0]!.id,
      electionId: null,
      geographyKind: "constituency",
      constituencyId: constituencyField.constituencyId,
      candidateIds: constituencyField.candidateIds,
      partyByCandidate,
      fieldStart: state.currentDate,
      fieldEnd: state.currentDate,
      publicationDate: state.currentDate,
    });
    if (!("error" in local)) {
      local.poll.metadata.electionId = assemblyElection.id;
      local.poll.metadata.purpose = "assembly_constituency";
    }
  }

  const governorRace = Object.values(state.provincialRuntime.elections)
    .filter(
      (race) =>
        race.status === "field_finalized" &&
        Object.values(race.candidates).filter((candidate) => !candidate.withdrawn).length >= 2,
    )
    .sort((a, b) => {
      const aHash = stableCampaignHash(`${a.id}:${state.currentDate.slice(0, 7)}:governor-poll`);
      const bHash = stableCampaignHash(`${b.id}:${state.currentDate.slice(0, 7)}:governor-poll`);
      return aHash - bHash || a.id.localeCompare(b.id);
    })[0];
  if (governorRace) {
    const candidates = Object.values(governorRace.candidates).filter(
      (candidate) => !candidate.withdrawn,
    );
    const local = createPoll(world, state, rng, {
      pollsterId: pollsters[0]!.id,
      electionId: null,
      geographyKind: "province",
      provinceId: governorRace.provinceId,
      candidateIds: candidates.map((candidate) => candidate.politicianId),
      partyByCandidate: Object.fromEntries(
        candidates.map((candidate) => [candidate.politicianId, candidate.partyId]),
      ),
      fieldStart: state.currentDate,
      fieldEnd: state.currentDate,
      publicationDate: state.currentDate,
    });
    if (!("error" in local)) {
      local.poll.metadata.electionId = governorRace.id;
      local.poll.metadata.purpose = "gubernatorial_province";
    }
  }
  return events;
}

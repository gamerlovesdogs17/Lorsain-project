import type { KernelWorld, SimState } from "@lorsain/sim";
export declare function politicianName(figures: Map<string, {
    name: string;
}>, id: string, state?: SimState | null): string;
/** Public standing for display — never leaves officeholders as blank "unknown". */
export declare function publicStandingLabel(world: KernelWorld, state: SimState, politicianId: string): string;
export declare function partyName(world: KernelWorld, partyId: string | null): string;
export declare function qualitativeStanding(n: number | undefined | null): string;
/** Public campaign presentation: bounded, readable strength rather than a raw 0–1 coefficient. */
export declare function groundGameStrength(n: number | undefined | null): number;
export declare function playerOffices(world: KernelWorld, state: SimState, id: string): string[];
export declare function isMp(world: KernelWorld, state: SimState, id: string): boolean;
export declare function isSpeaker(world: KernelWorld, state: SimState, id: string): boolean;
export declare function isPresident(world: KernelWorld, state: SimState, id: string): boolean;
export declare function playerCampaign(state: SimState): import("@lorsain/sim").CampaignState | undefined;
export declare function cabinet(world: KernelWorld, state: SimState): {
    officeId: string;
    title: string;
    portfolio: string | null;
    holderId: string | null;
}[];
export declare function holdersOfKind(world: KernelWorld, state: SimState, officeId: string): string[];
//# sourceMappingURL=format.d.ts.map
import type { ContentBundle } from "@lorsain/content-loader";
import { type KernelWorld, type SimEvent, type SimState, type Simulation } from "@lorsain/sim";
import { playerCampaign } from "./format.js";
export type Screen = "home" | "career" | "assembly" | "party" | "campaign" | "elections" | "executive" | "terena" | "archive";
export type Figure = {
    id: string;
    name: string;
    office?: string;
    party?: string;
    faction?: string;
    home?: string;
    notes?: string;
    display_summary?: string;
    birth_date?: string;
    party_id?: string | null;
    faction_id?: string | null;
    presidential_status?: string | null;
};
export declare function GamePages(props: {
    screen: Screen;
    world: KernelWorld;
    snap: SimState;
    sim: Simulation;
    bundle: ContentBundle;
    figures: Map<string, Figure>;
    offices: string[];
    events: SimEvent[];
    campaign: ReturnType<typeof playerCampaign>;
    selectedBill: string | null;
    setSelectedBill: (id: string | null) => void;
    mapHover: string | null;
    setMapHover: (id: string | null) => void;
    debug: boolean;
    setDebug: (v: boolean) => void;
    onDone: () => void;
}): import("react").JSX.Element;
//# sourceMappingURL=pages.d.ts.map
import type { ContentBundle } from "@lorsain/content-loader";
import { type CommandResult, type KernelWorld, type SimEvent, type SimState, type Simulation } from "@lorsain/sim";
import { playerCampaign } from "./format.js";
import { type PresentationCatalog } from "./presentation.js";
export type Screen = "home" | "career" | "assembly" | "party" | "campaign" | "elections" | "executive" | "courts" | "economy" | "organizations" | "news" | "foreign" | "terena" | "archive";
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
type PageProps = {
    screen: Screen;
    world: KernelWorld;
    snap: SimState;
    sim: Simulation;
    bundle: ContentBundle;
    catalog: PresentationCatalog;
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
    report: (r: CommandResult) => boolean;
    askConfirm: (opts: {
        title: string;
        body: string;
        confirmLabel?: string;
        action: () => void;
    }) => void;
};
export declare function GamePages(props: PageProps): import("react").JSX.Element;
export {};
//# sourceMappingURL=pages.d.ts.map
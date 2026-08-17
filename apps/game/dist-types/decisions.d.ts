import type { PendingInterrupt, SimState, Simulation } from "@lorsain/sim";
import type { KernelWorld } from "@lorsain/sim";
export declare function DecisionPanel(props: {
    world: KernelWorld;
    snap: SimState;
    sim: Simulation;
    interrupt: PendingInterrupt | null;
    mp: boolean;
    president: boolean;
    speaker: boolean;
    onDone: () => void;
}): import("react").JSX.Element | null;
//# sourceMappingURL=decisions.d.ts.map
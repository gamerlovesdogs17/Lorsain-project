import type { KernelWorld, SimState, Simulation } from "@lorsain/sim";
import type { CommandResult } from "@lorsain/sim";
export declare function DecisionPanel(props: {
    world: KernelWorld;
    snap: SimState;
    sim: Simulation;
    onDone: () => void;
    report: (result: CommandResult) => boolean;
    countingElection: boolean;
    onResolveAssembly: () => void;
    onResolvePresidential: () => void;
}): import("react").JSX.Element | null;
//# sourceMappingURL=decisions.d.ts.map
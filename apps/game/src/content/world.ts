import { buildKernelWorldFromTerenaBundle, type KernelWorld } from "@lorsain/sim";
import type { ContentBundle } from "@lorsain/content-loader";

/** Terena bundled content → kernel world (canonical New Game path). */
export function kernelWorldFromBundle(bundle: ContentBundle): KernelWorld {
  return buildKernelWorldFromTerenaBundle(bundle);
}

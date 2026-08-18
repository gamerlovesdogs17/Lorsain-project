import { padId } from "../scheduler.js";
import type { SimState } from "../types.js";

export function allocateMediaStoryId(state: SimState): string {
  return padId("NEWS", state.counters.nextMediaStoryId++);
}

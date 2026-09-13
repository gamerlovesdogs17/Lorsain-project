export const SCENARIO_FORMAT = "lorsain-scenario" as const;
export const SCENARIO_FORMAT_VERSION = 1 as const;
/** Guard against accidental multi-megabyte imports in the browser. */
export const SCENARIO_MAX_BYTES = 8 * 1024 * 1024;

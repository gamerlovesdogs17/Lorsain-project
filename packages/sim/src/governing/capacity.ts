import type { KernelWorld, SimState } from "../types.js";
import { seedMinistriesIfNeeded } from "../executive/state.js";
import {
  DEPARTMENT_IDS,
  type CapacityState,
  type DepartmentId,
  type ImplementationPosture,
} from "./types.js";
import { ensureGoverningRuntime } from "./state.js";
import { departmentFromOfficeId } from "./departments.js";

export function clampUnit(n: number): number {
  if (!Number.isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

/** Sync department + provincial capacity from executive / provincial runtime where present. */
export function syncCapacityFromExecutive(world: KernelWorld, state: SimState): CapacityState {
  seedMinistriesIfNeeded(world, state);
  const runtime = ensureGoverningRuntime(state);
  const departments = { ...runtime.capacity.departments };
  let sum = 0;
  let count = 0;
  for (const id of DEPARTMENT_IDS) {
    const officeId = Object.keys(state.executiveRuntime.ministries).find(
      (oid) => departmentFromOfficeId(oid) === id,
    );
    const admin = officeId
      ? state.executiveRuntime.ministries[officeId]?.administrativeCapacity
      : null;
    if (typeof admin === "number") {
      departments[id] = clampUnit(admin);
    } else {
      departments[id] = clampUnit(departments[id] ?? 0.55);
    }
    sum += departments[id]!;
    count += 1;
  }
  runtime.capacity.departments = departments;
  runtime.capacity.national = clampUnit(count > 0 ? sum / count : 0.55);
  runtime.capacity.strain = clampUnit(runtime.capacity.strain);

  const provinces = { ...(runtime.capacity.provinces ?? {}) };
  for (const provinceId of Object.keys(state.provincialRuntime.provinces ?? {})) {
    if (provinces[provinceId] == null) {
      // Seed mid capacity; variance is applied via setProvinceCapacity / law metadata.
      provinces[provinceId] = 0.55;
    } else {
      provinces[provinceId] = clampUnit(provinces[provinceId]!);
    }
  }
  runtime.capacity.provinces = provinces;
  return runtime.capacity;
}

export function departmentCapacity(state: SimState, departmentId: DepartmentId): number {
  const runtime = ensureGoverningRuntime(state);
  return clampUnit(runtime.capacity.departments[departmentId] ?? runtime.capacity.national);
}

export function provinceCapacity(state: SimState, provinceId: string | null | undefined): number {
  if (!provinceId) return 0.55;
  const runtime = ensureGoverningRuntime(state);
  return clampUnit(runtime.capacity.provinces?.[provinceId] ?? runtime.capacity.national);
}

/**
 * Effective implementation capacity for a department, optionally damped by province capacity
 * when the law is province-scoped (metadata.provinceId) or when an average provincial factor is supplied.
 */
export function effectiveCapacity(
  state: SimState,
  departmentId: DepartmentId,
  provinceId?: string | null,
): number {
  const runtime = ensureGoverningRuntime(state);
  const dept = departmentCapacity(state, departmentId);
  const national = clampUnit(runtime.capacity.national);
  const strain = clampUnit(runtime.capacity.strain);
  let base = dept * 0.65 + national * 0.35 - strain * 0.25;
  if (provinceId) {
    const prov = provinceCapacity(state, provinceId);
    base = base * 0.7 + prov * 0.3;
  }
  return clampUnit(base);
}

export function setProvinceCapacity(state: SimState, provinceId: string, value: number): void {
  const runtime = ensureGoverningRuntime(state);
  if (!runtime.capacity.provinces) runtime.capacity.provinces = {};
  runtime.capacity.provinces[provinceId] = clampUnit(value);
}

/** Accelerated posture raises short-term administrative strain. */
export function applyImplementationStrain(
  state: SimState,
  posture: ImplementationPosture,
  major: boolean,
): void {
  const runtime = ensureGoverningRuntime(state);
  let delta = 0;
  if (posture === "accelerated") delta = major ? 0.08 : 0.04;
  else if (posture === "phased") delta = major ? -0.02 : -0.01;
  else delta = major ? 0.01 : 0;
  runtime.capacity.strain = clampUnit(runtime.capacity.strain + delta);
}

/** Natural monthly decay of strain. */
export function decayCapacityStrain(state: SimState): void {
  const runtime = ensureGoverningRuntime(state);
  runtime.capacity.strain = clampUnit(runtime.capacity.strain - 0.015);
}

export function setDepartmentCapacity(
  state: SimState,
  departmentId: DepartmentId,
  value: number,
): void {
  const runtime = ensureGoverningRuntime(state);
  runtime.capacity.departments[departmentId] = clampUnit(value);
  const vals = DEPARTMENT_IDS.map((id) => runtime.capacity.departments[id] ?? 0.55);
  runtime.capacity.national = clampUnit(vals.reduce((a, b) => a + b, 0) / vals.length);
}

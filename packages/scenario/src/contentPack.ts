export const CONTENT_PACK_FORMAT = "lorsain-content-pack" as const;
export const CONTENT_PACK_FORMAT_VERSION = 1 as const;

export type ContentPackValidationSeverity = "error" | "warning" | "suggestion";

export type ContentPackValidationIssue = {
  path: string;
  code: string;
  severity: ContentPackValidationSeverity;
  message: string;
  fixHint?: string;
};

export type ContentPackValidationReport = {
  errors: ContentPackValidationIssue[];
  warnings: ContentPackValidationIssue[];
  suggestions: ContentPackValidationIssue[];
};

export type ContentPackCategories = {
  situations?: Array<{ id: string; title?: string; [key: string]: unknown }>;
  scandals?: Array<{ id: string; title?: string; [key: string]: unknown }>;
  organizations?: Array<{ id: string; name?: string; [key: string]: unknown }>;
  foreignCrises?: Array<{ id: string; title?: string; [key: string]: unknown }>;
  treaties?: Array<{ id: string; title?: string; [key: string]: unknown }>;
  billTemplates?: Array<{ id: string; title?: string; [key: string]: unknown }>;
};

export type ContentPackDocument = {
  format: typeof CONTENT_PACK_FORMAT;
  formatVersion: typeof CONTENT_PACK_FORMAT_VERSION;
  packId: string;
  name: string;
  author?: string;
  version: string;
  gameCompatibility?: string;
  dependencies?: Array<{ packId: string; version?: string }>;
  categories: ContentPackCategories;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function categoryIds(
  items: Array<{ id: string }> | undefined,
  prefix: string,
): Array<{ path: string; id: string }> {
  if (!items) return [];
  return items.map((item, i) => ({ path: `${prefix}[${i}].id`, id: item.id }));
}

export function parseContentPack(raw: unknown): ContentPackDocument {
  if (!isRecord(raw)) throw new Error("Content pack must be a JSON object");
  if (raw.format !== CONTENT_PACK_FORMAT) {
    throw new Error(`format must be "${CONTENT_PACK_FORMAT}"`);
  }
  if (raw.formatVersion !== CONTENT_PACK_FORMAT_VERSION) {
    throw new Error(`formatVersion must be ${CONTENT_PACK_FORMAT_VERSION}`);
  }
  if (typeof raw.packId !== "string" || !raw.packId.trim()) {
    throw new Error("packId is required");
  }
  if (typeof raw.name !== "string" || !raw.name.trim()) {
    throw new Error("name is required");
  }
  if (typeof raw.version !== "string" || !raw.version.trim()) {
    throw new Error("version is required");
  }
  const categoriesRaw = raw.categories;
  const categories: ContentPackCategories = isRecord(categoriesRaw) ? { ...categoriesRaw } : {};
  return {
    format: CONTENT_PACK_FORMAT,
    formatVersion: CONTENT_PACK_FORMAT_VERSION,
    packId: raw.packId,
    name: raw.name,
    version: raw.version,
    categories,
    ...(typeof raw.author === "string" ? { author: raw.author } : {}),
    ...(typeof raw.gameCompatibility === "string"
      ? { gameCompatibility: raw.gameCompatibility }
      : {}),
    ...(Array.isArray(raw.dependencies)
      ? {
          dependencies: raw.dependencies.filter(isRecord).map((d) => ({
            packId: String(d.packId ?? ""),
            ...(typeof d.version === "string" ? { version: d.version } : {}),
          })),
        }
      : {}),
  };
}

export function validateContentPack(
  raw: unknown,
  options?: { availablePackIds?: Set<string> },
): ContentPackValidationReport {
  const errors: ContentPackValidationIssue[] = [];
  const warnings: ContentPackValidationIssue[] = [];
  const suggestions: ContentPackValidationIssue[] = [];

  let doc: ContentPackDocument;
  try {
    doc = parseContentPack(raw);
  } catch (e) {
    return {
      errors: [
        {
          path: "",
          code: "PARSE_FAILED",
          severity: "error",
          message: e instanceof Error ? e.message : String(e),
        },
      ],
      warnings: [],
      suggestions: [],
    };
  }

  const seen = new Map<string, string>();
  const buckets: Array<[string, Array<{ id: string }> | undefined]> = [
    ["categories.situations", doc.categories.situations as Array<{ id: string }> | undefined],
    ["categories.scandals", doc.categories.scandals as Array<{ id: string }> | undefined],
    ["categories.organizations", doc.categories.organizations as Array<{ id: string }> | undefined],
    ["categories.foreignCrises", doc.categories.foreignCrises as Array<{ id: string }> | undefined],
    ["categories.treaties", doc.categories.treaties as Array<{ id: string }> | undefined],
    ["categories.billTemplates", doc.categories.billTemplates as Array<{ id: string }> | undefined],
  ];

  for (const [prefix, list] of buckets) {
    for (const { path, id } of categoryIds(list, prefix)) {
      if (!id) {
        errors.push({
          path,
          code: "MISSING_ID",
          severity: "error",
          message: "Every content pack entry requires a stable id",
          fixHint: "Add a unique uppercase id string",
        });
        continue;
      }
      const prev = seen.get(id);
      if (prev) {
        errors.push({
          path,
          code: "DUPLICATE_ID",
          severity: "error",
          message: `Duplicate id "${id}" also used at ${prev}`,
          fixHint: "Rename one entry or merge duplicates",
        });
      } else {
        seen.set(id, path);
      }
    }
  }

  for (const [i, dep] of (doc.dependencies ?? []).entries()) {
    const path = `dependencies[${i}]`;
    if (!dep.packId?.trim()) {
      errors.push({
        path: `${path}.packId`,
        code: "MISSING_DEP",
        severity: "error",
        message: "Dependency packId is required",
        fixHint: "Reference another pack by packId",
      });
      continue;
    }
    if (dep.packId === doc.packId) {
      warnings.push({
        path,
        code: "SELF_DEPENDENCY",
        severity: "warning",
        message: "Pack lists itself as a dependency",
      });
    }
    if (options?.availablePackIds && !options.availablePackIds.has(dep.packId)) {
      errors.push({
        path: `${path}.packId`,
        code: "MISSING_DEPENDENCY_PACK",
        severity: "error",
        message: `Required content pack "${dep.packId}" is not installed`,
        fixHint: `Install or enable pack ${dep.packId} before loading this pack`,
      });
    }
  }

  if (!doc.gameCompatibility?.trim()) {
    suggestions.push({
      path: "gameCompatibility",
      code: "ADD_COMPAT",
      severity: "suggestion",
      message: "Set gameCompatibility to document which Lorsain versions this pack targets",
    });
  }

  return { errors, warnings, suggestions };
}

export function exportContentPackJson(doc: ContentPackDocument): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

export function importContentPackJson(text: string):
  | {
      ok: true;
      document: ContentPackDocument;
      report: ContentPackValidationReport;
    }
  | {
      ok: false;
      error: string;
      report: ContentPackValidationReport;
    } {
  try {
    const raw = JSON.parse(text) as unknown;
    const document = parseContentPack(raw);
    const report = validateContentPack(document);
    if (report.errors.length > 0) {
      return {
        ok: false,
        error: report.errors[0]?.message ?? "Content pack validation failed",
        report,
      };
    }
    return { ok: true, document, report };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Invalid content pack JSON",
      report: { errors: [], warnings: [], suggestions: [] },
    };
  }
}

export function detectIdCollisionsAcrossPacks(
  packs: ContentPackDocument[],
): ContentPackValidationIssue[] {
  const global = new Map<string, { packId: string; path: string }>();
  const issues: ContentPackValidationIssue[] = [];
  for (const pack of packs) {
    const report = validateContentPack(pack);
    if (report.errors.length) continue;
    const buckets: Array<[string, Array<{ id: string }> | undefined]> = [
      ["categories.situations", pack.categories.situations as Array<{ id: string }> | undefined],
      ["categories.scandals", pack.categories.scandals as Array<{ id: string }> | undefined],
      [
        "categories.organizations",
        pack.categories.organizations as Array<{ id: string }> | undefined,
      ],
      [
        "categories.foreignCrises",
        pack.categories.foreignCrises as Array<{ id: string }> | undefined,
      ],
      ["categories.treaties", pack.categories.treaties as Array<{ id: string }> | undefined],
      [
        "categories.billTemplates",
        pack.categories.billTemplates as Array<{ id: string }> | undefined,
      ],
    ];
    for (const [prefix, list] of buckets) {
      for (const { path, id } of categoryIds(list, prefix)) {
        const key = id;
        const prev = global.get(key);
        if (prev) {
          issues.push({
            path: `${pack.packId}:${path}`,
            code: "CROSS_PACK_COLLISION",
            severity: "error",
            message: `Id "${id}" in pack ${pack.packId} collides with ${prev.packId} (${prev.path})`,
            fixHint: "Use pack-prefixed ids or disable one of the packs",
          });
        } else {
          global.set(key, { packId: pack.packId, path });
        }
      }
    }
  }
  return issues;
}

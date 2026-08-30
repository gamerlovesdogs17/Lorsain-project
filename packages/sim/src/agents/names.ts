const PUBLIC_FIRST_NAMES = [
  "Adela", "Adrian", "Alina", "Amira", "Andrej", "Anika", "Ariana", "Bastian",
  "Borek", "Celia", "Celine", "Dara", "Davor", "Dorian", "Elena", "Elian", "Eliska",
  "Emil", "Farah", "Farid", "Gisela", "Gregor", "Hana", "Henrik", "Ilan", "Ilona",
  "Ines", "Irena", "Jarek", "Jonas", "Jovan", "Kaja", "Kamil", "Karina", "Klara",
  "Leona", "Levan", "Lukas", "Mara", "Marek", "Mina", "Mirela", "Nadia", "Nadir",
  "Niko", "Noemi", "Oren", "Oskar", "Pavla", "Petra", "Rafael", "Ruben", "Sabina",
  "Sami", "Selma", "Soren", "Talia", "Tomas", "Valeria", "Vera", "Viktor", "Wiktor",
  "Yara", "Yasmin", "Zdena", "Zora",
] as const;

const PUBLIC_FAMILY_NAMES = [
  "Aldren", "Ardel", "Arven", "Baric", "Belen", "Borsic", "Brenic", "Cadan", "Cavor",
  "Cevik", "Dalen", "Delvar", "Deren", "Dobrev", "Eris", "Esren", "Estrel", "Falken",
  "Faron", "Fedorin", "Galen", "Gavric", "Gorvic", "Havel", "Hedran", "Horvat", "Ilyan",
  "Iskar", "Iven", "Jasker", "Joric", "Kadar", "Korven", "Kovren", "Kresic", "Ladic",
  "Laska", "Leric", "Marin", "Matic", "Meran", "Narek", "Novak", "Novic", "Ordan",
  "Orlic", "Ostir", "Pavelic", "Peran", "Petren", "Quarin", "Radan", "Radek", "Ristic",
  "Selic", "Soric", "Taren", "Tavel", "Uldar", "Ulen", "Varik", "Vesnic", "Walen",
  "Woran", "Yoric", "Zelen", "Zoric",
] as const;

function stableHash(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function lastToken(name: string): string {
  return name.trim().split(/\s+/).at(-1) ?? name;
}

/**
 * Deterministic public-name selection with concentration control. Existing
 * names influence only which unused, least-repeated first/family combination
 * is chosen; no gameplay RNG stream is consumed.
 */
export function selectGeneratedPublicName(existingNames: Iterable<string>, salt: string): string {
  const used = new Set<string>();
  const firstCounts = new Map<string, number>();
  const familyCounts = new Map<string, number>();
  for (const raw of existingNames) {
    const name = raw.trim();
    if (!name) continue;
    used.add(name);
    const [first] = name.split(/\s+/);
    const family = lastToken(name);
    if (first) firstCounts.set(first, (firstCounts.get(first) ?? 0) + 1);
    if (family) familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
  }
  const families = PUBLIC_FAMILY_NAMES.slice().sort(
    (a, b) =>
      (familyCounts.get(a) ?? 0) - (familyCounts.get(b) ?? 0) ||
      stableHash(`${salt}:family:${a}`) - stableHash(`${salt}:family:${b}`) ||
      a.localeCompare(b),
  );
  const firsts = PUBLIC_FIRST_NAMES.slice().sort(
    (a, b) =>
      (firstCounts.get(a) ?? 0) - (firstCounts.get(b) ?? 0) ||
      stableHash(`${salt}:first:${a}`) - stableHash(`${salt}:first:${b}`) ||
      a.localeCompare(b),
  );
  for (const family of families) {
    for (const first of firsts) {
      const candidate = `${first} ${family}`;
      if (!used.has(candidate)) return candidate;
    }
  }
  // The checked-in pools support more than four thousand unique public names.
  // A suffix is a final defensive fallback for centuries-long or modified saves.
  const first = firsts[0] ?? "Ari";
  const family = families[0] ?? "Teren";
  return `${first} ${family} ${stableHash(salt).toString(36).toUpperCase()}`;
}

export function generatedNameConcentration(names: Iterable<string>): {
  duplicateFullNames: string[];
  largestFirstNameShare: number;
  largestFamilyNameShare: number;
} {
  const rows = [...names].map((name) => name.trim()).filter(Boolean);
  const duplicates = new Set<string>();
  const seen = new Set<string>();
  const firstCounts = new Map<string, number>();
  const familyCounts = new Map<string, number>();
  for (const name of rows) {
    if (seen.has(name)) duplicates.add(name);
    seen.add(name);
    const first = name.split(/\s+/)[0] ?? name;
    const family = lastToken(name);
    firstCounts.set(first, (firstCounts.get(first) ?? 0) + 1);
    familyCounts.set(family, (familyCounts.get(family) ?? 0) + 1);
  }
  const maxShare = (counts: Map<string, number>) =>
    rows.length > 0 ? Math.max(0, ...counts.values()) / rows.length : 0;
  return {
    duplicateFullNames: [...duplicates].sort(),
    largestFirstNameShare: maxShare(firstCounts),
    largestFamilyNameShare: maxShare(familyCounts),
  };
}

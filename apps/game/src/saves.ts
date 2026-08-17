import { Dexie, type EntityTable } from "dexie";
import type { SaveFile } from "@lorsain/sim";

export type SavedGameRow = {
  id: string;
  name: string;
  savedAt: string;
  playerName: string;
  date: string;
  save: SaveFile;
};

class LorsainSaves extends Dexie {
  games!: EntityTable<SavedGameRow, "id">;
  constructor() {
    super("lorsain-saves");
    this.version(1).stores({ games: "id, savedAt" });
  }
}

const db = new LorsainSaves();

export async function listSaves(): Promise<SavedGameRow[]> {
  return db.games.orderBy("savedAt").reverse().toArray();
}

export async function putSave(row: SavedGameRow): Promise<void> {
  await db.games.put(row);
}

export async function getSave(id: string): Promise<SavedGameRow | undefined> {
  return db.games.get(id);
}

export function downloadSave(save: SaveFile, filename: string): void {
  const blob = new Blob([JSON.stringify(save, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function readImportedSave(file: File): Promise<SaveFile> {
  return file.text().then((text) => JSON.parse(text) as SaveFile);
}

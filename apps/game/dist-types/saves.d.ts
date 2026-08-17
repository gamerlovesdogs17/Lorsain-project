import type { SaveFile } from "@lorsain/sim";
export type SavedGameRow = {
    id: string;
    name: string;
    savedAt: string;
    playerName: string;
    date: string;
    save: SaveFile;
};
export declare function listSaves(): Promise<SavedGameRow[]>;
export declare function putSave(row: SavedGameRow): Promise<void>;
export declare function getSave(id: string): Promise<SavedGameRow | undefined>;
export declare function downloadSave(save: SaveFile, filename: string): void;
export declare function readImportedSave(file: File): Promise<SaveFile>;
//# sourceMappingURL=saves.d.ts.map
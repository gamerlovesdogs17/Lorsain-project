import { Dexie } from "dexie";
class LorsainSaves extends Dexie {
    games;
    constructor() {
        super("lorsain-saves");
        this.version(1).stores({ games: "id, savedAt" });
    }
}
const db = new LorsainSaves();
export async function listSaves() {
    return db.games.orderBy("savedAt").reverse().toArray();
}
export async function putSave(row) {
    await db.games.put(row);
}
export async function getSave(id) {
    return db.games.get(id);
}
export function downloadSave(save, filename) {
    const blob = new Blob([JSON.stringify(save, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
export function readImportedSave(file) {
    return file.text().then((text) => JSON.parse(text));
}
//# sourceMappingURL=saves.js.map
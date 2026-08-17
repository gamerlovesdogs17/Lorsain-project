import { buildContentBundle } from "@lorsain/content-loader";
const rawModules = import.meta.glob("../../../data/**/*.{json,md}", {
    query: "?raw",
    import: "default",
    eager: true,
});
const mapModules = import.meta.glob("../../../maps/**/*.svg", {
    query: "?raw",
    import: "default",
    eager: true,
});
function lookup(relativePath) {
    const suffix = relativePath.replace(/\\/g, "/");
    for (const [key, value] of Object.entries({ ...rawModules, ...mapModules })) {
        const normalized = key.replace(/\\/g, "/");
        if (normalized.endsWith(`/${suffix}`) || normalized.endsWith(suffix))
            return value;
    }
    return undefined;
}
export function createBrowserContentReader() {
    return {
        readText(relativePath) {
            const text = lookup(relativePath);
            if (text == null)
                throw new Error(`Missing canonical file ${relativePath}`);
            return text;
        },
        exists(relativePath) {
            return lookup(relativePath) != null;
        },
    };
}
export function loadBrowserContentBundle() {
    return buildContentBundle("browser", createBrowserContentReader());
}
//# sourceMappingURL=browserReader.js.map
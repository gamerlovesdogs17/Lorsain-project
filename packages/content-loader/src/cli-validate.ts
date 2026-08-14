import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateCanonicalContentFromRepo } from "./node.js";

const here = fileURLToPath(new URL(".", import.meta.url));
const repoRoot = resolve(here, "../../..");

const report = validateCanonicalContentFromRepo(repoRoot);
console.log(report.summary);
for (const issue of report.issues) {
  console.log(`${issue.level.toUpperCase()}: ${issue.message}`);
}
if (!report.ok) {
  console.log("FAIL: canonical content integrity checks failed");
  process.exit(1);
}
console.log("PASS: canonical content integrity checks succeeded");

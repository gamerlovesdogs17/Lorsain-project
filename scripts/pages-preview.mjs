import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import process from "node:process";
import { URL } from "node:url";

const port = Number(process.env.PORT ?? 4173);
const prefix = "/Lorsain-project/";
const root = resolve(process.cwd(), "apps/game/dist");
const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
};

createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);
  if (url.pathname === "/Lorsain-project") {
    response.writeHead(308, { Location: prefix });
    response.end();
    return;
  }
  if (!url.pathname.startsWith(prefix)) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }
  const relative = decodeURIComponent(url.pathname.slice(prefix.length));
  const normalized = normalize(relative).replace(/^([.][.][/\\])+/, "");
  let filePath = join(root, normalized || "index.html");
  if (!filePath.startsWith(root) || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    filePath = join(root, "index.html");
  }
  response.writeHead(200, {
    "Cache-Control": "no-store",
    "Content-Type": mime[extname(filePath)] ?? "application/octet-stream",
  });
  createReadStream(filePath).pipe(response);
}).listen(port, "127.0.0.1", () => {
  process.stdout.write(`Pages preview: http://127.0.0.1:${port}${prefix}\n`);
});

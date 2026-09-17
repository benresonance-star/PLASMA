import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, relative, extname, isAbsolute } from "node:path";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const types = { ".html": "text/html", ".mjs": "text/javascript", ".js": "text/javascript", ".json": "application/json", ".css": "text/css" };
createServer(async (request, response) => {
  try {
    let path = resolve(root, "." + decodeURIComponent(new URL(request.url, "http://localhost").pathname));
    const local = relative(root, path);
    if (local.startsWith("..") || isAbsolute(local) || local.split(/[\\/]/).some(part => part.startsWith("."))) {
      response.writeHead(403).end(); return;
    }
    if ((await stat(path)).isDirectory()) path = resolve(path, "index.html");
    response.writeHead(200, { "Content-Type": types[extname(path)] ?? "application/octet-stream", "Cache-Control": "no-store" });
    response.end(await readFile(path));
  } catch { response.writeHead(404).end("Not found"); }
}).listen(8080, "127.0.0.1", () => console.log("Plasma preview: http://127.0.0.1:8080/packages/terrain-core/demo/"));

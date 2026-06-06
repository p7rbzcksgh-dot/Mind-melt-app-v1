import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 5173);

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const normalized = path.normalize(decoded).replace(/^([.][.][\/\\])+/, "");
  const target = path.join(__dirname, normalized === "/" ? "index.html" : normalized);
  if (!target.startsWith(__dirname)) return path.join(__dirname, "index.html");
  return target;
}

createServer(async (req, res) => {
  try {
    let target = safePath(req.url || "/");
    const fileStat = await stat(target).catch(() => null);
    if (fileStat?.isDirectory()) target = path.join(target, "index.html");

    const data = await readFile(target);
    const ext = path.extname(target).toLowerCase();
    res.writeHead(200, { "Content-Type": types[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  }
}).listen(port, () => {
  console.log(`MindMelt dashboard running at http://localhost:${port}`);
});

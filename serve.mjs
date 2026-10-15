// Tiny static server for previewing dist/ locally: npm start
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";

const DIST = new URL("./dist/", import.meta.url).pathname;
const PORT = process.env.PORT || 3000;
const types = {
  ".html": "text/html; charset=utf-8", ".css": "text/css", ".xml": "application/xml",
  ".txt": "text/plain", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml",
};

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path === "/feed/") path = "/feed.xml";
  let file = join(DIST, path);
  if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, "index.html");
    res.writeHead(200, { "content-type": types[extname(file)] || "application/octet-stream" });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    res.end(await readFile(join(DIST, "404.html")).catch(() => "Not found"));
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));

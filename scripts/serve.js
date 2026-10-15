// Zero-dependency static file server for local development.
// ES modules and Web Workers don't load over file://, so open the game
// through this instead: `npm start`, then visit http://localhost:8080.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const port = Number(process.env.PORT) || 8080;

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
};

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, "http://localhost");
  const filePath = normalize(join(root, decodeURIComponent(pathname === "/" ? "/index.html" : pathname)));

  if (!filePath.startsWith(root)) {
    res.writeHead(403).end("Forbidden");
    return;
  }

  try {
    const body = await readFile(filePath);
    res.writeHead(200, { "Content-Type": contentTypes[extname(filePath)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
}).listen(port, () => {
  console.log(`Serving on http://localhost:${port}`);
});

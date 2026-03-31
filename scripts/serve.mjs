import { createReadStream } from "node:fs";
import { access, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT ?? 4173);

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
};

const server = http.createServer(async (request, response) => {
  const requestPath = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`).pathname;
  const normalizedPath = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.normalize(path.join(rootDir, normalizedPath));

  if (!filePath.startsWith(rootDir)) {
    response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Forbidden");
    return;
  }

  let resolvedPath = filePath;
  try {
    const fileStats = await stat(resolvedPath);
    if (fileStats.isDirectory()) {
      resolvedPath = path.join(resolvedPath, "index.html");
    }
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  try {
    await access(resolvedPath);
    const extension = path.extname(resolvedPath);
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": contentTypes[extension] ?? "application/octet-stream",
    });
    createReadStream(resolvedPath).pipe(response);
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
});

server.listen(port, () => {
  console.log(`House Sama is running at http://localhost:${port}`);
});

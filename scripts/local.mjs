import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { lessons } from "../lib/curriculo.js";
import { handleSchoolRequest } from "../lib/school-api.mjs";

const portText = process.env.PORT || "4173";
if (!/^\d{1,5}$/.test(portText) || Number(portText) < 1 || Number(portText) > 65535) {
  throw new Error("Use uma porta de 1 a 65535 na variável PORT.");
}
const port = Number(portText);
const root = new URL("../", import.meta.url);
const localDirectory = new URL(".sites-runtime/local/", root);
process.umask(0o077);
mkdirSync(localDirectory, { recursive: true, mode: 0o700 });
const sqlite = new DatabaseSync(fileURLToPath(new URL("casa64.sqlite", localDirectory)));
sqlite.exec("PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000; PRAGMA journal_mode = WAL;");
sqlite.exec("CREATE TABLE IF NOT EXISTS local_migrations (tag TEXT PRIMARY KEY, digest TEXT NOT NULL)");

function transaction(work) {
  sqlite.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    sqlite.exec("COMMIT");
    return result;
  } catch (error) {
    sqlite.exec("ROLLBACK");
    throw error;
  }
}

const journal = JSON.parse(readFileSync(new URL("drizzle/meta/_journal.json", root), "utf8"));
for (const { tag } of journal.entries) {
  if (!/^[0-9a-z_]+$/i.test(tag)) throw new Error("Identificador de migração inválido.");
  const sql = readFileSync(new URL("drizzle/" + tag + ".sql", root), "utf8");
  const digest = createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
  transaction(() => {
    const old = sqlite.prepare("SELECT digest FROM local_migrations WHERE tag = ?").get(tag);
    if (old) {
      if (old.digest !== digest) throw new Error("A migração local aplicada foi alterada: " + tag);
      return;
    }
    sqlite.exec(sql);
    sqlite.prepare("INSERT INTO local_migrations (tag, digest) VALUES (?, ?)").run(tag, digest);
  });
}

// Provide the D1 operations used by the shared school handler on a local SQLite file.
const db = {
  prepare(sql) {
    const statement = sqlite.prepare(sql);
    return {
      bind(...params) {
        return {
          first: () => statement.get(...params),
          all: () => ({ results: statement.all(...params) }),
          run() {
            if (statement.columns().length) return { results: statement.all(...params) };
            return { results: [], meta: { changes: Number(statement.run(...params).changes) } };
          },
        };
      },
    };
  },
  batch(statements) {
    return transaction(() => statements.map((statement) => statement.run()));
  },
};

const shell = readFileSync(new URL("lib/shell.html", root));
const publicFiles = new Map([
  ["/fonts/baskervville-latin-400-normal.woff2", "font/woff2"],
  ["/fonts/baskervville-latin-400-italic.woff2", "font/woff2"],
  ["/fonts/dm-sans-latin-400-normal.woff2", "font/woff2"],
  ["/fonts/dm-sans-latin-600-normal.woff2", "font/woff2"],
  ["/cavalo.webp", "image/webp"],
  ["/chevron.svg", "image/svg+xml"],
  ["/favicon.svg", "image/svg+xml"],
  ["/marca.svg", "image/svg+xml"],
  ["/escola.css", "text/css; charset=utf-8"],
  ["/treinador.css", "text/css; charset=utf-8"],
  ["/escola.js", "text/javascript; charset=utf-8"],
  ["/treinador.js", "text/javascript; charset=utf-8"],
]);
const assets = new Map(Array.from(publicFiles, ([pathname, type]) => [
  pathname, { type, body: readFileSync(new URL("public" + pathname, root)) },
]));
const siteHeaders = {
  "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; object-src 'none'; form-action 'self'; frame-ancestors 'none'",
  "Referrer-Policy": "same-origin",
  "X-Content-Type-Options": "nosniff",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Cache-Control": "no-store",
};
const allowedHosts = new Set(["127.0.0.1", "localhost"].map((host) => new URL("http://" + host + ":" + port).host));
const server = createServer({ requestTimeout: 15_000, headersTimeout: 10_000, maxHeaderSize: 16_384 }, async (incoming, outgoing) => {
  for (const [name, value] of Object.entries(siteHeaders)) outgoing.setHeader(name, value);
  try {
    const host = incoming.headers.host;
    const pathname = (incoming.url || "").split("?")[0];
    if (!allowedHosts.has(host) || !/^\/[a-z0-9./-]*$/i.test(pathname) || pathname.includes("..") || pathname.includes("//")) {
      outgoing.writeHead(400).end();
      return;
    }
    if (pathname.startsWith("/api/")) {
      const headers = new Headers();
      // Only browser headers needed by the shared handler may cross this boundary.
      // The local server supplies the network peer and has no platform identity.
      for (const key of ["cookie", "origin", "sec-fetch-site", "content-type", "content-length"]) {
        if (typeof incoming.headers[key] === "string") headers.set(key, incoming.headers[key]);
      }
      headers.set("cf-connecting-ip", incoming.socket.remoteAddress || "local");
      const method = incoming.method;
      const request = new Request("http://" + host + pathname, {
        method, headers,
        ...(method === "POST" ? { body: Readable.toWeb(incoming), duplex: "half" } : {}),
      });
      const response = await handleSchoolRequest(request, db, lessons);
      for (const [name, value] of response.headers) outgoing.setHeader(name, value);
      outgoing.writeHead(response.status).end(Buffer.from(await response.arrayBuffer()));
      return;
    }
    if (incoming.method !== "GET" && incoming.method !== "HEAD") {
      outgoing.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    const asset = pathname === "/" ? { type: "text/html; charset=utf-8", body: shell } : assets.get(pathname);
    if (!asset) {
      outgoing.writeHead(404).end();
      return;
    }
    outgoing.writeHead(200, { "Content-Type": asset.type, "Content-Length": asset.body.byteLength });
    outgoing.end(incoming.method === "HEAD" ? undefined : asset.body);
  } catch {
    outgoing.writeHead(500).end();
  }
});
server.maxHeadersCount = 60;
server.listen(port, "127.0.0.1", () => console.log("Casa 64 em http://127.0.0.1:" + port + "/"));
server.once("error", (error) => {
  sqlite.close();
  if (error.code === "EADDRINUSE") console.error("Porta " + port + " em uso. Escolha outra com a variável PORT.");
  else console.error("Não foi possível iniciar o servidor local.");
  process.exitCode = 1;
});

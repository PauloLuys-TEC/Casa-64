import { createHash, randomBytes, randomUUID, scrypt, timingSafeEqual } from "node:crypto";

const week = 7 * 24 * 60 * 60;
const maxBodyBytes = 4096;
const kdfVersion = "scrypt-16384-8-5";
const dummySalt = "7782efcb474ef25cf7013aca19765335";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const actionPattern = /^\/api\/(session|lessons|login|register|logout|progress)\/?$/;

class ApiError extends Error {
  constructor(status, message, headers = {}) {
    super(message);
    this.status = status;
    this.headers = headers;
  }
}

function reply(payload, status = 200, more = {}) {
  return Response.json(payload, {
    status,
    headers: {
      "Cache-Control": "private, no-store",
      "Vary": "Cookie",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
      ...more,
    },
  });
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function derivePassword(password, salt) {
  return new Promise((resolve, reject) => {
    scrypt(password, Buffer.from(salt, "hex"), 32, {
      N: 16384, r: 8, p: 5, maxmem: 32 * 1024 * 1024,
    }, (error, derived) => error ? reject(error) : resolve(derived));
  });
}

function platformId(request) {
  return request.headers.get("oai-authenticated-user-id") || "";
}

function cookieSettings(url) {
  const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  return {
    name: localHttp ? "casa64_local" : "__Host-casa64",
    attributes: "Path=/; HttpOnly; SameSite=Lax" + (localHttp ? "" : "; Secure"),
  };
}

function getSessionHash(request, settings) {
  for (const cookie of (request.headers.get("cookie") || "").split(";")) {
    const [name, token] = cookie.trim().split("=");
    if (name === settings.name && /^[a-f0-9]{64}$/.test(token || "")) return sha256(token);
  }
  return null;
}

async function readBody(request, origin) {
  const headers = request.headers;
  if (headers.get("origin") !== origin || headers.get("sec-fetch-site") === "cross-site") {
    throw new ApiError(403, "Origem da solicitação inválida.");
  }
  if (headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new ApiError(415, "Envie os dados em JSON.");
  }
  if (Number(headers.get("content-length")) > maxBodyBytes) {
    throw new ApiError(413, "Os dados enviados são grandes demais.");
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "Envie um objeto JSON.");
  const decoder = new TextDecoder();
  let body = "", size = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBodyBytes) {
      await reader.cancel();
      throw new ApiError(413, "Os dados enviados são grandes demais.");
    }
    body += decoder.decode(value, { stream: true });
  }
  try {
    const payload = JSON.parse(body + decoder.decode());
    if (payload && typeof payload === "object" && !Array.isArray(payload)) return payload;
  } catch {
    // Return the same validation message for malformed and incorrectly shaped JSON.
  }
  throw new ApiError(400, "Envie um objeto JSON válido.");
}

function statement(db, name, sqliteSql) {
  return db.prepareOperation ? db.prepareOperation(name) : db.prepare(sqliteSql);
}

async function limitRequests(db, keys, now) {
  const statements = keys.map(({ key, window }) => statement(db, "increase_limit",
    `INSERT INTO auth_windows (bucket, attempts, expires_at) VALUES (?1, 1, ?2)
     ON CONFLICT(bucket) DO UPDATE SET
       attempts = CASE WHEN expires_at <= ?3 THEN 1 ELSE attempts + 1 END,
       expires_at = CASE WHEN expires_at <= ?3 THEN excluded.expires_at ELSE expires_at END
     RETURNING attempts, expires_at`,
  ).bind(sha256(key), now + window, now));
  statements.push(statement(db, "sweep_limits",
    "DELETE FROM auth_windows WHERE bucket IN (SELECT bucket FROM auth_windows WHERE expires_at <= ? LIMIT 50)",
  ).bind(now));
  const rows = await db.batch(statements);
  for (let i = 0; i < keys.length; i++) {
    const counter = rows[i].results[0];
    if (counter.attempts > keys[i].limit) {
      throw new ApiError(429, "Muitas tentativas. Aguarde um pouco para tentar novamente.", {
        "Retry-After": String(Math.max(1, counter.expires_at - now)),
      });
    }
  }
}

async function getTimes(db, studentId) {
  const { results } = await statement(db, "study_times",
    "SELECT lesson_id, SUM(seconds) AS seconds FROM study_ticks WHERE student_id = ? GROUP BY lesson_id",
  ).bind(studentId).all();
  return Object.fromEntries(results.map((row) => [row.lesson_id, row.seconds]));
}

async function authenticate({ db, request, settings, sessionHash, action, body, now }) {
  const username = typeof body.username === "string" ? body.username.trim() : "";
  const handle = username.toLowerCase();
  const password = body.password;
  if (!/^[a-z0-9_.-]{3,32}$/i.test(username)) {
    throw new ApiError(400, "Use um usuário de 3 a 32 caracteres, com letras sem acento, números, ponto, hífen ou sublinhado.");
  }
  const length = typeof password === "string" ? Array.from(password).length : 0;
  if (length < (action === "register" ? 12 : 1) || length > 128) {
    throw new ApiError(400, action === "register" ? "Use uma senha de 12 a 128 caracteres." : "Confira o usuário e a senha.");
  }

  const trustedIp = request.headers.get("cf-connecting-ip") || platformId(request) || "local";
  const register = action === "register";
  const limits = [{ key: action + "/ip/" + trustedIp, window: register ? 3600 : 900, limit: register ? 10 : 45 }];
  if (!register) limits.push({ key: "login/name/" + handle, window: 900, limit: 12 });
  await limitRequests(db, limits, now);

  let studentId, display, encoded;
  if (register) {
    studentId = randomUUID();
    display = username;
    const salt = randomBytes(16).toString("hex");
    const hash = await derivePassword(password, salt);
    encoded = [kdfVersion, salt, hash.toString("hex")].join("$");
  } else {
    const student = await statement(db, "find_student",
      "SELECT id, username, password_hash FROM students WHERE handle = ?",
    ).bind(handle).first();
    const [version, salt, expected] = student?.password_hash.split("$") || [kdfVersion, dummySalt, "00".repeat(32)];
    const hash = await derivePassword(password, salt);
    const matches = timingSafeEqual(hash, Buffer.from(expected, "hex"));
    if (!student || version !== kdfVersion || !matches) throw new ApiError(401, "Confira o usuário e a senha.");
    studentId = student.id;
    display = student.username;
  }

  const token = randomBytes(32).toString("hex");
  const writes = [];
  if (register) {
    writes.push(statement(db, "add_student",
      "INSERT INTO students (id, handle, username, password_hash, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(handle) DO NOTHING",
    ).bind(studentId, handle, display, encoded, now));
  }
  writes.push(statement(db, "add_session",
    `INSERT INTO sessions (token_hash, student_id, platform_id, expires_at)
     SELECT ?, id, ?, ? FROM students WHERE id = ?`,
  ).bind(sha256(token), platformId(request), now + week, studentId));
  if (!register) {
    writes.push(statement(db, "reset_limit","DELETE FROM auth_windows WHERE bucket = ?").bind(sha256("login/name/" + handle)));
  }
  if (sessionHash) {
    writes.push(statement(db, "replace_session",
      "DELETE FROM sessions WHERE token_hash = ? AND platform_id = ? AND EXISTS (SELECT 1 FROM students WHERE id = ?)",
    ).bind(sessionHash, platformId(request), studentId));
  }
  writes.push(statement(db, "sweep_sessions",
    "DELETE FROM sessions WHERE token_hash IN (SELECT token_hash FROM sessions WHERE expires_at <= ? LIMIT 50)",
  ).bind(now));
  const result = await db.batch(writes);
  if (register && result[0].meta.changes !== 1) {
    throw new ApiError(409, "Não foi possível criar a conta com esse usuário. Escolha outro nome.");
  }
  return reply({ user: display, times: register ? {} : await getTimes(db, studentId) }, register ? 201 : 200, {
    "Set-Cookie": settings.name + "=" + token + "; Max-Age=" + week + "; " + settings.attributes,
  });
}

async function recordProgress(db, student, lessons, body, now) {
  if (body.username !== student.username) {
    return reply({ code: "account_changed", error: "A conta mudou. Atualize a página antes de continuar o treino." }, 409);
  }
  const { lessonId, seconds, eventId } = body;
  if (!lessons.some((entry) => entry.id === lessonId) || !Number.isInteger(seconds) || seconds < 1 || seconds > 120 ||
      typeof eventId !== "string" || !uuidPattern.test(eventId)) {
    throw new ApiError(400, "O registro de estudo é inválido.");
  }
  await limitRequests(db, [{ key: "study/" + student.id, window: 60, limit: 60 }], now);
  // Read and consume one shared wall-clock budget in a single SQLite write.
  // A replay of an accepted UUID leaves the existing receipt untouched.
  const insert = statement(db, "add_study_tick",
    `WITH anchor AS (
       SELECT MAX(?1 - 120, COALESCE(
         (SELECT MAX(credited_through) FROM study_ticks WHERE student_id = ?2), ?3
       )) AS value
     ), credit AS (
       SELECT value, MIN(?4, MAX(0, ?1 - value)) AS seconds FROM anchor
     )
     INSERT INTO study_ticks (student_id, event_id, lesson_id, seconds, credited_through)
     SELECT ?2, ?5, ?6, seconds, value + seconds FROM credit WHERE true
     ON CONFLICT(student_id, event_id) DO NOTHING`,
  ).bind(now, student.id, student.created_at, seconds, eventId, lessonId);
  const total = statement(db, "lesson_time",
    "SELECT COALESCE(SUM(seconds), 0) AS seconds FROM study_ticks WHERE student_id = ? AND lesson_id = ?",
  ).bind(student.id, lessonId);
  const [, snapshot] = await db.batch([insert, total]);
  return reply({ seconds: snapshot.results[0].seconds });
}

export async function handleSchoolRequest(request, db, lessons) {
  try {
    const url = new URL(request.url);
    const action = url.pathname.match(actionPattern)?.[1];
    if (!action) throw new ApiError(404, "Rota desconhecida.");
    const method = action === "session" || action === "lessons" ? "GET" : "POST";
    if (request.method !== method) throw new ApiError(405, "Método inválido.", { Allow: method });
    const now = Math.floor(Date.now() / 1000);
    const settings = cookieSettings(url);
    const sessionHash = getSessionHash(request, settings);
    const body = method === "POST" ? await readBody(request, url.origin) : null;
    if (!db) throw new ApiError(503, "O serviço de contas está temporariamente indisponível.");
    if (action === "login" || action === "register") {
      return await authenticate({ db, request, settings, sessionHash, action, body, now });
    }
    if (action === "logout") {
      if (sessionHash) await statement(db, "remove_session","DELETE FROM sessions WHERE token_hash = ? AND platform_id = ?")
        .bind(sessionHash, platformId(request)).run();
      return reply({ user: null, times: {} }, 200, {
        "Set-Cookie": settings.name + "=; Max-Age=0; " + settings.attributes,
      });
    }
    const student = sessionHash && await statement(db, "find_session",
      `SELECT students.id, students.username, students.created_at FROM sessions
       JOIN students ON sessions.student_id = students.id
       WHERE token_hash = ? AND platform_id = ? AND expires_at > ?`,
    ).bind(sessionHash, platformId(request), now).first();
    if (action === "session") {
      return reply(student ? { user: student.username, times: await getTimes(db, student.id) } : { user: null, times: {} });
    }
    if (!student) throw new ApiError(401, "Entre na sua conta para continuar.");
    if (action === "lessons") return reply({ lessons });
    return await recordProgress(db, student, lessons, body, now);
  } catch (error) {
    if (error instanceof ApiError) return reply({ error: error.message }, error.status, error.headers);
    // Never include the request, SQL bindings, credential or session token in logs.
    console.error("Falha interna no serviço da escola.", error?.name || "Error");
    return reply({ error: "Não foi possível concluir a solicitação. Tente novamente." }, 500);
  }
}

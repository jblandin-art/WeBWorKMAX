import http from "node:http";
import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;
const port = Number(process.env.PORT || 3000);
const apiKey = process.env.GRADE_API_KEY;
const databaseUrl = process.env.DATABASE_URL;

if (!apiKey) {
  throw new Error("GRADE_API_KEY must be configured");
}

if (!databaseUrl) {
  throw new Error("DATABASE_URL must be configured");
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined,
});

const schemaSql = `
  CREATE TABLE IF NOT EXISTS grade_events (
    id UUID PRIMARY KEY,
    course_id TEXT NOT NULL,
    set_id TEXT NOT NULL,
    problem_id TEXT NOT NULL,
    student_id_hash TEXT NOT NULL,
    grader_name TEXT NOT NULL,
    previous_grade NUMERIC(6, 2),
    new_grade NUMERIC(6, 2) NOT NULL CHECK (new_grade >= 0 AND new_grade <= 100),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );
  CREATE INDEX IF NOT EXISTS grade_events_lookup_idx
    ON grade_events (course_id, set_id, problem_id, student_id_hash, created_at DESC);
`;

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  });
  response.end(JSON.stringify(body));
}

function authenticate(request, response) {
  const authorization = request.headers.authorization || "";
  if (authorization !== `Bearer ${apiKey}`) {
    sendJson(response, 401, { error: "Unauthorized" });
    return false;
  }
  return true;
}

async function readJson(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) {
      throw new Error("Request body is too large");
    }
  }
  return JSON.parse(body);
}

function requireText(value, field) {
  if (typeof value !== "string" || value.trim() === "" || value.length > 300) {
    throw new Error(`${field} must be a non-empty string of 300 characters or fewer`);
  }
  return value.trim();
}

function parseGrade(value, field, allowNull = false) {
  if (allowNull && (value === null || value === undefined || value === "")) {
    return null;
  }
  const grade = Number(value);
  if (!Number.isFinite(grade) || grade < 0 || grade > 100) {
    throw new Error(`${field} must be a number between 0 and 100`);
  }
  return grade;
}

function requireStudentIdHash(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new Error("studentIdHash must be a lowercase SHA-256 HMAC value");
  }
  return value;
}

function validateEvent(event) {
  return {
    courseId: requireText(event.courseId, "courseId"),
    setId: requireText(event.setId, "setId"),
    problemId: requireText(event.problemId, "problemId"),
    studentIdHash: requireStudentIdHash(event.studentIdHash),
    graderName: requireText(event.graderName, "graderName"),
    previousGrade: parseGrade(event.previousGrade, "previousGrade", true),
    newGrade: parseGrade(event.newGrade, "newGrade"),
  };
}

async function initializeDatabase() {
  await pool.query(schemaSql);
}

async function handleRequest(request, response) {
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (!authenticate(request, response)) {
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === "GET" && url.pathname === "/api/grades/latest") {
    const courseId = requireText(url.searchParams.get("courseId"), "courseId");
    const setId = requireText(url.searchParams.get("setId"), "setId");
    const problemId = requireText(url.searchParams.get("problemId"), "problemId");
    const result = await pool.query(
      `      SELECT DISTINCT ON (student_id_hash)
       student_id_hash, grader_name, previous_grade, new_grade, created_at
       FROM grade_events
       WHERE course_id = $1 AND set_id = $2 AND problem_id = $3
       ORDER BY student_id_hash, created_at DESC`,
      [courseId, setId, problemId],
    );

    sendJson(response, 200, {
      grades: result.rows.map((row) => ({
        studentIdHash: row.student_id_hash,
        graderName: row.grader_name,
        previousGrade: row.previous_grade === null ? null : Number(row.previous_grade),
        newGrade: Number(row.new_grade),
        createdAt: row.created_at,
      })),
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/grades/events") {
    const payload = await readJson(request);
    if (!Array.isArray(payload.events) || payload.events.length > 500) {
      throw new Error("events must be an array containing at most 500 items");
    }

    const events = payload.events.map(validateEvent);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const event of events) {
        await client.query(
          `INSERT INTO grade_events
            (id, course_id, set_id, problem_id, student_id_hash, grader_name, previous_grade, new_grade)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            randomUUID(),
            event.courseId,
            event.setId,
            event.problemId,
            event.studentIdHash,
            event.graderName,
            event.previousGrade,
            event.newGrade,
          ],
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }

    sendJson(response, 201, { inserted: events.length });
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error(error);
    sendJson(response, error instanceof SyntaxError ? 400 : 500, {
      error: error.message || "Request failed",
    });
  });
});

initializeDatabase()
  .then(() => {
    server.listen(port, () => {
      console.log(`WeBWorKMAX grade backend listening on port ${port}`);
    });
  })
  .catch((error) => {
    console.error("Database initialization failed", error);
    process.exitCode = 1;
  });

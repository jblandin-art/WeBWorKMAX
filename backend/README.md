# WeBWorKMAX grade backend

This service stores an append-only history of grades entered through the
extension and returns the latest grade for each student/problem.

Student identifiers are deterministic HMAC-SHA-256 values generated in the
extension. Raw student names and email addresses are never sent to or stored
by this service. The same `GRADE_API_KEY` must be used by all extension users
who need to share the same grade history.

## Neon + Render setup

This setup keeps the database on Neon’s free PostgreSQL plan and runs the API
on a Render Web Service.

1. Create a free project at [Neon](https://neon.tech).
2. In Neon, create or select the project database and copy its pooled
   connection string. It should include the database name, username, password,
   host, and `sslmode=require`.
3. In [Render](https://dashboard.render.com), create a new **Web Service**
   connected to this repository.
4. Set the Render service root directory to `backend`.
5. Use these Render service settings:
   - Build command: `npm install`
   - Start command: `npm start`
   - Plan: `Free`
6. Add these Render environment variables:
   - `DATABASE_URL`: the Neon pooled connection string
   - `GRADE_API_KEY`: a long random shared key entered by each extension user
   - `NODE_ENV`: `production`
7. Deploy the Render service and copy its public HTTPS URL.
8. In the extension popup, enter the Render URL, the same shared API key, and
   each grader’s own name or nickname.

The service starts with:

```text
npm start
```

Use the Render service URL as the backend URL in the extension popup.

Create a fresh database using this schema. Do not reuse a database from an
older backend version that stored raw student identifiers without first
purging or deliberately migrating those records.

## Free-plan limitations

The free Web Service may spin down after 15 minutes without traffic. Its next
request can take about one minute while the service starts again. This is why
the extension displays a backend loading status.

The backup service is additive and best-effort. If it is unavailable, times
out, or has incomplete configuration, WebWorKMAX allows the native WebWorK
submission to continue and marks the backup grades as unavailable. WebWorK
grading does not depend on this service.

The Neon free database can scale to zero while idle and wake when queried.
Neon’s free plan has storage and compute limits, so check its current plan
details before relying on it for a large course.

Do not use any free database as the only permanent copy of grade history.
Export the grade history periodically or upgrade to a plan with backups.

## API

`GET /health` does not require authentication and returns a simple service
health response.

All grade endpoints require this header:

```text
Authorization: Bearer <GRADE_API_KEY>
```

The service exposes:

- `GET /api/grades/latest?courseId=...&setId=...&problemId=...`
- `POST /api/grades/events`

Latest-grade responses identify students with `studentIdHash`. Grade event
requests must contain `studentIdHash`, not a raw username or email address:

```json
{
  "events": [
    {
      "courseId": "ITSC2175AN",
      "setId": "Practice10",
      "problemId": "6",
      "studentIdHash": "64-character-lowercase-hmac-value",
      "graderName": "Example Grader",
      "previousGrade": 0,
      "newGrade": 100
    }
  ]
}
```

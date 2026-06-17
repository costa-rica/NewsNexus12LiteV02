---
created_at: 2026-06-17
updated_at: 2026-06-17
created_by: hermes (gpt-5.5)
modified_by: hermes (gpt-5.5)
---

# Location Rating Server Polling Issue

NewsNexus12LiteV02's location rating step uses the worker-node service to run a Hugging Face zero-shot classification model. On the production-style Linux server, the first rating run after a worker restart can make the worker temporarily unresponsive while the model is loaded and classification begins. During that window, the UI continues polling `/api/worker/jobs/:jobId` for job status. One of those polling requests can receive `502 Bad Gateway`, causing the browser to show `fetch failed`, even though the background worker job continues and later completes successfully.

This is primarily a server/runtime behavior, not evidence that the model or scoring job failed. The server worker is a long-running Node process behind the portal and public reverse-proxy path. Model loading and inference are heavy enough on that environment to block or delay job-status responses. Recent logs showed this sequence: the location job was accepted, a polling request returned `502`, and the same job completed successfully afterward with all eligible articles processed.

This does not usually appear on the Mac workstation because the local development setup has fewer proxy layers and different hardware/runtime characteristics. The browser often talks to the local dev server directly, and the model load may complete quickly enough that polling does not hit an upstream timeout. The Mac environment also commonly keeps the model warm during iterative development, while the server loses the in-memory model after service restarts.

The durable fix should make the production UI/proxy path tolerate this expected startup behavior, either by retrying transient `502` responses while polling, pre-warming the model after worker start, or moving Hugging Face model work off the main worker event loop so job-status endpoints remain responsive.

## Hermes-nn12dev Proposed Solutions

### Option 1: Retry Transient Polling Failures

Treat `502` responses from job-status polling as temporary while a background job is still expected to be running. The UI can retry with backoff instead of immediately surfacing `fetch failed`. This is the smallest user-facing fix and directly addresses the observed symptom, but it does not reduce worker startup load.

### Option 2: Warm the Model After Worker Start

Trigger a lightweight model warm-up after worker-node starts so the first user-initiated rating job does not pay the full model-load cost. This reduces the chance of proxy timeouts during normal use, but it adds startup work and still depends on available server resources.

### Option 3: Isolate Model Work From Status Responses

Run Hugging Face classification in a separate process, thread, or queue worker so the main worker API can keep answering job-status requests while inference is busy. This is the most durable architecture, but it is a larger implementation than the polling or warm-up changes.

### Recommendation

Start with Option 1, then add Option 2 if first-run latency remains disruptive. Option 1 is the fastest safe improvement because the job is already completing successfully; the immediate problem is that one transient polling failure makes the UI look broken. Consider Option 3 later if model work continues to interfere with worker responsiveness.

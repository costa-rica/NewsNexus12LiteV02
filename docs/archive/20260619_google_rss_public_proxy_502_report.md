---
created_at: 2026-06-19
updated_at: 2026-06-19
created_by: hermes (gpt-5.5)
modified_by: hermes (gpt-5.5)
---

# Google RSS public search 502 investigation

## Summary

The Google RSS search failure on `https://news-nexus-lite.dashanddata.com/api/google-rss/make-request` does not appear to be caused by the NewsNexus12LiteV02 portal route or by Google RSS itself. The route works when called directly on the app host's portal service. The likely failure is in the public reverse proxy/nginx routing for `news-nexus-lite.dashanddata.com`, especially if `/api` traffic is being sent to the worker-node instead of the Next portal.

Adding another portal `.env` variable that points to `http://127.0.0.1:8011` should not be necessary for this search route. The browser uses a relative request to `/api/google-rss/make-request`, and Next should handle that route inside the portal process. The worker URL environment variable is only for portal-owned proxy routes under `/api/worker/...`.

## User-visible symptom

Browser console when searching for `fire`:

```text
POST https://news-nexus-lite.dashanddata.com/api/google-rss/make-request
HTTP/1.1 502 Bad Gateway
```

Page message:

```text
Request failed. Please try again.
```

## Route ownership

The failing route is implemented in the portal:

```text
portal/src/app/api/google-rss/make-request/route.ts
```

The frontend calls it as a same-origin relative URL:

```text
/api/google-rss/make-request
```

Relevant source references:

```text
portal/src/components/search/SearchBar.tsx
portal/src/app/api/google-rss/make-request/route.ts
```

The worker-node does not implement this route. Worker-node routes are for jobs such as:

```text
/article-content-scraper-02/start-job
/location-scorer/start-job
/jobs/:jobId
```

The portal's worker proxy environment variable is currently:

```text
WORKER_NODE_URL=http://localhost:8010
```

That value matters for `/api/worker/...` routes, not for `/api/google-rss/make-request`.

## Evidence gathered on nws-nn12dev

Current app state after the worker-node port change:

```text
newsnexus12litev02-portal.service      active, listening on 8011
newsnexus12litev02-worker-node.service active, listening on 8010
```

### Direct portal test succeeds

Command shape:

```bash
curl -i -X POST http://127.0.0.1:8011/api/google-rss/make-request \
  -H 'content-type: application/json' \
  --data '{"and_keywords":"fire","and_exact_phrases":"","or_keywords":"","or_exact_phrases":"","time_range":"7d"}'
```

Result:

```text
HTTP/1.1 200 OK
```

The response contained a valid Google RSS URL and `articlesArray` with 5 articles.

Portal logs at the same time:

```text
[portal] info: google rss search requested {"route":"google-rss.make-request",...}
[portal] info: google rss search completed {"route":"google-rss.make-request","parsedCount":100,"count":5}
```

### Direct app-host portal test succeeds

Command shape:

```bash
curl -i -X POST http://192.168.100.217:8011/api/google-rss/make-request \
  -H 'Host: news-nexus-lite.dashanddata.com' \
  -H 'content-type: application/json' \
  --data '{"and_keywords":"fire","and_exact_phrases":"","or_keywords":"","or_exact_phrases":"","time_range":"7d"}'
```

Result:

```text
HTTP/1.1 200 OK
```

This bypasses the public nginx host and proves the app host, portal process, route handler, and Google RSS request path are functioning.

### Worker-node test does not own the route

Command shape:

```bash
curl -i -X POST http://127.0.0.1:8010/api/google-rss/make-request \
  -H 'content-type: application/json' \
  --data '{"and_keywords":"fire","time_range":"7d"}'
```

Result:

```text
HTTP/1.1 404 Not Found
Cannot POST /api/google-rss/make-request
```

This confirms that routing the public search endpoint to worker-node will not work, even though the worker-node is now listening on 8010.

### TSM nginx database record

The TSM database record for `news-nexus-lite.dashanddata.com` says:

```text
serverName: news-nexus-lite.dashanddata.com
portNumber: 8011
app host: 192.168.100.217
nginx host: 192.168.100.239
symlink: yes
nginxReload: yes
updatedAt: 2026-06-14T17:31:37.652Z
```

That record is consistent with routing to the portal on `192.168.100.217:8011`, but the public behavior reported by the browser is not consistent with the direct app-host tests.

## Why changing worker-node to 8010 was not expected to fix this

The public failing endpoint is not a worker-node endpoint. It is a Next route inside the portal. Changing worker-node from 8012 to 8010 can help only if the failing route were one of the portal's worker proxy routes under `/api/worker/...`.

For this specific endpoint, nginx should send the request to the portal:

```text
http://192.168.100.217:8011/api/google-rss/make-request
```

not to worker-node:

```text
http://192.168.100.217:8010/api/google-rss/make-request
```

If nginx has a special `location /api` block pointing to 8010, that would explain the observed failure. If nginx has no special `/api` block but still returns 502, then the live nginx config or reload state may not match the TSM database record.

## Likely root cause

Most likely root cause: the live nginx config for `news-nexus-lite.dashanddata.com` is misrouting `/api` traffic or is stale relative to the TSM database record.

The correct public proxy behavior for this app should route all normal portal traffic, including `/api/google-rss/make-request`, to:

```text
http://192.168.100.217:8011
```

Only the portal process should know about the worker-node URL for `/api/worker/...` internal proxying.

## Recommended next checks for the Mac coding/deployment agent

1. On the nginx host (`192.168.100.239` / `tsm-api.maestro06.dashanddata.com`), inspect the live nginx config for:

   ```text
   news-nexus-lite.dashanddata.com
   ```

2. Look specifically for any separate block like:

   ```nginx
   location /api {
       proxy_pass http://192.168.100.217:8010;
   }
   ```

   or any equivalent rule sending `/api` to worker-node.

3. If such a block exists, remove it or change it so this route reaches the portal on 8011. The simplest expected shape is one app-wide proxy to the portal:

   ```nginx
   location / {
       proxy_pass http://192.168.100.217:8011;
       proxy_set_header Host $host;
       proxy_set_header X-Real-IP $remote_addr;
       proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
       proxy_set_header X-Forwarded-Proto $scheme;
   }
   ```

4. Run `nginx -t` and reload nginx.

5. Retest from outside the app host:

   ```bash
   curl -i -X POST https://news-nexus-lite.dashanddata.com/api/google-rss/make-request \
     -H 'content-type: application/json' \
     --data '{"and_keywords":"fire","and_exact_phrases":"","or_keywords":"","or_exact_phrases":"","time_range":"7d"}'
   ```

Expected result:

```text
HTTP/1.1 200 OK
```

with a JSON body containing `articlesArray`.

## Notes

During this investigation, no code changes were made. Local working tree already had modified lockfiles from prior install/build activity:

```text
portal/package-lock.json
worker-node/package-lock.json
```

Those were not part of this report and should not be included accidentally in a docs-only commit.

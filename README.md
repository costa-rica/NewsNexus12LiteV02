# News Nexus Lite

Slim demo portal and worker for the News Nexus article approval workflow, including search, scraping, location scoring, state assignment, semantic scoring, and version display.

## Setup

Run from root of project

### 1. Install dependencies:

```bash
npm install
```

### 2. Build both apps:

```bash
npm run build
```

### 3. Run locally in two terminals:

```bash
npm run start:worker
npm run start:portal
```

## Project tree

```text
.
├── docs/         Project plans, todos, assessments, and standards.
├── portal/       Next.js UI for the News Nexus Lite demo.
├── scripts/      Shared repository utilities, including version generation.
└── worker-node/  Express worker service for scraping and scoring jobs.
```

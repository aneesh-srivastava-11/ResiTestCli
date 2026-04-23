# ResiTest

A production-grade Node.js CLI tool for API resilience and load testing.

## Features
- **Async concurrency engine** using `fetch`
- **Arrow Key dynamic controls** (`UP` / `DOWN` arrow at runtime adjust target Virtual Users)
- **Three load modes**: `constant`, `spike`, `chaos`
- **Safety checks** on external domains

## How to Run (Step-by-Step)

### 1. Installation
First, open your terminal (PowerShell or Command Prompt) and install the dependencies:
\`\`\`bash
npm install
\`\`\`
*(Optional)* Link the package so you can run it globally as `resitest`:
\`\`\`bash
npm link
\`\`\`

### 2. Basic Command Syntax
If you linked it natively:
\`\`\`bash
resitest run <url> [options]
\`\`\`
If you're just running it via node manually:
\`\`\`bash
node index.js run <url> [options]
\`\`\`

## Options
| Option             | Description                                    | Default   |
| -----------------  | ---------------------------------------------- | --------- |
| `-m, --mode`       | Load mode `[spike|constant|chaos]`             | `constant`|
| `-u, --users`      | Target Virtual Users                           | `10`      |
| `-d, --duration`   | Duration in seconds                            | `10`      |
| `-f, --fail-rate`  | Chaos failure rate (0 to 1) for error injection| `0`       |
| `-l, --delay`      | Inter-loop delay, or max Chaos delay           | `0`       |
| `-X, --method`     | Request method                                 | `GET`     |
| `-b, --body`       | Request body JSON string                       |           |
| `-H, --headers`    | Request headers JSON string                    | `{}`      |
| `--allow-external` | Disable prompt for external host load tests    | `false`   |
| `-o, --output`     | Export to .json or .csv                        |           |

## Examples

**Basic constant load on local:**
\`\`\`bash
resitest run http://localhost:3000 --users 15 --duration 30
\`\`\`

**Spike ramp-up:**
\`\`\`bash
resitest run http://localhost:3000/api --mode spike --users 50 --duration 60
\`\`\`

**Chaos simulation (Random delays & 20% failure injections):**
\`\`\`bash
resitest run http://localhost:3000/api/checkout --mode chaos --fail-rate 0.2 --delay 500
\`\`\`

**POST data and export results:**
\`\`\`bash
resitest run http://localhost:3000/posts \
  --method POST \
  --headers '{"Content-Type":"application/json"}' \
  --body '{"title":"Test"}' \
  --output ./results.json
\`\`\`

🚀 **Pro-Tip**: During execution, press the **Up Arrow** or **Down Arrow** keys to manually override the active virtual users in real-time!

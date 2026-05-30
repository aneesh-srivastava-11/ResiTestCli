# ResiTest 🚀

ResiTest is a production-grade, asynchronous command-line (CLI) load and resilience testing tool built with Node.js. It helps developers discover REST API endpoints from Swagger/OpenAPI documentation, generate mock payloads, customize bodies interactively, and execute high-concurrency performance tests with linear ramping, chaos simulation, SLA assertions, and rich HTML reporting.

---

## 🌟 Key Features

- **Interactive API Discovery**: Point to any OpenAPI/Swagger JSON endpoint to view, filter, select, and test endpoints interactively.
- **Mock Schema Generation**: Automatically generates complex mock JSON payloads from path parameters and request schemas, resolving legacy Swagger v2 references and avoiding infinite recursions on circular objects.
- **Interactive Body Customization**: Prompt and edit request bodies in a multi-line terminal JSON editor before triggering test suites.
- **SLA Threshold Assertions**: Assert latency percentiles and error rate thresholds (e.g. `p95<200`, `errors<2%`). Executions exit with failure codes if validation breaches, making it perfect for CI/CD pipelines.
- **Ramping Stage Profiles**: Replicate real-life load profiles (like k6) with multi-stage linear user interpolation (e.g. `--stages "5s:10,15s:30,5s:0"`).
- **Dynamic VU Scale Adjustment**: Scale target virtual users (VUs) up or down in real-time using the `UP` and `DOWN` arrow keys during a running test.
- **Chaos Mode**: Simulates network latency fluctuations and system degradation via random delay bounds and failure injections.
- **Rich HTML Reporting**: Generate fully styled, responsive dark-mode HTML reports complete with Chart.js time-series graphs, status code distribution charts, and SLA validation tables.

---

## ⚙️ Installation

You can install ResiTest in your terminal or on other machines using one of the following methods:

### Method A: Install via npm Registry (Recommended)
Anyone can install ResiTest globally directly from the npm registry:
```bash
npm install -g resitest
```

### Method B: Direct Installation via Git (Easiest for internal/source use)
If the project is hosted in a repository, any user with Node.js installed can install it globally via:
```bash
npm install -g git+https://github.com/<your-username>/ResiTestCli.git
```
*(Replace `<your-username>` with the target repository's URL or username).*

### Method C: Clone & Link (Best for development and testing)
1. Clone the repository:
   ```bash
   git clone https://github.com/<your-username>/ResiTestCli.git
   cd ResiTestCli
   ```
2. Install dependencies locally:
   ```bash
   npm install
   ```
3. Link the package globally to your shell:
   ```bash
   npm link
   ```
   *Now, typing `resitest` anywhere in the command prompt or terminal will execute the CLI tool.*

---

## 🛠️ Commands and Options

### `run <url>`
Runs a load test directly against the specified URL.

| Option | Shorthand | Description | Default |
|--------|-----------|-------------|---------|
| `--mode` | `-m` | Load mode: `constant`, `spike`, or `chaos` | `constant` |
| `--users` | `-u` | Number of concurrent virtual users (VUs) | `10` |
| `--duration` | `-d` | Test duration in seconds | `10` |
| `--fail-rate` | `-f` | Chaos mode simulated failure rate (fractional `0` to `1`) | `0` |
| `--delay` | `-l` | Constant delay between loops (ms) or max Chaos delay bound | `0` (or `500` max in chaos) |
| `--method` | `-X` | Request method (`GET`, `POST`, `PUT`, etc.) | `GET` |
| `--body` | `-b` | JSON string payload for the request body | |
| `--headers` | `-H` | JSON string of headers to send with the request | `{}` |
| `--allow-external`| | Disable prompt warning when load testing public URLs | `false` |
| `--stages` | `-s` | Ramping stage string: `duration:vus,duration:vus,...` (e.g. `10s:10,20s:30,10s:0`) | |
| `--thresholds` | `-t` | SLA threshold requirements (e.g. `p95<200,errors<1.5%`) | |
| `--output` | `-o` | Export path. Supports `.json`, `.csv`, and `.html` extensions | |

---

### `discover [url]`
Interactively discovers and tests endpoints from a Swagger/OpenAPI site.

- Supports all options from the `run` command (`--mode`, `--users`, `--stages`, `--thresholds`, `--output`, etc.).
- Paginated listing prevents viewport clipping if the schema exposes many endpoints.
- Auto-generates mock values for path variables, query parameters, headers, and request bodies.
- Prompts for inline JSON payload modification before execution.

---

## 💡 Practical Examples

### 1. Simple Load Run
Send constant load using 25 virtual users for 15 seconds:
```bash
resitest run http://localhost:3000/api/users --users 25 --duration 15
```

### 2. Multi-Stage Linear Ramping Profile
Ramp up from 0 to 10 VUs in 5 seconds, hold at 10 VUs for 15 seconds, then ramp down to 0 VUs in 5 seconds:
```bash
resitest run http://localhost:3000/api/users --stages "5s:10,15s:10,5s:0"
```

### 3. SLA Validation in CI/CD
Trigger a spike load profile, and fail the build (exit code `1`) if the P95 latency exceeds 150ms or the failure rate exceeds 1%:
```bash
resitest run http://localhost:3000/api/users \
  --mode spike \
  --users 30 \
  --duration 20 \
  --thresholds "p95<150,errors<1%"
```

### 4. Interactive OpenAPI Discovery and Reporting
Discover endpoints from a Swagger JSON file, edit the request body payload in the terminal, run the test, and output a premium visual HTML report:
```bash
resitest discover http://localhost:3000/swagger.json \
  --stages "5s:10,10s:20" \
  --thresholds "p95<200,errors<0.5%" \
  --output ./report.html
```

---

## 📊 Premium Visual HTML Reports

When exporting with the `.html` extension (e.g., `-o report.html`), ResiTest writes a single-file interactive report styled with Tailwind CSS containing:
- **Neon Dark-Mode UI**: Implements grid statistics highlighting test duration, total requests, throughput (RPS), and success rate.
- **Latency Trend Chart**: Plots latency trends using Chart.js with responsive resizing and downsampled datasets to prevent lag.
- **Response Code Doughnut**: Visually segment successful calls (`200 OK`) and distinct failures.
- **SLA Validation Metrics**: A clear validation summary showing whether specified limits passed or failed.

---

## ⚡ Runtime Controls

During active load tests, you can dynamically scale VUs:
- **`Arrow UP`**: Increase target VUs by 1.
- **`Arrow DOWN`**: Decrease target VUs by 1.
VUs scale down gracefully, completing their active requests before exiting, avoiding race conditions or connection thrashing.

# ResiTest: How-To Guide for Load Testing Sites

This guide explains how to use **ResiTest** to load-test local and deployed testing environments using various execution modes, stages, and validation metrics.

---

## 1. Quick Start (Local Sites)

If your testing site is running locally (e.g., a development server running on port `3000`, `5173`, or `8000`), you can launch a quick, constant load test with:

```bash
# Run 10 VUs for 20 seconds on a local server
resitest run http://localhost:3000 --users 10 --duration 20
```

---

## 2. Interactive Auto-Discovery 🚀

Instead of manually typing URLs, HTTP methods, headers, and payloads, you can use the **`discover`** command. ResiTest will automatically query your testing site's Swagger/OpenAPI documentation, display an interactive list of all endpoints, generate mock data, and run the test.

### How to use it:
1. Ensure your local or staging server is running and exposes API documentation (like Swagger).
2. Run the command:
   ```bash
   resitest discover http://localhost:3000
   ```
   *(If you omit the URL, ResiTest will prompt you to enter it).*
3. ResiTest will scan common routes (e.g. `/swagger.json`, `/openapi.json`, `/api-docs`) to download the API definitions.
4. **Choose an Endpoint**: Use your keyboard **Up/Down arrow keys** to select an endpoint, then press **Enter**. (The menu automatically paginates if there are more than 10 endpoints to prevent viewport clipping).
5. **Interactive Payload Editing**: If the endpoint requires a JSON body, ResiTest auto-generates a mockup matching the schema properties, displays it, and asks:
   `Would you like to edit this mock payload? (y/N)`
   If you select `y`, a multi-line JSON input prompt will open where you can customize the payload directly in the terminal before starting the test.

### Example:
```bash
resitest discover http://localhost:3000 --users 20 --duration 15
```

---

## 3. Testing Deployed or External Sites

By default, ResiTest prompts for confirmation before load-testing external URLs to prevent accidental server overload.

To bypass this prompt (useful for non-interactive environments or automated CI/CD scripts), use the `--allow-external` flag:

```bash
# Run 15 VUs for 30 seconds on a hosted staging domain
resitest run https://dev.yourtestingsite.com --users 15 --duration 30 --allow-external
```

---

## 4. Concurrency Ramping Profiles (Stages) 📈

Simulate real-life user traffic profiles by ramping up and down dynamically. Using the `--stages` (or `-s`) option overrides constant VU counts.

### Format:
`duration:vus,duration:vus,...` (using `s` for seconds and `m` for minutes).

```bash
# Ramp from 0 to 10 VUs over 5 seconds, stay at 10 VUs for 15 seconds, and ramp down to 0 VUs over 5 seconds
resitest run http://localhost:3000/api/users --stages "5s:10,15s:10,5s:0"
```

---

## 5. Performance SLAs and Threshold Assertions ⚖️

Ensure your service meets strict response-time SLAs. Use the `--thresholds` (or `-t`) option to specify assertions. If validation fails, the CLI returns an exit code of `1` (excellent for breaking broken builds in CI pipelines).

### Supported Metrics:
- `p95`: 95th Percentile Response Latency (ms)
- `avg`: Average Response Latency (ms)
- `max`: Maximum Response Latency (ms)
- `errors`: HTTP error rate (supports decimals or percentage strings like `1.5%`)

```bash
# Fail the test if P95 latency exceeds 200ms or error rate is above 1%
resitest run http://localhost:3000/api/users \
  --users 20 \
  --duration 30 \
  --thresholds "p95<200,errors<1%"
```

---

## 6. Premium Visual HTML Reports 📊

Export results to standard JSON, CSV, or a fully responsive, dark-themed HTML file with graphs when the output path ends in `.html`.

```bash
resitest run http://localhost:3000/api/users \
  --stages "5s:10,10s:20" \
  --output ./report.html
```

The exported HTML includes:
- **ResiTest Reports HUD**: Highlighting test metadata, durations, and request stats.
- **Latency Trend Charts**: High-performance interactive charts powered by Chart.js.
- **HTTP Status Doughnut**: Visual categorization of request status codes.
- **Detailed Log Tables**: Listing failures, error categories, and SLA outcomes.

---

## 7. Advanced Manual Request Options

### Custom Request Header and Body
If you need to test endpoints manually without Swagger discovery:

```bash
resitest run https://dev.yourtestingsite.com/api/v1/posts \
  --method POST \
  --headers '{"Content-Type": "application/json", "Authorization": "Bearer my-secret-token"}' \
  --body '{"title": "Performance Test", "content": "resitest-cli"}' \
  --users 10 \
  --duration 30 \
  --allow-external
```

---

## 8. Resilience and Chaos Simulation 🔥

Evaluate how your application handles latency spikes, connection timeouts, or intermittent downstream service failures using **`chaos`** mode:

```bash
# Chaos mode: 20% simulated network failures (503s), and up to 250ms random delay
resitest run http://localhost:3000/api/data \
  --mode chaos \
  --fail-rate 0.2 \
  --delay 250 \
  --users 15 \
  --duration 60
```

---

## 9. Live Interactive Adjustments (Real-Time VUs) 🎮

Once the test starts running, you do not have to stop it to change the load:
* Press the **`Arrow Up`** (🔼) key to increase the active VUs by 1.
* Press the **`Arrow Down`** (🔽) key to decrease the active VUs by 1.

The terminal progress bar will immediately reflect the new active VU count, current requests, failures, and Requests Per Second (RPS).

---

## 10. Installing on Other Machines and Terminals 💻

To install and run ResiTest on another machine or team member's terminal, you can choose one of the following methods:

### Method A: Direct Installation via Git (Easiest for internal use)
If the codebase is hosted on GitHub or another remote repository, any user with Node.js installed can install it globally without publishing to the public npm registry:
```bash
npm install -g git+https://github.com/<your-username>/ResiTestCli.git
```
*(Replace `<your-username>` with the target repository's URL or username).*

### Method B: Install via npm Registry (After publishing)
Once the package has been published to the npm repository (`npm publish`), anyone can install it globally via:
```bash
npm install -g resitest
```

### Method C: Clone & Link (Best for development and testing)
If they have access to the source code files:
1. Clone or copy the source folder to the target machine:
   ```bash
   git clone https://github.com/<your-username>/ResiTestCli.git
   cd ResiTestCli
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Link the package globally to the system path:
   ```bash
   npm link
   ```
   *Now, typing `resitest` anywhere in the command prompt or terminal will execute the CLI tool.*


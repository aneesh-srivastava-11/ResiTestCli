# ResiTest: How-To Guide for Load Testing Sites

This guide explains how to use **ResiTest** to load-test local and deployed testing environments.

---

## 1. Quick Start (Local Sites)

If your testing site is running locally (e.g., a development server running on port `3000`, `5173`, or `8000`), run:

```bash
# Run 10 VUs for 20 seconds on a local server
node index.js run http://localhost:3000 --users 10 --duration 20
```

---

## 2. Interactive Auto-Discovery (New 🚀)

Instead of manually typing URLs, HTTP methods, headers, and payloads, you can use the **`discover`** command. ResiTest will automatically query your testing site's Swagger/OpenAPI documentation, display an interactive list of all endpoints, generate mock data, and run the test.

### How to use it:
1. Ensure your local or staging server is running and exposes API documentation (like Swagger).
2. Run the command:
   ```bash
   node index.js discover http://localhost:3000
   ```
   *(If you omit the URL, ResiTest will prompt you to type it).*

3. ResiTest will scan common routes (e.g. `/swagger.json`, `/openapi.json`, `/api-docs`) to download the API definitions.
4. **Choose an Endpoint**: Use your keyboard **Up/Down arrow keys** to select an endpoint, then press **Enter**.
5. **Auto-Generated Data**: ResiTest will automatically parse the schema, populate path/query variables (e.g., changing `{id}` to `42`), generate a mock JSON body matching the schema properties, set headers, and start the load test!

### Example:
```bash
node index.js discover http://localhost:3000 --users 20 --duration 15
```

---

## 3. Testing Deployed or External Sites

By default, ResiTest prompts for confirmation before load-testing external URLs to prevent accidental server overload. 

To bypass this prompt (useful for non-interactive environments or automated scripts), use the `--allow-external` flag:

```bash
# Run 15 VUs for 30 seconds on a hosted staging domain
node index.js run https://dev.yourtestingsite.com --users 15 --duration 30 --allow-external
```

---

## 4. Advanced Manual Request Options

### A. Testing API Routes (with GET, POST, headers, and body payloads)
If you need to test endpoints manually without Swagger discovery:

```bash
node index.js run https://dev.yourtestingsite.com/api/v1/posts \
  --method POST \
  --headers '{"Content-Type": "application/json", "Authorization": "Bearer token-here"}' \
  --body '{"title": "Performance Test", "content": "resitest-cli"}' \
  --users 10 \
  --duration 30 \
  --allow-external
```

### B. Exporting Test Results
To save test summaries and raw latency figures to a file (`.json` or `.csv`):

```bash
node index.js run http://localhost:3000 --users 20 --duration 10 --output results.json
```

---

## 5. Resilience and Chaos Simulation

To evaluate how your application handles latency spikes, connection timeouts, or intermittent downstream service failures, run in **`chaos`** mode:

```bash
# Chaos mode: 20% simulated network failures (503s), and up to 500ms random delay
node index.js run https://dev.yourtestingsite.com/api/data \
  --mode chaos \
  --fail-rate 0.2 \
  --delay 500 \
  --users 25 \
  --duration 60 \
  --allow-external
```

---

## 6. Live Interactive Adjustments (Real-Time VUs)

Once the test starts running, you do not have to stop it to change the load:
* Press the **`Arrow Up`** (🔼) key to increase the active VUs by 1.
* Press the **`Arrow Down`** (🔽) key to decrease the active VUs by 1.

The terminal progress bar will immediately reflect the new active VU count, current requests, failures, and Requests Per Second (RPS).

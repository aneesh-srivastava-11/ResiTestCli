import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import readline from 'readline';

/**
 * Halts execution for the specified number of milliseconds.
 */
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Checks if the URL hostname points to a local domain.
 */
export function isLocalUrl(urlStr) {
  try {
    const { hostname } = new URL(urlStr);
    const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '0.0.0.0'];
    return LOCAL_HOSTS.includes(hostname);
  } catch (err) {
    return false;
  }
}

/**
 * Safely parses a JSON string, emitting a clear error log context if it fails.
 */
export function safeParseJSON(str, argName) {
  if (!str) return null;
  try {
    return JSON.parse(str);
  } catch (err) {
    console.error(`\n❌ Error parsing ${argName} JSON: ${err.message}`);
    process.exit(1);
  }
}

/**
 * Formats a duration in milliseconds to a human-readable string.
 */
export function formatDuration(ms) {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  return `${Math.round(ms)}ms`;
}

/**
 * Helper for interactive confirmation prompt.
 */
export function promptConfirm(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      const isYes = trimmed === 'y' || trimmed === 'yes' || trimmed === '';
      resolve(isYes);
    });
  });
}

/**
 * Exports test metrics to a file (JSON, CSV, or HTML based on extension).
 */
export function exportResults(summary, rawData, filePath) {
  const fullPath = path.resolve(process.cwd(), filePath);
  const ext = path.extname(fullPath).toLowerCase();

  try {
    let outputContent = '';
    if (ext === '.csv') {
      const csvKeys = Object.keys(summary);
      const csvValues = csvKeys.map(key => {
        let val = summary[key];
        if (typeof val === 'object' && val !== null) {
          const entries = Object.entries(val).map(([k, v]) => `${k}:${v}`);
          val = entries.join('; ');
        }
        const strVal = String(val).replace(/"/g, '""');
        return `"${strVal}"`;
      });
      outputContent = csvKeys.join(',') + '\n' + csvValues.join(',') + '\n';
    } else if (ext === '.html') {
      return exportHtmlReport(summary, rawData, filePath);
    } else {
      outputContent = JSON.stringify({ summary, raw: rawData }, null, 2);
    }

    fs.writeFileSync(fullPath, outputContent, 'utf-8');
    return true;
  } catch (err) {
    console.error(`\n❌ Failed to write export file: ${err.message}`);
    return false;
  }
}

/**
 * Generates an interactive, premium HTML report using Tailwind CSS and Chart.js.
 */
export function exportHtmlReport(summary, rawData, filePath) {
  const fullPath = path.resolve(process.cwd(), filePath);
  
  const maxPoints = 500;
  const latencies = rawData.latencies || [];
  let chartLatencies = latencies;
  if (latencies.length > maxPoints) {
    const step = Math.floor(latencies.length / maxPoints);
    chartLatencies = latencies.filter((_, idx) => idx % step === 0);
  }

  const errorLabels = Object.keys(summary.errorTypes || {});
  const errorData = Object.values(summary.errorTypes || {});
  
  const htmlContent = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ResiTest - Load Test Report</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;800&family=JetBrains+Mono&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: 'Outfit', sans-serif;
      background-color: #0b0f19;
      background-image: radial-gradient(circle at top right, rgba(16, 185, 129, 0.05), transparent 40%),
                        radial-gradient(circle at bottom left, rgba(59, 130, 246, 0.05), transparent 40%);
    }
    .font-mono {
      font-family: 'JetBrains Mono', monospace;
    }
  </style>
</head>
<body class="text-slate-100 min-h-screen p-6 md:p-12">
  <div class="max-w-6xl mx-auto space-y-8">
    
    <!-- Header -->
    <div class="flex flex-col md:flex-row justify-between items-start md:items-center border-b border-slate-800 pb-6 gap-4">
      <div>
        <div class="flex items-center gap-3">
          <span class="text-3xl">🚀</span>
          <h1 class="text-4xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-500 bg-clip-text text-transparent">ResiTest Reports</h1>
        </div>
        <p class="text-slate-400 mt-2">API Resilience and Load Performance Summary</p>
      </div>
      <div class="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm text-slate-400">
        Run on: <span class="text-slate-200 font-mono">${new Date().toLocaleString()}</span>
      </div>
    </div>

    <!-- Stat Grid -->
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
      
      <!-- Duration -->
      <div class="bg-slate-900/60 backdrop-blur border border-slate-800 p-6 rounded-2xl relative overflow-hidden group">
        <div class="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 rounded-full blur-xl"></div>
        <p class="text-slate-400 text-sm font-semibold uppercase tracking-wider">Test Duration</p>
        <p class="text-3xl font-extrabold text-emerald-400 mt-2 font-mono">${(summary.durationMs / 1000).toFixed(2)}s</p>
      </div>

      <!-- Requests -->
      <div class="bg-slate-900/60 backdrop-blur border border-slate-800 p-6 rounded-2xl relative overflow-hidden group">
        <div class="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-full blur-xl"></div>
        <p class="text-slate-400 text-sm font-semibold uppercase tracking-wider">Total Requests</p>
        <p class="text-3xl font-extrabold text-blue-400 mt-2 font-mono">${summary.totalRequests.toLocaleString()}</p>
      </div>

      <!-- RPS -->
      <div class="bg-slate-900/60 backdrop-blur border border-slate-800 p-6 rounded-2xl relative overflow-hidden group">
        <div class="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 rounded-full blur-xl"></div>
        <p class="text-slate-400 text-sm font-semibold uppercase tracking-wider">Avg Throughput</p>
        <p class="text-3xl font-extrabold text-purple-400 mt-2 font-mono">${summary.requestsPerSecond.toFixed(2)} req/s</p>
      </div>

      <!-- Success Rate -->
      <div class="bg-slate-900/60 backdrop-blur border border-slate-800 p-6 rounded-2xl relative overflow-hidden group">
        <div class="absolute top-0 right-0 w-24 h-24 bg-teal-500/5 rounded-full blur-xl"></div>
        <p class="text-slate-400 text-sm font-semibold uppercase tracking-wider">Success Rate</p>
        <p class="text-3xl font-extrabold mt-2 font-mono ${summary.failures > 0 ? 'text-amber-400' : 'text-teal-400'}">
          ${(summary.totalRequests === 0 ? 0 : (summary.successes / summary.totalRequests * 100)).toFixed(2)}%
        </p>
      </div>
    </div>

    <!-- Latency Stats -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
      <div class="bg-slate-900/40 border border-slate-800/80 p-5 rounded-2xl flex items-center justify-between">
        <div>
          <p class="text-slate-400 text-xs font-semibold uppercase tracking-wider">Avg Latency</p>
          <p class="text-2xl font-bold text-slate-200 mt-1 font-mono">${Math.round(summary.avgLatency)}ms</p>
        </div>
        <div class="p-3 bg-slate-800/60 rounded-xl text-emerald-400">⚡</div>
      </div>
      <div class="bg-slate-900/40 border border-slate-800/80 p-5 rounded-2xl flex items-center justify-between">
        <div>
          <p class="text-slate-400 text-xs font-semibold uppercase tracking-wider">P95 Latency</p>
          <p class="text-2xl font-bold text-slate-200 mt-1 font-mono">${Math.round(summary.p95Latency)}ms</p>
        </div>
        <div class="p-3 bg-slate-800/60 rounded-xl text-teal-400">📈</div>
      </div>
      <div class="bg-slate-900/40 border border-slate-800/80 p-5 rounded-2xl flex items-center justify-between">
        <div>
          <p class="text-slate-400 text-xs font-semibold uppercase tracking-wider">Max Latency</p>
          <p class="text-2xl font-bold text-slate-200 mt-1 font-mono">${Math.round(summary.maxLatency)}ms</p>
        </div>
        <div class="p-3 bg-slate-800/60 rounded-xl text-red-400">🔥</div>
      </div>
    </div>

    <!-- Charts Section -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      
      <!-- Latency Trend -->
      <div class="bg-slate-900/60 backdrop-blur border border-slate-800 p-6 rounded-3xl lg:col-span-2">
        <h2 class="text-xl font-bold mb-4 text-slate-200">Latency Trend (Sampled Sequence)</h2>
        <div class="h-64 relative">
          <canvas id="latencyChart"></canvas>
        </div>
      </div>

      <!-- Errors breakdown -->
      <div class="bg-slate-900/60 backdrop-blur border border-slate-800 p-6 rounded-3xl">
        <h2 class="text-xl font-bold mb-4 text-slate-200">HTTP Status Codes</h2>
        <div class="h-64 relative flex items-center justify-center">
          ${summary.totalRequests === 0 
            ? '<p class="text-slate-500">No requests executed</p>' 
            : '<canvas id="errorsChart"></canvas>'}
        </div>
      </div>
    </div>

    <!-- Details and Error Logs -->
    <div class="bg-slate-900/60 backdrop-blur border border-slate-800 p-6 rounded-3xl">
      <h2 class="text-xl font-bold mb-4 text-slate-200">Errors & Failures Details</h2>
      ${summary.failures === 0 
        ? '<div class="text-teal-400 bg-teal-500/10 border border-teal-500/20 px-4 py-3 rounded-xl">✓ All checks passed. Zero failures recorded.</div>'
        : `<div class="overflow-x-auto">
            <table class="w-full text-left text-sm text-slate-300">
              <thead class="text-xs uppercase bg-slate-800/50 text-slate-400 font-mono">
                <tr>
                  <th class="px-6 py-3 rounded-l-xl">Error Category</th>
                  <th class="px-6 py-3 rounded-r-xl text-right">Occurrence Count</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-800">
                ${Object.entries(summary.errorTypes).map(([type, count]) => `
                  <tr>
                    <td class="px-6 py-4 font-semibold text-amber-400 font-mono">${type}</td>
                    <td class="px-6 py-4 text-right font-mono">${count}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>`
      }
    </div>

  </div>

  <script>
    // Latency Chart
    const latencyCtx = document.getElementById('latencyChart').getContext('2d');
    const latenciesData = ${JSON.stringify(chartLatencies)};
    new Chart(latencyCtx, {
      type: 'line',
      data: {
        labels: latenciesData.map((_, idx) => idx + 1),
        datasets: [{
          label: 'Latency (ms)',
          data: latenciesData,
          borderColor: '#10b981',
          backgroundColor: 'rgba(16, 185, 129, 0.1)',
          borderWidth: 1.5,
          pointRadius: 0,
          fill: true,
          tension: 0.1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { 
            grid: { display: false },
            ticks: { display: false }
          },
          y: { 
            grid: { color: 'rgba(255, 255, 255, 0.05)' },
            ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono' } }
          }
        }
      }
    });

    // Errors Breakdown Chart
    const errorsCtx = document.getElementById('errorsChart');
    if (errorsCtx) {
      const successes = ${summary.successes};
      const failures = ${summary.failures};
      const errorLabels = ${JSON.stringify(errorLabels)};
      const errorData = ${JSON.stringify(errorData)};

      const labels = ['Success (' + successes + ')'];
      const data = [successes];
      const colors = ['#14b8a6'];

      if (failures > 0) {
        errorLabels.forEach((label, idx) => {
          labels.push(label + ' (' + errorData[idx] + ')');
          data.push(errorData[idx]);
          colors.push('#ef4444');
        });
      }

      new Chart(errorsCtx.getContext('2d'), {
        type: 'doughnut',
        data: {
          labels: labels,
          datasets: [{
            data: data,
            backgroundColor: colors,
            borderWidth: 0
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { 
              position: 'bottom',
              labels: { color: '#cbd5e1', font: { family: 'Outfit' } }
            }
          },
          cutout: '70%'
        }
      });
    }
  </script>
</body>
</html>`;

  fs.writeFileSync(fullPath, htmlContent, 'utf-8');
  return true;
}

/**
 * Parses thresholds string (e.g. "p95<200,errors<0.02").
 */
export function parseThresholds(thresholdsStr) {
  if (!thresholdsStr) return [];
  return thresholdsStr.split(',').map(item => {
    const match = item.trim().match(/^(p95|avg|max|errors)(<|>|<=|>=)(\d+(?:\.\d+)?)(%?)$/);
    if (!match) {
      console.error(chalk.red(`\n❌ Invalid threshold format: "${item}". Expected format: metric<value (e.g., p95<200, errors<1%).`));
      process.exit(1);
    }
    const [_, metric, operator, valueStr, percent] = match;
    let value = parseFloat(valueStr);
    if (percent === '%') {
      value = value / 100;
    }
    return { metric, operator, value, raw: item.trim() };
  });
}

/**
 * Evaluates performance statistics against defined SLA thresholds.
 */
export function evaluateThresholds(summary, parsedThresholds) {
  const results = [];
  let allPassed = true;

  for (const t of parsedThresholds) {
    let actualValue = 0;
    if (t.metric === 'p95') actualValue = summary.p95Latency;
    else if (t.metric === 'avg') actualValue = summary.avgLatency;
    else if (t.metric === 'max') actualValue = summary.maxLatency;
    else if (t.metric === 'errors') actualValue = summary.failureRate;

    let passed = false;
    switch (t.operator) {
      case '<': passed = actualValue < t.value; break;
      case '>': passed = actualValue > t.value; break;
      case '<=': passed = actualValue <= t.value; break;
      case '>=': passed = actualValue >= t.value; break;
    }

    if (!passed) allPassed = false;
    results.push({ ...t, actualValue, passed });
  }

  return { allPassed, results };
}

/**
 * Ensures the URL string has a protocol (defaults to http:// if missing).
 */
export function sanitizeUrl(urlStr) {
  if (!urlStr) return urlStr;
  const trimmed = urlStr.trim();
  if (!/^https?:\/\//i.test(trimmed)) {
    return 'http://' + trimmed;
  }
  return trimmed;
}

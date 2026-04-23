export class MetricsTracker {
  constructor() {
    this.totalRequests = 0;
    this.successes = 0;
    this.failures = 0;
    this.latencies = [];
    this.errorTypes = new Map();
    this.startTime = Date.now();
  }

  /**
   * Record a successful or expected response latency.
   * @param {number} statusCode 
   * @param {number} latencyMs 
   */
  record(statusCode, latencyMs) {
    this.totalRequests++;
    this.latencies.push(latencyMs);

    if (statusCode >= 200 && statusCode < 400) {
      this.successes++;
    } else {
      this.failures++;
      const key = `HTTP_${statusCode}`;
      this.errorTypes.set(key, (this.errorTypes.get(key) || 0) + 1);
    }
  }

  /**
   * Record an absolute failure (e.g., connection refused, timeout).
   * @param {Error} err 
   * @param {number} latencyMs 
   */
  recordError(err, latencyMs) {
    this.totalRequests++;
    this.failures++;
    this.latencies.push(latencyMs);

    // Simplistic error categorization
    let code = err.cause?.code || err.code || err.name || 'UNKNOWN';
    this.errorTypes.set(code, (this.errorTypes.get(code) || 0) + 1);
  }

  /**
   * Process all metrics and yield a summary report.
   * @returns {Object} Test summary object metrics.
   */
  summary() {
    const elapsedMs = Date.now() - this.startTime;
    const sorted = [...this.latencies].sort((a, b) => a - b);
    
    let avgLatency = 0;
    let maxLatency = 0;
    let p95Latency = 0;

    if (sorted.length > 0) {
      maxLatency = sorted[sorted.length - 1];
      const sum = sorted.reduce((acc, curr) => acc + curr, 0);
      avgLatency = sum / sorted.length;
      
      const p95Index = Math.floor(sorted.length * 0.95);
      p95Latency = sorted[p95Index];
    }

    const failureRate = this.totalRequests === 0 ? 0 : (this.failures / this.totalRequests);
    const rps = (this.totalRequests / (elapsedMs / 1000)) || 0;

    return {
      durationMs: elapsedMs,
      totalRequests: this.totalRequests,
      successes: this.successes,
      failures: this.failures,
      failureRate,
      avgLatency,
      maxLatency,
      p95Latency,
      requestsPerSecond: rps,
      errorTypes: Object.fromEntries(this.errorTypes)
    };
  }

  getRaw() {
    return {
      latencies: this.latencies,
      errors: Object.fromEntries(this.errorTypes)
    };
  }
}

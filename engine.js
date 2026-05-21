import { sleep } from './utils.js';

export class Engine {
  constructor(config, metrics) {
    this.config = config;
    this.metrics = metrics;
    this.abortController = new AbortController();
    this.activeVUs = 0;
    this.targetVUs = config.users;
    this.vuPromises = new Set();
  }

  async run() {
    this.adjusterInterval = setInterval(() => this.adjustVUs(), 100);

    // If spike mode and not interactive overrides, we ramp UP
    // If user presses up/down manually, targetVUs changes overriding this.
    if (this.config.mode === 'spike') {
      this.startSpikeRamp(); 
    } else {
      // constant or chaos starts with the requested target VUs.
      this.targetVUs = this.config.users;
    }

    if (this.config.duration > 0) {
      setTimeout(() => {
        this.stop();
      }, this.config.duration * 1000);
    }

    return new Promise(resolve => {
      this.abortController.signal.addEventListener('abort', async () => {
        clearInterval(this.adjusterInterval);
        if (this.spikeInterval) clearInterval(this.spikeInterval);
        await Promise.allSettled(Array.from(this.vuPromises));
        resolve();
      });
    });
  }

  setTargetUsers(newTarget) {
    this.targetVUs = Math.max(0, newTarget);
  }

  stop() {
    this.abortController.abort();
  }

  startSpikeRamp() {
    const halfDuration = (this.config.duration * 1000) / 2;
    const intervalTime = Math.max(10, halfDuration / (this.config.users || 1));
    this.targetVUs = 0; 
    
    let ramped = 0;
    this.spikeInterval = setInterval(() => {
      if (ramped < this.config.users) {
        this.setTargetUsers(this.targetVUs + 1);
        ramped++;
      } else {
        clearInterval(this.spikeInterval);
      }
    }, intervalTime);
  }

  adjustVUs() {
    if (this.abortController.signal.aborted) return;
    
    // Scale up
    while (this.activeVUs < this.targetVUs) {
      const p = this.virtualUser();
      this.vuPromises.add(p);
      p.finally(() => {
        this.vuPromises.delete(p);
        this.activeVUs--;
      });
      this.activeVUs++;
    }
  }

  async virtualUser() {
    while (!this.abortController.signal.aborted) {
      // Dynamic scale down check
      if (this.activeVUs > this.targetVUs) {
        return; // Graceful suicide for this VU loop
      }

      let currentDelay = this.config.delay || 0;
      let shouldFail = false;

      if (this.config.mode === 'chaos') {
        const chaosDelay = Math.random() * (this.config.delay || 500);
        currentDelay = chaosDelay;
        if (Math.random() < this.config.failRate) {
          shouldFail = true;
        }
      }

      if (currentDelay > 0) {
        await sleep(currentDelay);
      }

      const start = performance.now();
      
      // Individual request abort controller for timeout handling
      const requestController = new AbortController();
      const onAbort = () => requestController.abort();
      this.abortController.signal.addEventListener('abort', onAbort);

      // Default timeout of 10 seconds per request
      const timeoutId = setTimeout(() => requestController.abort(), 10000);

      try {
        if (shouldFail) {
          throw new Error('Chaos simulated failure 503');
        }

        const fetchOptions = {
          method: this.config.method,
          headers: this.config.headers,
          signal: requestController.signal
        };

        // Safety: fetch throws TypeError if body is passed on GET/HEAD requests
        if (this.config.body && !['GET', 'HEAD'].includes(this.config.method)) {
          fetchOptions.body = this.config.body;
        }

        const res = await fetch(this.config.url, fetchOptions);

        if (res.body) {
           await res.text().catch(()=> {});
        }

        this.metrics.record(res.status, performance.now() - start);
      } catch (err) {
        if (err.name === 'AbortError') {
          // If the engine itself stopped, break the loop
          if (this.abortController.signal.aborted) {
            break;
          }
          // Otherwise, it was a request timeout
          this.metrics.recordError(new Error('ETIMEDOUT: Request timed out after 10s'), performance.now() - start);
        } else if (err.message.includes('Chaos')) {
          this.metrics.record(503, performance.now() - start);
        } else {
          this.metrics.recordError(err, performance.now() - start);
        }
      } finally {
        clearTimeout(timeoutId);
        this.abortController.signal.removeEventListener('abort', onAbort);
      }
    }
  }
}

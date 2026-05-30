import { sleep } from '../utils/helpers.js';

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

    if (this.config.stages && this.config.stages.length > 0) {
      this.startStagesRamp();
    } else if (this.config.mode === 'spike') {
      this.startSpikeRamp(); 
    } else {
      this.targetVUs = this.config.users;
    }

    if (this.config.duration > 0) {
      this.durationTimeout = setTimeout(() => {
        this.stop();
      }, this.config.duration * 1000);
    }

    return new Promise(resolve => {
      this.abortController.signal.addEventListener('abort', async () => {
        clearInterval(this.adjusterInterval);
        if (this.spikeInterval) clearInterval(this.spikeInterval);
        if (this.stagesInterval) clearInterval(this.stagesInterval);
        if (this.durationTimeout) clearTimeout(this.durationTimeout);
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

  startStagesRamp() {
    let currentStageIndex = 0;
    let timeElapsedInStage = 0;
    this.targetVUs = 0; 

    const tickInterval = 100;
    const stages = this.config.stages;

    this.stagesInterval = setInterval(() => {
      if (this.abortController.signal.aborted) {
        clearInterval(this.stagesInterval);
        return;
      }

      const stage = stages[currentStageIndex];
      if (!stage) {
        clearInterval(this.stagesInterval);
        return;
      }

      const startVUs = currentStageIndex === 0 ? 0 : stages[currentStageIndex - 1].targetVUs;
      const endVUs = stage.targetVUs;
      const stageDuration = stage.durationMs;

      timeElapsedInStage += tickInterval;
      if (timeElapsedInStage >= stageDuration) {
        this.targetVUs = endVUs;
        currentStageIndex++;
        timeElapsedInStage = 0;
      } else {
        const ratio = timeElapsedInStage / stageDuration;
        const currentTarget = startVUs + (endVUs - startVUs) * ratio;
        this.targetVUs = Math.round(currentTarget);
      }
    }, tickInterval);
  }

  adjustVUs() {
    if (this.abortController.signal.aborted) return;
    
    while (this.activeVUs < this.targetVUs) {
      const p = this.virtualUser();
      this.vuPromises.add(p);
      p.finally(() => {
        this.vuPromises.delete(p);
      });
      this.activeVUs++;
    }
  }

  async virtualUser() {
    let decremented = false;
    try {
      while (!this.abortController.signal.aborted) {
        if (this.activeVUs > this.targetVUs) {
          this.activeVUs--;
          decremented = true;
          return;
        }

        let currentDelay = this.config.delay ?? 0;
        let shouldFail = false;

        if (this.config.mode === 'chaos') {
          const chaosDelay = Math.random() * (this.config.delay ?? 500);
          currentDelay = chaosDelay;
          if (Math.random() < this.config.failRate) {
            shouldFail = true;
          }
        }

        if (currentDelay > 0) {
          await sleep(currentDelay);
        }

        const start = performance.now();
        
        const requestController = new AbortController();
        const onAbort = () => requestController.abort();
        this.abortController.signal.addEventListener('abort', onAbort);

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
            if (this.abortController.signal.aborted) {
              break;
            }
            this.metrics.recordError(new Error('ETIMEDOUT: Request timed out after 10s'), performance.now() - start);
          } else if (err.message?.includes('Chaos')) {
            this.metrics.record(503, performance.now() - start);
          } else {
            this.metrics.recordError(err, performance.now() - start);
          }
        } finally {
          clearTimeout(timeoutId);
          this.abortController.signal.removeEventListener('abort', onAbort);
        }
      }
    } finally {
      if (!decremented) {
        this.activeVUs--;
      }
    }
  }
}

import type { MetricsCounters } from './types.js';

class Metrics {
  private counters: MetricsCounters = {
    mentionsSeen: 0,
    parseSuccess: 0,
    parseFailure: 0,
    validationPass: 0,
    validationFail: 0,
    launchSuccess: 0,
    launchFailure: 0,
    replySuccess: 0,
    replyFailure: 0,
  };

  increment(key: keyof MetricsCounters) {
    this.counters[key]++;
  }

  getAll(): MetricsCounters {
    return { ...this.counters };
  }

  reset() {
    for (const key in this.counters) {
      this.counters[key as keyof MetricsCounters] = 0;
    }
  }
}

export const metrics = new Metrics();

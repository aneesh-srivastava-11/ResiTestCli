import chalk from 'chalk';
import cliProgress from 'cli-progress';
import readline from 'readline';

import { Engine } from '../services/engine.js';
import { MetricsTracker } from '../services/metrics.js';
import { parseThresholds, evaluateThresholds, isLocalUrl, safeParseJSON, exportResults, formatDuration, promptConfirm, sanitizeUrl } from '../utils/helpers.js';

// Shared test runner execution function
export async function runTest(config) {
  // 1. Safety check
  if (!config.allowExternal && !isLocalUrl(config.url)) {
    console.log(chalk.yellow(`\n⚠️  WARNING: You are about to load test an external domain: ${config.url}`));
    const confirmed = await promptConfirm('Are you sure you want to proceed? (y/N): ');
    if (!confirmed) {
      console.log(chalk.green('\nTest aborted by user.'));
      process.exit(0);
    }
  }

  // 2. Setup
  console.log(chalk.green(`\n🚀 Initialize ResiTest against: ${chalk.white.bold(config.url)}`));
  if (config.stages && config.stages.length > 0) {
    console.log(chalk.gray(`Method: ${config.method} | Mode: stages | Stages: ${config.stages.length} defined | Total Duration: ${config.duration}s`));
  } else {
    console.log(chalk.gray(`Method: ${config.method} | Mode: ${config.mode} | Duration: ${config.duration}s | Initial VUs: ${config.users}`));
  }
  
  if (config.mode === 'chaos') {
    console.log(chalk.magenta(`🔥 Chaos Enabled (Fail Rate: ${config.failRate}, Max Delay: ${config.delay ?? 500}ms)`));
  }
  console.log(chalk.green(`💡 Hint: Use Arrow UP/DOWN to dynamically scale virtual users.\n`));

  const metrics = new MetricsTracker();
  const engine = new Engine(config, metrics);

  // 3. Progress bar setup
  const progressBar = new cliProgress.SingleBar({
    format: `[${chalk.green('{bar}')}] ${chalk.green('{percentage}%')} | VUs: ${chalk.greenBright('{activeVUs}')}/${chalk.gray('{targetVUs}')} | Req: {req} | Err: {err} | RPS: {rps}`,
    barCompleteChar: '\u2588',
    barIncompleteChar: '\u2591',
    hideCursor: true
  });

  progressBar.start(config.duration, 0, {
    activeVUs: 0,
    targetVUs: config.users,
    req: 0,
    err: 0,
    rps: 0
  });

  // 4. Interactive user controls via stdin
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
  }
  const keypressHandler = (str, key) => {
    if (key.ctrl && key.name === 'c') {
      engine.stop();
      cleanupStdin();
    } else if (key.name === 'up') {
      engine.setTargetUsers(engine.targetVUs + 1);
    } else if (key.name === 'down') {
      engine.setTargetUsers(engine.targetVUs - 1);
    }
  };
  process.stdin.on('keypress', keypressHandler);

  function cleanupStdin() {
    process.stdin.removeListener('keypress', keypressHandler);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.pause();
  }

  // 5. Run Loop
  let elapsedWholeSeconds = 0;
  const uiInterval = setInterval(() => {
    elapsedWholeSeconds++;
    if (elapsedWholeSeconds > config.duration) elapsedWholeSeconds = config.duration;
    
    const p = engine.metrics.summary();
    progressBar.update(elapsedWholeSeconds, {
      activeVUs: engine.activeVUs,
      targetVUs: engine.targetVUs,
      req: p.totalRequests,
      err: p.failures,
      rps: p.requestsPerSecond.toFixed(1)
    });
  }, 1000);

  // 6. Execute Engine
  await engine.run();
  
  // 7. Teardown
  cleanupStdin();
  clearInterval(uiInterval);
  progressBar.update(config.duration);
  progressBar.stop();

  // 8. Generate Summary
  const finalStats = metrics.summary();
  const successPercent = finalStats.totalRequests === 0 ? 0 : ((finalStats.successes / finalStats.totalRequests) * 100).toFixed(1);
  const failPercent = finalStats.totalRequests === 0 ? 0 : ((finalStats.failures / finalStats.totalRequests) * 100).toFixed(1);

  console.log('\n✅ ' + chalk.bold.green('ResiTest Complete'));
  console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(`  Mode        : ${config.stages ? 'stages' : config.mode}`);
  console.log(`  URL         : ${config.url}`);
  console.log(`  Duration    : ${formatDuration(finalStats.durationMs)}`);
  console.log('');
  console.log(`  Total Req   :  ${finalStats.totalRequests}`);
  console.log(`  Success     :  ${chalk.green(finalStats.successes)}  (${successPercent}%)`);
  console.log(`  Failures    :  ${finalStats.failures > 0 ? chalk.red(finalStats.failures) : chalk.green('0')}  (${failPercent}%)`);
  console.log('');
  console.log(`  Avg Latency : ${formatDuration(finalStats.avgLatency)}`);
  console.log(`  Max Latency : ${formatDuration(finalStats.maxLatency)}`);
  console.log(`  P95 Latency : ${formatDuration(finalStats.p95Latency)}`);
  console.log(`  RPS         : ${finalStats.requestsPerSecond.toFixed(2)} req/s`);
  
  if (finalStats.failures > 0) {
    console.log('');
    console.log(chalk.yellow('  Error Details:'));
    for (const [type, count] of Object.entries(finalStats.errorTypes)) {
      console.log(`    ${type}: ${count}`);
    }
  }
  console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n'));

  // 9. Evaluate Thresholds
  let thresholdsPassed = true;
  if (config.thresholds && config.thresholds.length > 0) {
    console.log(chalk.green('⚖️  SLA Thresholds Validation:'));
    const { allPassed, results } = evaluateThresholds(finalStats, config.thresholds);
    thresholdsPassed = allPassed;
    for (const r of results) {
      const actualStr = r.metric === 'errors' ? `${(r.actualValue * 100).toFixed(2)}%` : formatDuration(r.actualValue);
      const thresholdValStr = r.metric === 'errors' ? `${(r.value * 100).toFixed(2)}%` : `${r.value}ms`;
      if (r.passed) {
        console.log(`  ${chalk.green('✓')} ${r.raw}: Passed (Actual: ${actualStr})`);
      } else {
        console.log(`  ${chalk.red('✗')} ${r.raw}: Failed (Actual: ${actualStr}, Target: ${r.operator}${thresholdValStr})`);
      }
    }
    console.log('');
  }

  // Export if needed
  if (config.outputFile) {
    exportResults(finalStats, metrics.getRaw(), config.outputFile);
    console.log(chalk.green(`📁 Results exported to ${config.outputFile}\n`));
  }
  
  if (!thresholdsPassed) {
    console.log(chalk.red('❌ Load test failed due to SLA threshold violations.\n'));
    process.exit(1);
  }

  process.exit(0);
}

// Helpers for method formatting colors
export function getMethodColor(method) {
  switch (method.toUpperCase()) {
    case 'GET': return 'green';
    case 'POST': return 'yellow';
    case 'PUT': return 'blue';
    case 'DELETE': return 'red';
    case 'PATCH': return 'magenta';
    default: return 'white';
  }
}

export function parseStages(stagesStr) {
  if (!stagesStr) return null;
  return stagesStr.split(',').map(stage => {
    const parts = stage.trim().split(':');
    if (parts.length !== 2) {
      console.error(chalk.red(`\n❌ Invalid stage format: "${stage}". Expected format: duration:vus (e.g., 10s:20).`));
      process.exit(1);
    }
    const durationStr = parts[0].trim();
    const vusStr = parts[1].trim();
    
    let durationMs = 0;
    const durationMatch = durationStr.match(/^(\d+)(s|m)$/i);
    if (!durationMatch) {
      console.error(chalk.red(`\n❌ Invalid stage duration: "${durationStr}". Expected suffix 's' or 'm' (e.g., 10s, 2m).`));
      process.exit(1);
    }
    const val = parseInt(durationMatch[1], 10);
    const unit = durationMatch[2].toLowerCase();
    if (unit === 's') {
      durationMs = val * 1000;
    } else if (unit === 'm') {
      durationMs = val * 60 * 1000;
    }
    
    const targetVUs = parseInt(vusStr, 10);
    if (isNaN(targetVUs)) {
      console.error(chalk.red(`\n❌ Invalid stage VUs: "${vusStr}". Expected a number.`));
      process.exit(1);
    }
    
    return { durationMs, targetVUs };
  });
}

export function buildConfig(options, url, method, body, headers) {
  const stages = parseStages(options.stages);
  let duration = parseInt(options.duration, 10) || 10;
  if (stages && stages.length > 0) {
    duration = stages.reduce((acc, s) => acc + (s.durationMs / 1000), 0);
  }

  const delay = options.delay !== undefined ? parseInt(options.delay, 10) : undefined;

  return {
    url,
    mode: options.mode.toLowerCase(),
    users: parseInt(options.users, 10) || 10,
    duration,
    failRate: parseFloat(options.failRate) || 0,
    delay,
    method: method.toUpperCase(),
    allowExternal: options.allowExternal,
    outputFile: options.output,
    headers: headers || {},
    body,
    stages,
    thresholds: parseThresholds(options.thresholds)
  };
}

export async function runAction(url, options) {
  if (!['spike', 'constant', 'chaos'].includes(options.mode.toLowerCase())) {
    console.error(chalk.red(`\n❌ Invalid mode: ${options.mode}. Must be one of spike, constant, chaos.`));
    process.exit(1);
  }

  const sanitizedUrl = sanitizeUrl(url);
  const headers = safeParseJSON(options.headers, '--headers') || {};
  const config = buildConfig(options, sanitizedUrl, options.method, options.body, headers);
  await runTest(config);
}

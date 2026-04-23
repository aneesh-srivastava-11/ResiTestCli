#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import cliProgress from 'cli-progress';
import ora from 'ora';
import readline from 'readline';

import { Engine } from './engine.js';
import { MetricsTracker } from './metrics.js';
import { isLocalUrl, safeParseJSON, exportResults, formatDuration } from './utils.js';

const program = new Command();

program
  .name('resitest')
  .description('Production-grade API Resilience & Load Testing CLI')
  .version('1.0.0');

program
  .command('run <url>')
  .description('Run a load test against the specified URL')
  .option('-m, --mode <type>', 'Load mode [spike|constant|chaos]', 'constant')
  .option('-u, --users <number>', 'Number of virtual users (target)', '10')
  .option('-d, --duration <seconds>', 'Test duration in seconds', '10')
  .option('-f, --fail-rate <rate>', 'Chaos failure rate (0 to 1)', '0')
  .option('-l, --delay <ms>', 'Delay between loops or chaos max delay', '0')
  .option('-X, --method <type>', 'HTTP Request method', 'GET')
  .option('-b, --body <json>', 'JSON string body payload')
  .option('-H, --headers <json>', 'JSON string for headers')
  .option('--allow-external', 'Allow testing external domains without prompt', false)
  .option('-o, --output <file>', 'Export results to file (support .json, .csv)')
  .action(async (url, options) => {
    // 1. Initial configuration validation
    const config = {
      url,
      mode: options.mode.toLowerCase(),
      users: parseInt(options.users, 10) || 10,
      duration: parseInt(options.duration, 10) || 10,
      failRate: parseFloat(options.failRate) || 0,
      delay: parseInt(options.delay, 10) || 0,
      method: options.method.toUpperCase(),
      allowExternal: options.allowExternal,
      outputFile: options.output,
      headers: safeParseJSON(options.headers, '--headers') || {},
      body: options.body // Keep as string for fetch
    };

    if (!['spike', 'constant', 'chaos'].includes(config.mode)) {
      console.error(chalk.red(`\n❌ Invalid mode: ${config.mode}. Must be one of spike, constant, chaos.`));
      process.exit(1);
    }
    
    // Safety check
    if (!config.allowExternal && !isLocalUrl(url)) {
      console.log(chalk.yellow(`\n⚠️  WARNING: You are about to load test an external domain: ${url}`));
      const confirmed = await promptConfirm('Are you sure you want to proceed? (y/N): ');
      if (!confirmed) {
        console.log(chalk.blue('\nTest aborted by user.'));
        process.exit(0);
      }
    }

    // 2. Setup
    console.log(chalk.cyan(`\n🚀 Initialize ResiTest against: ${chalk.white.bold(url)}`));
    console.log(chalk.gray(`Mode: ${config.mode} | Duration: ${config.duration}s | Initial VUs: ${config.users}`));
    if (config.mode === 'chaos') {
      console.log(chalk.magenta(`🔥 Chaos Enabled (Fail Rate: ${config.failRate}, Max Delay: ${config.delay}ms)`));
    }
    console.log(chalk.green(`💡 Hint: Use Arrow UP/DOWN to dynamically scale virtual users.\n`));

    const metrics = new MetricsTracker();
    const engine = new Engine(config, metrics);

    // 3. Progress bar setup
    const progressBar = new cliProgress.SingleBar({
      format: `[${chalk.cyan('{bar}')}] ${chalk.green('{percentage}%')} | VUs: ${chalk.yellow('{activeVUs}')}/${chalk.gray('{targetVUs}')} | Req: {req} | Err: {err} | RPS: {rps}`,
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

    console.log('\n✅ ' + chalk.bold.white('ResiTest Complete'));
    console.log(chalk.gray('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
    console.log(`  Mode        : ${config.mode}`);
    console.log(`  URL         : ${url}`);
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

    // Export if needed
    if (config.outputFile) {
      exportResults(finalStats, metrics.getRaw(), config.outputFile);
      console.log(chalk.green(`📁 Results exported to ${config.outputFile}\n`));
    }
    
    process.exit(0);
  });

program.parse(process.argv);

// Helper for interactive prompt
function promptConfirm(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      const isYes = answer.trim().toLowerCase() === 'y' || answer.trim().toLowerCase() === 'yes';
      resolve(isYes);
    });
  });
}

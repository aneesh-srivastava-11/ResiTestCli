import { Command } from 'commander';
import chalk from 'chalk';
import { runAction } from './commands/run.js';
import { discoverAction } from './commands/discover.js';

export function runCLI() {
  console.log(chalk.green.bold(`
ANEESH SRIVASTAVA
(KING PENGUIN)
SAIYAARA
`));

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
    .option('-l, --delay <ms>', 'Delay between loops or chaos max delay')
    .option('-X, --method <type>', 'HTTP Request method', 'GET')
    .option('-b, --body <json>', 'JSON string body payload')
    .option('-H, --headers <json>', 'JSON string for headers')
    .option('--allow-external', 'Allow testing external domains without prompt', false)
    .option('-o, --output <file>', 'Export results to file (support .json, .csv, .html)')
    .option('-s, --stages <stages>', 'Ramping stages: duration:vus,... (e.g. 5s:10,10s:20,5s:0)')
    .option('-t, --thresholds <thresholds>', 'SLA thresholds (e.g. p95<200,errors<1%)')
    .action(runAction);

  program
    .command('discover [url]')
    .description('Discover endpoints from a Swagger/OpenAPI site URL and test one interactively')
    .option('-m, --mode <type>', 'Load mode [spike|constant|chaos]', 'constant')
    .option('-u, --users <number>', 'Number of virtual users (target)', '10')
    .option('-d, --duration <seconds>', 'Test duration in seconds', '10')
    .option('-f, --fail-rate <rate>', 'Chaos failure rate (0 to 1)', '0')
    .option('-l, --delay <ms>', 'Delay between loops or chaos max delay')
    .option('--allow-external', 'Allow testing external domains without prompt', false)
    .option('-o, --output <file>', 'Export results to file (support .json, .csv, .html)')
    .option('-s, --stages <stages>', 'Ramping stages: duration:vus,... (e.g. 5s:10,10s:20,5s:0)')
    .option('-t, --thresholds <thresholds>', 'SLA thresholds (e.g. p95<200,errors<1%)')
    .action(discoverAction);

  program.parse(process.argv);
}

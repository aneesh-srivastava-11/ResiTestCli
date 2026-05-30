import readline from 'readline';
import chalk from 'chalk';
import ora from 'ora';

import { runTest, buildConfig, getMethodColor } from './run.js';
import { promptConfirm, sanitizeUrl } from '../utils/helpers.js';

/**
 * Custom interactive console choice selector with pagination support.
 * Allows using UP/DOWN arrow keys and Enter.
 */
export function interactiveSelect(question, choices) {
  return new Promise((resolve) => {
    let cursor = 0;
    const stdout = process.stdout;
    const stdin = process.stdin;
    let renderedOnce = false;
    let lastPrintedLines = 0;

    const wasRaw = stdin.isRaw;
    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    readline.emitKeypressEvents(stdin);

    const PAGE_SIZE = 10;
    let startIdx = 0;

    function render() {
      stdout.write('\u001B[?25l');
      
      if (cursor < startIdx) {
        startIdx = cursor;
      } else if (cursor >= startIdx + PAGE_SIZE) {
        startIdx = cursor - PAGE_SIZE + 1;
      }

      const visibleChoices = choices.slice(startIdx, startIdx + PAGE_SIZE);
      
      if (renderedOnce) {
        readline.moveCursor(stdout, 0, -lastPrintedLines);
        for (let i = 0; i < lastPrintedLines; i++) {
          readline.clearLine(stdout, 0);
          readline.moveCursor(stdout, 0, 1);
        }
        readline.moveCursor(stdout, 0, -lastPrintedLines);
      }
      
      let linesCount = 0;
      stdout.write(chalk.green('? ') + chalk.bold(question) + '\n');
      linesCount++;

      visibleChoices.forEach((choice, index) => {
        const actualIndex = startIdx + index;
        const isCurrent = actualIndex === cursor;
        if (isCurrent) {
          stdout.write(`${chalk.green('❯')} ${choice}\n`);
        } else {
          stdout.write(`  ${choice}\n`);
        }
        linesCount++;
      });

      // Pagination footer
      if (choices.length > PAGE_SIZE) {
        stdout.write(chalk.gray(`  (Showing ${startIdx + 1}-${Math.min(startIdx + PAGE_SIZE, choices.length)} of ${choices.length} choices. Use arrows to scroll)\n`));
        linesCount++;
      }

      renderedOnce = true;
      lastPrintedLines = linesCount;
    }

    render();

    function onKeypress(str, key) {
      if (key.ctrl && key.name === 'c') {
        stdout.write('\u001B[?25h\n');
        cleanup();
        process.exit(0);
      }

      if (key.name === 'up') {
        cursor = cursor === 0 ? choices.length - 1 : cursor - 1;
        render();
      } else if (key.name === 'down') {
        cursor = cursor === choices.length - 1 ? 0 : cursor + 1;
        render();
      } else if (key.name === 'return' || key.name === 'enter') {
        stdout.write('\u001B[?25h\n');
        cleanup();
        resolve(cursor);
      }
    }

    function cleanup() {
      stdin.removeListener('keypress', onKeypress);
      if (stdin.isTTY) {
        stdin.setRawMode(wasRaw);
      }
    }

    stdin.on('keypress', onKeypress);
  });
}

/**
 * Standard single-line text input prompt.
 */
export function interactiveInput(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(chalk.green('? ') + chalk.bold(question) + ': ', (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

/**
 * Multi-line text input helper. Useful for JSON payload overriding.
 * Continues capturing lines until the user hits Enter twice on empty lines.
 */
export function interactiveMultiLineInput(question, defaultValue = '') {
  return new Promise((resolve) => {
    console.log(chalk.green('\n? ') + chalk.bold(question));
    console.log(chalk.gray('  (Press Enter twice on a new blank line to save & confirm)'));
    if (defaultValue) {
      console.log(chalk.gray('  Current default payload:'));
      console.log(chalk.gray(defaultValue.split('\n').map(l => '  | ' + l).join('\n')));
    }

    const lines = [];
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.on('line', (line) => {
      if (line.trim() === '') {
        rl.close();
        const output = lines.join('\n').trim();
        resolve(output || defaultValue);
      } else {
        lines.push(line);
      }
    });
  });
}

/**
 * Scans a base URL to locate Swagger/OpenAPI documentation.
 */
export async function fetchSwagger(baseUrl) {
  const spinner = ora('Scanning testing site for Swagger/OpenAPI docs...').start();
  
  const commonPaths = [
    '/swagger.json',
    '/swagger/v1/swagger.json',
    '/openapi.json',
    '/api-docs',
    '/api/docs',
    '/swagger/index.html',
    '/'
  ];

  let targetUrl = baseUrl;
  if (baseUrl.endsWith('.json')) {
    try {
      const res = await fetch(baseUrl);
      if (res.ok) {
        const doc = await res.json();
        spinner.succeed(`Successfully imported Swagger docs from URL.`);
        return { doc, baseUrl: new URL(baseUrl).origin };
      }
    } catch (err) {}
  }

  const cleanBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  for (const pathStr of commonPaths) {
    const scanUrl = `${cleanBase}${pathStr}`;
    try {
      const res = await fetch(scanUrl);
      if (res.ok) {
        const text = await res.text();
        try {
          const parsed = JSON.parse(text);
          if (parsed.paths || parsed.openapi || parsed.swagger) {
            spinner.succeed(`Discovered API Docs at: ${scanUrl}`);
            return { doc: parsed, baseUrl: cleanBase };
          }
        } catch (e) {
          // Check if it's HTML containing links to swagger.json
          const match = text.match(/href="([^"]*swagger\.json[^"]*)"/i) || text.match(/url:\s*'([^']*)'/);
          if (match) {
            let foundPath = match[1];
            if (!foundPath.startsWith('http')) {
              foundPath = foundPath.startsWith('/') ? `${cleanBase}${foundPath}` : `${cleanBase}/${foundPath}`;
            }
            const followRes = await fetch(foundPath);
            if (followRes.ok) {
              const followDoc = await followRes.json();
              spinner.succeed(`Discovered API Docs following Swagger index: ${foundPath}`);
              return { doc: followDoc, baseUrl: cleanBase };
            }
          }
        }
      }
    } catch (err) {}
  }

  spinner.fail('Could not automatically detect Swagger/OpenAPI definitions.');
  return null;
}

/**
 * Helper to resolve parameter references within OpenAPI definitions.
 */
function resolveSchemaRef(ref, definitions = {}, components = {}) {
  if (!ref) return null;
  const parts = ref.split('/');
  if (parts[1] === 'definitions') {
    return definitions[parts[2]] || null;
  }
  if (parts[1] === 'components') {
    const section = parts[2];
    const name = parts[3];
    return components[section]?.[name] || null;
  }
  return null;
}

/**
 * Generates mock JSON payload structures from Swagger/OpenAPI schemas,
 * tracking schemas to prevent circular reference stack overflows.
 */
export function generateMockFromSchema(schema, definitions = {}, components = {}, seen = new Set()) {
  if (!schema) return 'data';

  if (schema.$ref) {
    if (seen.has(schema.$ref)) {
      return {}; 
    }
    const resolved = resolveSchemaRef(schema.$ref, definitions, components);
    if (!resolved) return {};
    seen.add(schema.$ref);
    const result = generateMockFromSchema(resolved, definitions, components, seen);
    seen.delete(schema.$ref);
    return result;
  }

  if (schema.allOf) {
    let mock = {};
    for (const sub of schema.allOf) {
      mock = { ...mock, ...generateMockFromSchema(sub, definitions, components, seen) };
    }
    return mock;
  }
  if (schema.oneOf || schema.anyOf) {
    const sub = (schema.oneOf || schema.anyOf)[0];
    return generateMockFromSchema(sub, definitions, components, seen);
  }

  switch (schema.type) {
    case 'object':
      const obj = {};
      const props = schema.properties || {};
      for (const [key, prop] of Object.entries(props)) {
        obj[key] = generateMockFromSchema(prop, definitions, components, seen);
      }
      return obj;
    case 'array':
      const itemsSchema = schema.items || {};
      return [generateMockFromSchema(itemsSchema, definitions, components, seen)];
    case 'string':
      if (schema.format === 'date-time') return new Date().toISOString();
      if (schema.format === 'email') return 'user@example.com';
      if (schema.format === 'uuid') return '123e4567-e89b-12d3-a456-426614174000';
      if (schema.enum && schema.enum.length > 0) return schema.enum[0];
      return schema.default || 'test_string';
    case 'integer':
    case 'number':
      return schema.default !== undefined ? schema.default : 42;
    case 'boolean':
      return schema.default !== undefined ? schema.default : true;
    default:
      if (schema.properties) {
        return generateMockFromSchema({ ...schema, type: 'object' }, definitions, components, seen);
      }
      return 'data';
  }
}

/**
 * Parses endpoints from a Swagger/OpenAPI JSON document.
 */
export function parseOpenApi(doc) {
  const endpoints = [];
  const paths = doc.paths || {};
  const definitions = doc.definitions || {};
  const components = doc.components || {};

  for (const [pathStr, pathItem] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      if (['get', 'post', 'put', 'delete', 'patch'].includes(method.toLowerCase())) {
        const uppercaseMethod = method.toUpperCase();
        
        const parameters = [
          ...(pathItem.parameters || []),
          ...(operation.parameters || [])
        ];

        let mockPath = pathStr;
        const queryParams = {};
        const headers = {};

        for (const param of parameters) {
          let resolvedParam = param;
          if (param.$ref) {
            const refPath = param.$ref.split('/');
            if (refPath[1] === 'components' && refPath[2] === 'parameters') {
              resolvedParam = components.parameters?.[refPath[3]] || param;
            } else if (refPath[1] === 'parameters') {
              resolvedParam = doc.parameters?.[refPath[2]] || param;
            }
          }

          const name = resolvedParam.name;
          const location = resolvedParam.in; 
          const schema = resolvedParam.schema || resolvedParam;
          const mockVal = generateMockFromSchema(schema, definitions, components) ?? '1';

          if (location === 'path') {
            mockPath = mockPath.replace(`{${name}}`, mockVal);
            mockPath = mockPath.replace(`:${name}`, mockVal);
          } else if (location === 'query') {
            queryParams[name] = mockVal;
          } else if (location === 'header') {
            headers[name] = mockVal;
          }
        }

        let body = null;
        if (operation.requestBody) {
          const content = operation.requestBody.content || {};
          const jsonContent = content['application/json'];
          if (jsonContent && jsonContent.schema) {
            body = generateMockFromSchema(jsonContent.schema, definitions, components);
          }
        } else {
          const bodyParam = parameters.find(p => p.in === 'body');
          if (bodyParam && bodyParam.schema) {
            body = generateMockFromSchema(bodyParam.schema, definitions, components);
          }
        }

        endpoints.push({
          method: uppercaseMethod,
          path: pathStr,
          mockPath,
          queryParams,
          headers,
          body: body ? JSON.stringify(body) : null,
          summary: operation.summary || operation.description || ''
        });
      }
    }
  }
  return endpoints;
}

export async function discoverAction(urlInput, options) {
  let url = urlInput;
  if (!url) {
    url = await interactiveInput('Enter your testing site base URL or Swagger JSON URL');
    if (!url) {
      console.error(chalk.red('❌ A URL is required.'));
      process.exit(1);
    }
  }
  url = sanitizeUrl(url);

  const discoveryResult = await fetchSwagger(url);
  if (!discoveryResult) {
    console.error(chalk.red('\n❌ Failed to discover Swagger/OpenAPI endpoints. Make sure the site is running and exposing an OpenAPI endpoint.'));
    process.exit(1);
  }

  const { doc, baseUrl } = discoveryResult;
  const endpoints = parseOpenApi(doc);

  if (endpoints.length === 0) {
    console.error(chalk.red('❌ No valid REST API endpoints found in the documentation.'));
    process.exit(1);
  }

  const choices = endpoints.map(ep => {
    const summaryText = ep.summary ? ` - ${chalk.gray(ep.summary)}` : '';
    const methodColor = getMethodColor(ep.method);
    const coloredMethod = chalk[methodColor](ep.method.padEnd(7));
    return `${coloredMethod} ${ep.path}${summaryText}`;
  });

  const selectedIndex = await interactiveSelect('Select an endpoint to load test:', choices);
  const endpoint = endpoints[selectedIndex];

  let finalUrl;
  try {
    finalUrl = new URL(endpoint.mockPath, baseUrl).toString();
    if (Object.keys(endpoint.queryParams).length > 0) {
      const urlObj = new URL(finalUrl);
      for (const [key, val] of Object.entries(endpoint.queryParams)) {
        urlObj.searchParams.append(key, val);
      }
      finalUrl = urlObj.toString();
    }
  } catch (err) {
    const pathConcat = endpoint.mockPath.startsWith('/') ? endpoint.mockPath.slice(1) : endpoint.mockPath;
    finalUrl = baseUrl.endsWith('/') ? `${baseUrl}${pathConcat}` : `${baseUrl}/${pathConcat}`;
  }

  console.log(chalk.green(`\n🎯 Selected Endpoint: ${chalk.white.bold(`${endpoint.method} ${endpoint.path}`)}`));
  console.log(chalk.green(`🔗 Target Request URL: ${chalk.white(finalUrl)}`));
  
  let finalBody = endpoint.body;
  if (endpoint.body) {
    console.log(chalk.green(`📦 Auto-generated Mock Payload:`));
    console.log(chalk.gray(JSON.stringify(JSON.parse(endpoint.body), null, 2)));
    
    const wantsToEdit = await promptConfirm('\nWould you like to edit this mock payload? (y/N) ');
    if (wantsToEdit) {
      const userInput = await interactiveMultiLineInput('Enter new JSON payload:', endpoint.body);
      try {
        JSON.parse(userInput);
        finalBody = userInput;
        console.log(chalk.green('✓ Valid JSON received.'));
      } catch (e) {
        console.log(chalk.red(`❌ Invalid JSON: ${e.message}. Using default mock payload.`));
      }
    }
  } else {
    console.log(chalk.green(`📦 Payload: None`));
  }

  const confirmRun = await promptConfirm('\nDo you want to start the load test with these settings? (Y/n) ');
  if (!confirmRun) {
    console.log(chalk.green('\nTest aborted by user.'));
    process.exit(0);
  }

  const headers = { ...endpoint.headers };
  if (finalBody) {
    headers['Content-Type'] = 'application/json';
  }

  const config = buildConfig(options, finalUrl, endpoint.method, finalBody, headers);
  await runTest(config);
}

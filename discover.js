import readline from 'readline';
import chalk from 'chalk';
import ora from 'ora';

/**
 * Custom interactive console choice selector.
 * Allows using UP/DOWN arrow keys and Enter.
 */
export function interactiveSelect(question, choices) {
  return new Promise((resolve) => {
    let cursor = 0;
    const stdout = process.stdout;
    const stdin = process.stdin;
    let renderedOnce = false;

    // Ensure raw mode is enabled
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY) {
      stdin.setRawMode(true);
    }
    readline.emitKeypressEvents(stdin);

    function render() {
      // Hide cursor to prevent blinking
      stdout.write('\u001B[?25l');
      
      // Clear the printed block
      if (renderedOnce) {
        readline.moveCursor(stdout, 0, -(choices.length + 1));
        for (let i = 0; i <= choices.length; i++) {
          readline.clearLine(stdout, 0);
          if (i < choices.length) {
            readline.moveCursor(stdout, 0, 1);
          }
        }
        readline.moveCursor(stdout, 0, -choices.length);
      }
      
      stdout.write(`${chalk.cyan('?')} ${chalk.bold(question)}\n`);
      for (let i = 0; i < choices.length; i++) {
        const choice = choices[i];
        if (i === cursor) {
          stdout.write(`${chalk.cyan('❯')} ${chalk.cyan(choice)}\n`);
        } else {
          stdout.write(`  ${choice}\n`);
        }
      }
      renderedOnce = true;
    }

    // Initial render
    render();

    function onKeypress(str, key) {
      if (key.ctrl && key.name === 'c') {
        cleanup();
        process.exit(0);
      } else if (key.name === 'up') {
        cursor = (cursor - 1 + choices.length) % choices.length;
        render();
      } else if (key.name === 'down') {
        cursor = (cursor + 1) % choices.length;
        render();
      } else if (key.name === 'return' || key.name === 'enter') {
        cleanup();
        // Clear choices from screen
        readline.moveCursor(stdout, 0, -(choices.length + 1));
        for (let i = 0; i <= choices.length; i++) {
          readline.clearLine(stdout, 0);
          if (i < choices.length) {
            readline.moveCursor(stdout, 0, 1);
          }
        }
        readline.moveCursor(stdout, 0, -choices.length);
        resolve(cursor);
      }
    }

    function cleanup() {
      stdout.write('\u001B[?25h'); // Restore cursor
      stdin.removeListener('keypress', onKeypress);
      if (stdin.isTTY) {
        stdin.setRawMode(wasRaw);
      }
    }

    stdin.on('keypress', onKeypress);
  });
}

/**
 * Prompt user for a text input.
 */
export function interactiveInput(question, defaultValue = '') {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    const displayQuestion = defaultValue ? `${question} (${defaultValue}): ` : `${question}: `;
    rl.question(displayQuestion, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue);
    });
  });
}

/**
 * Generates mock data from OpenAPI/Swagger JSON schema definitions.
 */
function generateMockFromSchema(schema, definitions = {}, components = {}) {
  if (!schema) return null;

  // Resolve ref if present
  if (schema.$ref) {
    const refPath = schema.$ref.split('/');
    let resolved = null;
    if (refPath[1] === 'components' && refPath[2] === 'schemas') {
      resolved = components.schemas?.[refPath[3]];
    } else if (refPath[1] === 'definitions') {
      resolved = definitions[refPath[2]];
    }
    if (resolved) {
      return generateMockFromSchema(resolved, definitions, components);
    }
    return {};
  }

  // Handle allOf, anyOf, oneOf
  if (schema.allOf) {
    let mock = {};
    for (const sub of schema.allOf) {
      mock = { ...mock, ...generateMockFromSchema(sub, definitions, components) };
    }
    return mock;
  }
  if (schema.oneOf || schema.anyOf) {
    const sub = (schema.oneOf || schema.anyOf)[0];
    return generateMockFromSchema(sub, definitions, components);
  }

  switch (schema.type) {
    case 'object':
      const obj = {};
      const props = schema.properties || {};
      for (const [key, prop] of Object.entries(props)) {
        obj[key] = generateMockFromSchema(prop, definitions, components);
      }
      return obj;
    case 'array':
      const itemsSchema = schema.items || {};
      return [generateMockFromSchema(itemsSchema, definitions, components)];
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
        return generateMockFromSchema({ ...schema, type: 'object' }, definitions, components);
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
        
        // Combine path-level and operation-level parameters
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
            }
          }

          const name = resolvedParam.name;
          const location = resolvedParam.in; // 'path', 'query', 'header'
          const schema = resolvedParam.schema || resolvedParam;
          const mockVal = generateMockFromSchema(schema, definitions, components) ?? '1';

          if (location === 'path') {
            mockPath = mockPath.replace(`{${name}}`, mockVal);
            // Also support colon-based syntax
            mockPath = mockPath.replace(`:${name}`, mockVal);
          } else if (location === 'query') {
            queryParams[name] = mockVal;
          } else if (location === 'header') {
            headers[name] = mockVal;
          }
        }

        // Generate request body
        let body = null;
        if (operation.requestBody) {
          const content = operation.requestBody.content || {};
          const jsonContent = content['application/json'];
          if (jsonContent && jsonContent.schema) {
            body = generateMockFromSchema(jsonContent.schema, definitions, components);
          }
        } else {
          // Swagger v2 fallback
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

/**
 * Attempts to automatically discover Swagger/OpenAPI docs from a base URL.
 */
export async function fetchSwagger(url) {
  let targetUrl = url.trim();
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'http://' + targetUrl;
  }

  // Remove trailing slash for path manipulation
  if (targetUrl.endsWith('/')) {
    targetUrl = targetUrl.slice(0, -1);
  }

  const spinner = ora('Discovering Swagger/OpenAPI endpoints...').start();

  const pathsToTry = [
    '', // try exact URL first
    '/swagger.json',
    '/swagger/v1/swagger.json',
    '/openapi.json',
    '/api-docs',
    '/api/docs',
    '/api/swagger.json'
  ];

  for (const path of pathsToTry) {
    let checkUrl;
    try {
      if (path === '') {
        checkUrl = targetUrl;
      } else {
        checkUrl = `${targetUrl}${path}`;
      }
      
      spinner.text = `Checking ${checkUrl}...`;
      const res = await fetch(checkUrl, { 
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(3000) // 3 second timeout per check
      });
      
      if (res.ok) {
        const text = await res.text();
        let json;
        try {
          json = JSON.parse(text);
        } catch (e) {
          continue; // Not a JSON response
        }

        if (json.swagger || json.openapi || json.paths) {
          spinner.succeed(`Discovered API documentation at: ${chalk.green(checkUrl)}`);
          // Resolve host base url
          let baseHost = targetUrl;
          if (json.servers && json.servers[0] && json.servers[0].url) {
            const serverUrl = json.servers[0].url;
            if (serverUrl.startsWith('http')) {
              baseHost = serverUrl;
            } else {
              baseHost = `${targetUrl}${serverUrl}`;
            }
          } else if (json.schemes && json.host) {
            const scheme = json.schemes[0] || 'http';
            const basePath = json.basePath || '';
            baseHost = `${scheme}://${json.host}${basePath}`;
          }
          
          return { doc: json, baseUrl: baseHost };
        }
      }
    } catch (e) {
      // Continue to next path
    }
  }

  spinner.fail('Could not automatically discover API documentation. Please verify the URL or path.');
  return null;
}

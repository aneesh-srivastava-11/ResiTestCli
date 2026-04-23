import fs from 'fs';
import path from 'path';

/**
 * Halts execution for the specified number of milliseconds.
 * @param {number} ms - Milliseconds to sleep.
 */
export const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Checks if the URL hostname points to a local domain.
 * @param {string} urlStr - Target URL.
 * @returns {boolean} - true if strictly local.
 */
export function isLocalUrl(urlStr) {
  try {
    const { hostname } = new URL(urlStr);
    const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1', '0.0.0.0'];
    return LOCAL_HOSTS.includes(hostname);
  } catch (err) {
    return false; // Should not happen if validation passed, but safety first
  }
}

/**
 * Safely parses a JSON string, emitting a clear error log context if it fails.
 * @param {string} str - Raw JSON string.
 * @param {string} argName - CLI argument name (e.g., '--headers') for error context.
 * @returns {object|null} - Parsed JSON object, or null if empty string.
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
 * @param {number} ms 
 * @returns {string} e.g. "1.24s" or "340ms"
 */
export function formatDuration(ms) {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  return `${Math.round(ms)}ms`;
}

/**
 * Exports test metrics to a file (JSON or CSV based on extension).
 * @param {Object} summary - Test summary stats.
 * @param {Array} rawLatencies - Internal latencies array (or other series) if needed. 
 * @param {string} filePath - Target file path.
 */
export function exportResults(summary, rawData, filePath) {
  const fullPath = path.resolve(process.cwd(), filePath);
  const ext = path.extname(fullPath).toLowerCase();

  try {
    let outputContent = '';
    if (ext === '.csv') {
      outputContent = Object.keys(summary).join(',') + '\n' + Object.values(summary).join(',') + '\n';
      // In a real pro-tool we'd stream raw result arrays here, but for now we write summary.
    } else {
      // Default to JSON
      outputContent = JSON.stringify({ summary, raw: rawData }, null, 2);
    }

    fs.writeFileSync(fullPath, outputContent, 'utf-8');
    return true;
  } catch (err) {
    console.error(`\n❌ Failed to write export file: ${err.message}`);
    return false;
  }
}

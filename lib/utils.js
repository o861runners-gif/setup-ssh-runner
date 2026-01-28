/**
 * utils.js - Utility functions with retry logic and error handling
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');
const logger = require('./logger');
const { NetworkError } = require('./errors');

const isWindows = os.platform() === 'win32';
const isLinux = os.platform() === 'linux';
const isDarwin = os.platform() === 'darwin';

/**
 * Execute command and return output
 */
function runCapture(cmd, opts = {}) {
  try {
    return execSync(cmd, {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      ...opts,
    });
  } catch (_err) {
    return null;
  }
}

/**
 * Execute command with stdio inherit
 */
function run(cmd, opts = {}) {
  logger.command(cmd, opts.maskPatterns || []);
  try {
    return execSync(cmd, { stdio: 'inherit', ...opts });
  } catch (err) {
    if (opts.ignoreError) {
      logger.warn(`Command failed (ignored): ${cmd}`);
      return null;
    }
    throw err;
  }
}

/**
 * Check if command exists in PATH
 */
function commandExists(cmd) {
  const check = isWindows ? `where ${cmd}` : `command -v ${cmd}`;
  return !!runCapture(check);
}

/**
 * Execute command and check if it succeeds
 */
function execOk(cmd) {
  try {
    execSync(cmd, { stdio: 'ignore' });
    return true;
  } catch (_err) {
    return false;
  }
}

/**
 * Check if user has sudo without password
 */
function hasSudoNoPass() {
  if (!isLinux) return false;
  return execOk('sudo -n true');
}

/**
 * Check if current user is root (Linux)
 */
function isRootOnLinux() {
  return isLinux && typeof process.getuid === 'function' && process.getuid() === 0;
}

/**
 * Ensure directory exists with proper permissions
 */
function ensureDir(dirPath, mode = 0o700) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true, mode });
    logger.debug(`Created directory: ${dirPath}`);
  }
}

/**
 * Write file safely with proper permissions
 */
function writeFileSafe(filePath, content, mode = 0o600) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, { encoding: 'utf8', mode });
  logger.debug(`Written file: ${filePath}`);
}

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry function with exponential backoff
 */
async function retryWithBackoff(fn, options = {}) {
  const { maxRetries = 3, initialDelay = 1000, maxDelay = 10000, factor = 2, onRetry = null } = options;

  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (attempt === maxRetries - 1) break;

      const delay = Math.min(initialDelay * Math.pow(factor, attempt), maxDelay);

      if (onRetry) {
        onRetry(attempt + 1, maxRetries, delay, err);
      } else {
        logger.warn(`Attempt ${attempt + 1}/${maxRetries} failed, retrying in ${delay}ms...`, {
          error: err.message,
        });
      }

      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Wait for port to be listening on localhost
 */
async function waitPortLocalhost(port, timeoutMs = 8000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    // Try netcat first (most reliable)
    if (commandExists('nc')) {
      if (execOk(`nc -vz 127.0.0.1 ${port} 2>/dev/null`)) {
        return true;
      }
    }
    // Try ss (Linux)
    else if (commandExists('ss')) {
      const out = runCapture(`ss -lnt 2>/dev/null | grep ":${port} " || true`);
      if (out && out.trim()) {
        return true;
      }
    }
    // Try netstat (fallback)
    else if (commandExists('netstat')) {
      const out = runCapture(`netstat -lnt 2>/dev/null | grep ":${port} " || true`);
      if (out && out.trim()) {
        return true;
      }
    }

    await sleep(250);
  }

  return false;
}

/**
 * Spawn detached process with logging
 */
function spawnDetached(cmd, args, logFile = null) {
  logger.debug(`Spawning detached: ${cmd} ${args.join(' ')}`);

  let outFd = null;
  let errFd = null;

  if (logFile) {
    ensureDir(path.dirname(logFile));
    outFd = fs.openSync(logFile, 'a');
    errFd = fs.openSync(logFile, 'a');
  }

  const child = spawn(cmd, args, {
    detached: true,
    stdio: ['ignore', outFd ?? 'ignore', errFd ?? 'ignore'],
  });

  child.unref();

  // Close file descriptors
  try {
    if (typeof outFd === 'number') fs.closeSync(outFd);
  } catch (closeErr) {
    logger.debug(`Failed to close output fd: ${closeErr.message}`);
  }
  try {
    if (typeof errFd === 'number') fs.closeSync(errFd);
  } catch (closeErr) {
    logger.debug(`Failed to close error fd: ${closeErr.message}`);
  }

  logger.success(`Spawned process (PID: ${child.pid})`);
  return child.pid;
}

/**
 * Shell single quote escape
 */
function shSingleQuote(s) {
  return `'${String(s).replace(/'/g, "'\"'\"'")}'`;
}

/**
 * Sanitize string for use as identifier
 */
function sanitizeId(s, maxLen = 28) {
  const x = String(s || '')
    .toLowerCase()
    .replace(/[^\w.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '');

  const trimmed = x.slice(0, maxLen);
  return trimmed || 'ci';
}

/**
 * Sanitize URL (remove BOM, quotes, newlines)
 */
function sanitizeUrl(raw) {
  if (raw === null || raw === undefined) return '';

  let s = String(raw);

  // Remove BOM
  s = s.replace(/^\uFEFF/, '').trim();

  // Remove quotes
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim();
  }

  // Remove escaped newlines
  s = s.replace(/(\\r\\n|\\n|\\r)+$/g, '').trim();

  // Remove actual newlines
  s = s.replace(/[\r\n]+$/g, '');

  return s;
}

/**
 * Mask auth parameters in URL
 */
function maskAuthInUrl(url) {
  const s = String(url || '');
  if (!s) return s;
  return s.replace(/([?&]auth=)[^&#]*/gi, '$1****');
}

/**
 * Create timeout controller
 */
function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return {
    controller,
    clear: () => clearTimeout(timer),
  };
}

/**
 * Download file with retry
 */
async function downloadBinary(url, dest, options = {}) {
  const { maxRetries = 3, timeout = 30000 } = options;

  await retryWithBackoff(
    async () => {
      logger.progress(`Downloading ${path.basename(dest)}...`);

      if (commandExists('curl')) {
        run(`curl -fsSL --connect-timeout 10 --max-time ${Math.floor(timeout / 1000)} -o "${dest}" "${url}"`);
      } else if (commandExists('wget')) {
        run(`wget --timeout=${Math.floor(timeout / 1000)} -O "${dest}" "${url}"`);
      } else {
        throw new NetworkError('Neither curl nor wget available for download');
      }

      logger.progressDone();

      // Verify download
      if (!fs.existsSync(dest) || fs.statSync(dest).size === 0) {
        throw new Error('Downloaded file is empty or missing');
      }

      // Make executable
      if (!isWindows) {
        fs.chmodSync(dest, 0o755);
      }
    },
    {
      maxRetries,
      onRetry: (attempt, max, delay) => {
        logger.progressDone('Failed');
        logger.warn(`Download attempt ${attempt}/${max} failed, retrying in ${delay}ms...`);
      },
    }
  );
}

/**
 * Set secure file permissions
 */
function setSecurePermissions(filePath, type = 'default') {
  const permissions = {
    'ssh-key': 0o600,
    'ssh-dir': 0o700,
    config: 0o600,
    executable: 0o755,
    default: 0o600,
  };

  const mode = permissions[type] || permissions.default;

  if (!isWindows) {
    fs.chmodSync(filePath, mode);

    // Verify ownership
    const stats = fs.statSync(filePath);
    const uid = process.getuid();

    if (stats.uid !== uid) {
      logger.warn(`File ${filePath} is not owned by current user`);
    }
  }
}

module.exports = {
  isWindows,
  isLinux,
  isDarwin,
  run,
  runCapture,
  commandExists,
  execOk,
  hasSudoNoPass,
  isRootOnLinux,
  ensureDir,
  writeFileSafe,
  sleep,
  retryWithBackoff,
  waitPortLocalhost,
  spawnDetached,
  shSingleQuote,
  sanitizeId,
  sanitizeUrl,
  maskAuthInUrl,
  withTimeout,
  downloadBinary,
  setSecurePermissions,
};

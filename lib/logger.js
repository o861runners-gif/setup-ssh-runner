/**
 * logger.js - Structured logging with color support
 */

const util = require('util');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

const logLevels = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

class Logger {
  constructor(level = 'info', enableColors = true) {
    this.level = level;
    this.enableColors = enableColors && process.stdout.isTTY;
    this.levelValue = logLevels[level] || logLevels.info;
  }

  colorize(text, color) {
    if (!this.enableColors) return text;
    return `${colors[color]}${text}${colors.reset}`;
  }

  formatMessage(level, emoji, message, meta = {}) {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] ${emoji}`;
    
    let msg = `${prefix} ${message}`;
    
    if (Object.keys(meta).length > 0) {
      msg += '\n' + util.inspect(meta, { depth: 3, colors: this.enableColors });
    }
    
    return msg;
  }

  shouldLog(level) {
    return logLevels[level] >= this.levelValue;
  }

  debug(message, meta) {
    if (!this.shouldLog('debug')) return;
    const msg = this.formatMessage('debug', '🔍', message, meta);
    console.log(this.colorize(msg, 'dim'));
  }

  info(message, meta) {
    if (!this.shouldLog('info')) return;
    const msg = this.formatMessage('info', 'ℹ️ ', message, meta);
    console.log(this.colorize(msg, 'blue'));
  }

  success(message, meta) {
    if (!this.shouldLog('info')) return;
    const msg = this.formatMessage('success', '✅', message, meta);
    console.log(this.colorize(msg, 'green'));
  }

  warn(message, meta) {
    if (!this.shouldLog('warn')) return;
    const msg = this.formatMessage('warn', '⚠️ ', message, meta);
    console.warn(this.colorize(msg, 'yellow'));
  }

  error(message, meta) {
    if (!this.shouldLog('error')) return;
    const msg = this.formatMessage('error', '❌', message, meta);
    console.error(this.colorize(msg, 'red'));
  }

  // Special formatters
  progress(message) {
    if (!this.shouldLog('info')) return;
    process.stdout.write(this.colorize(`🔄 ${message}`, 'cyan'));
  }

  progressDone(message = 'Done') {
    if (!this.shouldLog('info')) return;
    console.log(this.colorize(` ${message}`, 'green'));
  }

  section(title) {
    if (!this.shouldLog('info')) return;
    const separator = '━'.repeat(60);
    console.log('\n' + this.colorize(separator, 'bright'));
    console.log(this.colorize(`📌 ${title}`, 'bright'));
    console.log(this.colorize(separator, 'bright') + '\n');
  }

  // Command logging with masking
  command(cmd, maskPatterns = []) {
    if (!this.shouldLog('debug')) return;
    
    let displayCmd = cmd;
    maskPatterns.forEach(pattern => {
      if (typeof pattern === 'string') {
        displayCmd = displayCmd.replace(new RegExp(pattern, 'g'), '****');
      } else if (pattern instanceof RegExp) {
        displayCmd = displayCmd.replace(pattern, '****');
      }
    });
    
    this.debug(`Executing: ${displayCmd}`);
  }

  // Table formatting
  table(data) {
    if (!this.shouldLog('info')) return;
    console.table(data);
  }
}

// Singleton instance
const logger = new Logger(
  process.env.LOG_LEVEL || 'info',
  process.env.NO_COLOR !== '1'
);

module.exports = logger;
module.exports.Logger = Logger;
module.exports.logLevels = logLevels;

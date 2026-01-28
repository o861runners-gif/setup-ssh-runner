/**
 * tunnels/base.js - Base class for tunnel implementations
 */

const logger = require('../logger');
const { TunnelError } = require('../errors');

/**
 * Base tunnel class - all tunnels must extend this
 */
class BaseTunnel {
  constructor(config, utils) {
    this.config = config;
    this.utils = utils;
    this.name = 'BaseTunnel';
    this.pid = null;
    this.endpoint = null;
    this.logFile = null;
  }

  /**
   * Check if tunnel is available (configured and can be used)
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    throw new Error(`${this.name}: isAvailable() not implemented`);
  }

  /**
   * Install tunnel binary if needed
   * @returns {Promise<boolean>} true if installed successfully
   */
  async install() {
    throw new Error(`${this.name}: install() not implemented`);
  }

  /**
   * Start the tunnel
   * @param {number} sshPort - SSH server port to tunnel
   * @param {string} logDir - Directory for log files
   * @returns {Promise<Object>} Result object with success, pid, endpoint, etc.
   */
  async start(sshPort, logDir) {
    throw new Error(`${this.name}: start() not implemented`);
  }

  /**
   * Get tunnel endpoint URL
   * @returns {Promise<string|null>}
   */
  async getEndpoint() {
    return this.endpoint;
  }

  /**
   * Get connect command for user
   * @returns {Promise<string|null>}
   */
  async getConnectCommand() {
    return null;
  }

  /**
   * Health check - verify tunnel is still working
   * @returns {Promise<Object>} { healthy: boolean, message: string }
   */
  async healthCheck() {
    if (!this.pid) {
      return { healthy: false, message: 'Not started' };
    }

    try {
      // Check if process still exists
      process.kill(this.pid, 0);
      return { healthy: true, message: 'Running' };
    } catch {
      return { healthy: false, message: 'Process not found' };
    }
  }

  /**
   * Stop tunnel
   * @returns {Promise<boolean>}
   */
  async stop() {
    if (!this.pid) {
      return false;
    }

    try {
      process.kill(this.pid, 'SIGTERM');
      logger.info(`${this.name} stopped (PID: ${this.pid})`);
      this.pid = null;
      return true;
    } catch (err) {
      logger.warn(`Failed to stop ${this.name}: ${err.message}`);
      return false;
    }
  }

  /**
   * Parse endpoint from log file
   * @param {RegExp} pattern - Regex pattern to match endpoint
   * @param {number} timeoutMs - Max time to wait
   * @returns {Promise<string|null>}
   */
  async parseEndpointFromLog(pattern, timeoutMs = 10000) {
    if (!this.logFile) {
      throw new TunnelError(this.name, 'No log file configured');
    }

    const fs = require('fs');
    const start = Date.now();

    while (Date.now() - start < timeoutMs) {
      try {
        if (fs.existsSync(this.logFile)) {
          const content = fs.readFileSync(this.logFile, 'utf8');
          const match = content.match(pattern);
          if (match) {
            return match[0];
          }
        }
      } catch (err) {
        logger.debug(`Error reading log file: ${err.message}`);
      }

      await this.utils.sleep(250);
    }

    return null;
  }

  /**
   * Build log messages for user
   */
  logInfo(message, meta = {}) {
    logger.info(`[${this.name}] ${message}`, meta);
  }

  logSuccess(message, meta = {}) {
    logger.success(`[${this.name}] ${message}`, meta);
  }

  logWarn(message, meta = {}) {
    logger.warn(`[${this.name}] ${message}`, meta);
  }

  logError(message, meta = {}) {
    logger.error(`[${this.name}] ${message}`, meta);
  }
}

module.exports = BaseTunnel;

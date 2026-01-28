/**
 * errors.js - Structured error classes for setup-ssh
 */

/**
 * Base error class for all setup-ssh errors
 */
class SetupSSHError extends Error {
  constructor(message, context = {}) {
    super(message);
    this.name = 'SetupSSHError';
    this.context = context;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      context: this.context,
      stack: this.stack,
    };
  }
}

/**
 * Error for configuration validation failures
 */
class ConfigError extends SetupSSHError {
  constructor(message, context = {}) {
    super(message, context);
    this.name = 'ConfigError';
  }
}

/**
 * Error for download operations
 */
class DownloadError extends SetupSSHError {
  constructor(url, cause, context = {}) {
    super(`Failed to download from ${url}`, { url, cause: cause?.message || String(cause), ...context });
    this.name = 'DownloadError';
    this.url = url;
    this.cause = cause;
  }
}

/**
 * Error for tunnel operations
 */
class TunnelError extends SetupSSHError {
  constructor(tunnelType, message, context = {}) {
    super(`${tunnelType} tunnel error: ${message}`, { tunnelType, ...context });
    this.name = 'TunnelError';
    this.tunnelType = tunnelType;
  }
}

/**
 * Error for SSHD operations
 */
class SSHDError extends SetupSSHError {
  constructor(message, context = {}) {
    super(`SSHD error: ${message}`, context);
    this.name = 'SSHDError';
  }
}

/**
 * Error for permission-related issues
 */
class PermissionError extends SetupSSHError {
  constructor(message, context = {}) {
    super(`Permission error: ${message}`, context);
    this.name = 'PermissionError';
  }
}

/**
 * Error for network operations
 */
class NetworkError extends SetupSSHError {
  constructor(message, context = {}) {
    super(`Network error: ${message}`, context);
    this.name = 'NetworkError';
  }
}

/**
 * Error for timeout operations
 */
class TimeoutError extends SetupSSHError {
  constructor(operation, timeoutMs, context = {}) {
    super(`Operation '${operation}' timed out after ${timeoutMs}ms`, { operation, timeoutMs, ...context });
    this.name = 'TimeoutError';
    this.operation = operation;
    this.timeoutMs = timeoutMs;
  }
}

module.exports = {
  SetupSSHError,
  ConfigError,
  DownloadError,
  TunnelError,
  SSHDError,
  PermissionError,
  NetworkError,
  TimeoutError,
};

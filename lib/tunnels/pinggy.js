/**
 * tunnels/pinggy.js - Pinggy tunnel implementation
 */

const path = require('path');
const fs = require('fs');
const BaseTunnel = require('./base');
const { TunnelError } = require('../errors');

class PinggyTunnel extends BaseTunnel {
  constructor(config, utils) {
    super(config, utils);
    this.name = 'Pinggy';
  }

  async isAvailable() {
    return this.config.tunnels.pinggy.enabled;
  }

  async install() {
    // Pinggy uses SSH client, no binary needed
    if (!this.utils.commandExists('ssh')) {
      throw new TunnelError(this.name, 'SSH client not found. Please install OpenSSH client.');
    }
    return true;
  }

  async start(sshPort, logDir) {
    const { pinggy } = this.config.tunnels;
    const targetHost = pinggy.targetHost || 'localhost';
    const targetPort = pinggy.targetPort || sshPort;
    const regionHost = pinggy.regionHost;
    const foreground = pinggy.foreground;

    this.logFile = path.join(logDir, 'pinggy.log');
    const pidFile = path.join(logDir, 'pinggy.pid');

    const args = [
      '-p',
      '443',
      '-o',
      'StrictHostKeyChecking=no',
      '-o',
      'UserKnownHostsFile=/dev/null',
      '-o',
      'BatchMode=yes',
      '-o',
      'ServerAliveInterval=30',
      '-o',
      'ServerAliveCountMax=3',
      '-o',
      'ExitOnForwardFailure=yes',
      `-R0:${targetHost}:${targetPort}`,
      `tcp@${regionHost}`,
    ];

    this.logInfo('Starting tunnel...');
    this.logInfo(`Target: ${targetHost}:${targetPort}`);
    this.logInfo('Expect endpoint like: tcp://*.pinggy.link:PORT');

    if (foreground) {
      const { spawn } = require('child_process');
      const child = spawn('ssh', args, { stdio: 'inherit' });
      child.on('exit', code => process.exit(code ?? 0));
      return { started: true, foreground: true };
    }

    this.pid = this.utils.spawnDetached('ssh', args, this.logFile);
    fs.writeFileSync(pidFile, String(this.pid), 'utf8');

    this.logSuccess(`Started in background (PID: ${this.pid})`);
    this.logInfo(`Log file: ${this.logFile}`);

    // Parse endpoint from log
    this.endpoint = await this.parseEndpointFromLog(/tcp:\/\/[^\s]+/, this.config.timeouts.tunnelStartup);

    if (this.endpoint) {
      this.logSuccess(`Endpoint: ${this.endpoint}`);
    } else {
      this.logWarn('Endpoint not detected yet. Check pinggy.log for the tcp:// URL');
    }

    return {
      started: true,
      foreground: false,
      pid: this.pid,
      endpoint: this.endpoint,
      logFile: this.logFile,
    };
  }

  async getConnectCommand() {
    if (!this.endpoint) return null;

    // Extract host and port from tcp://host:port
    const match = this.endpoint.match(/tcp:\/\/([^:]+):(\d+)/);
    if (!match) return null;

    const [, host, port] = match;
    const currentUser = require('os').userInfo().username;

    return `ssh -p ${port} ${currentUser}@${host} -i <your-private-key>`;
  }
}

module.exports = PinggyTunnel;

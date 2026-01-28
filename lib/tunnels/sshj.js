/**
 * tunnels/sshj.js - SSH-J.com tunnel implementation
 */

const path = require('path');
const fs = require('fs');
const BaseTunnel = require('./base');
const { TunnelError } = require('../errors');

class SshjTunnel extends BaseTunnel {
  constructor(config, utils, hostrunner) {
    super(config, utils);
    this.name = 'SSH-J';
    this.hostrunner = hostrunner;
  }

  async isAvailable() {
    return this.config.tunnels.sshj.enabled;
  }

  async install() {
    // SSH-J uses SSH client, no binary needed
    if (!this.utils.commandExists('ssh')) {
      throw new TunnelError(this.name, 'SSH client not found. Please install OpenSSH client.');
    }
    return true;
  }

  buildDefaults() {
    const repo = this.utils.sanitizeId(this.hostrunner.getRepoName(), 18);
    const rid = this.utils.sanitizeId(this.hostrunner.getRunnerId(), 10);
    const namespace = this.utils.sanitizeId(`${repo}-${rid}`, 28);
    const device = this.utils.sanitizeId(`${repo}-ci`, 24);
    return { repo, rid, namespace, device };
  }

  async start(sshPort, logDir) {
    const { sshj } = this.config.tunnels;
    const foreground = sshj.foreground;
    const sshjHost = sshj.host;

    const defaults = this.buildDefaults();

    const namespace = sshj.namespace || defaults.namespace;
    const device = sshj.device || defaults.device;
    const devicePort = sshj.devicePort;
    const localHost = sshj.localHost;
    const localPort = sshj.localPort || sshPort;

    this.logFile = path.join(logDir, 'sshj.log');
    const pidFile = path.join(logDir, 'sshj.pid');

    const publishArgs = [
      `${namespace}@${sshjHost}`,
      '-N',
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
      '-R',
      `${device}:${devicePort}:${localHost}:${localPort}`,
    ];

    this.logInfo('Starting tunnel...');
    this.logInfo(`Publishing: ${device}:${devicePort} → ${localHost}:${localPort}`);

    // Export variables for pipeline
    this.hostrunner.setPipelineVar('SSHJ_HOST', sshjHost);
    this.hostrunner.setPipelineVar('SSHJ_NAMESPACE', namespace);
    this.hostrunner.setPipelineVar('SSHJ_DEVICE', device);
    this.hostrunner.setPipelineVar('SSHJ_DEVICE_PORT', devicePort);

    if (foreground) {
      const { spawn } = require('child_process');
      const child = spawn('ssh', publishArgs, { stdio: 'inherit' });
      child.on('exit', code => process.exit(code ?? 0));
      return { started: true, foreground: true };
    }

    this.pid = this.utils.spawnDetached('ssh', publishArgs, this.logFile);
    fs.writeFileSync(pidFile, String(this.pid), 'utf8');

    this.logSuccess(`Started in background (PID: ${this.pid})`);
    this.logInfo(`Log file: ${this.logFile}`);

    const currentUser = require('os').userInfo().username;
    const connectCmd1 = `ssh -J ${namespace}@${sshjHost} ${currentUser}@${device}`;
    const connectCmd2 = `ssh -i <private-key> -J ${namespace}@${sshjHost} ${currentUser}@${device}`;

    this.logInfo('Connect from your PC:');
    this.logInfo(`  ${connectCmd1}`);
    this.logInfo(`  ${connectCmd2}`);

    this.hostrunner.setPipelineVar('SSHJ_CONNECT', connectCmd1);

    return {
      started: true,
      foreground: false,
      pid: this.pid,
      namespace,
      device,
      connectCommand: connectCmd1,
      logFile: this.logFile,
    };
  }

  async getConnectCommand() {
    const { sshj } = this.config.tunnels;
    const namespace = sshj.namespace;
    const device = sshj.device;
    const host = sshj.host;

    if (!namespace || !device) return null;

    const currentUser = require('os').userInfo().username;
    return `ssh -J ${namespace}@${host} ${currentUser}@${device}`;
  }
}

module.exports = SshjTunnel;

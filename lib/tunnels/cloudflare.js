/**
 * tunnels/cloudflare.js - Cloudflare Tunnel implementation
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const BaseTunnel = require('./base');
const { TunnelError } = require('../errors');

class CloudflareTunnel extends BaseTunnel {
  constructor(config, utils, hostrunner) {
    super(config, utils);
    this.name = 'Cloudflare';
    this.hostrunner = hostrunner;
  }

  async isAvailable() {
    return this.config.tunnels.cloudflare.enabled && !!this.config.tunnels.cloudflare.apiKey;
  }

  async install() {
    if (this.utils.commandExists('cloudflared')) {
      this.logInfo('cloudflared already installed');
      return true;
    }

    this.logInfo('Installing cloudflared...');

    if (this.utils.isLinux) {
      const url = this.config.downloads.cloudflared;
      const dest = this.config.paths.cloudflared;

      // Download
      await this.utils.downloadBinary(url, '/tmp/cloudflared', {
        timeout: this.config.timeouts.downloadTimeout,
      });

      // Install
      this.utils.run(`sudo install -m 755 /tmp/cloudflared ${dest}`, { ignoreError: false });
      this.utils.run('rm -f /tmp/cloudflared', { ignoreError: true });

      this.logSuccess('cloudflared installed successfully');
      return true;
    } else if (this.utils.isWindows) {
      this.logError('Auto-install on Windows not supported');
      this.logInfo('Download from: https://github.com/cloudflare/cloudflared/releases');
      return false;
    } else {
      throw new TunnelError(this.name, `Unsupported platform: ${this.utils.platform}`);
    }
  }

  async start(sshPort, logDir) {
    // Install if needed
    const installed = await this.install();
    if (!installed) {
      throw new TunnelError(this.name, 'Installation failed');
    }

    const { cloudflare } = this.config.tunnels;
    const apiKey = cloudflare.apiKey;
    const foreground = cloudflare.foreground;
    const targetHost = cloudflare.targetHost || 'localhost';
    const targetPort = cloudflare.targetPort || sshPort;

    // Generate tunnel name if not provided
    let tunnelName = cloudflare.tunnelName;
    if (!tunnelName) {
      const repo = this.utils.sanitizeId(this.hostrunner.getRepoName(), 18);
      const rid = this.utils.sanitizeId(this.hostrunner.getRunnerId(), 10);
      tunnelName = `${repo}-${rid}`;
    }

    this.logFile = path.join(logDir, 'cloudflared.log');
    const pidFile = path.join(logDir, 'cloudflared.pid');

    const cfDir = path.join(os.homedir(), '.cloudflared');
    this.utils.ensureDir(cfDir);

    const cfConfigPath = path.join(cfDir, 'config.yml');
    const certPath = path.join(cfDir, 'cert.pem');

    // Write service token as cert
    if (!fs.existsSync(certPath)) {
      this.logInfo('Setting up authentication...');
      fs.writeFileSync(certPath, apiKey, { encoding: 'utf8', mode: 0o600 });
    }

    // Check if tunnel exists
    this.logInfo(`Checking tunnel: ${tunnelName}`);
    let tunnelId = await this.findTunnelId(tunnelName);

    // Create tunnel if doesn't exist
    if (!tunnelId) {
      this.logInfo(`Creating tunnel: ${tunnelName}`);
      tunnelId = await this.createTunnel(tunnelName);
      if (!tunnelId) {
        throw new TunnelError(this.name, 'Failed to create tunnel');
      }
    }

    this.logSuccess(`Tunnel ID: ${tunnelId}`);

    // Create config.yml
    const template = this.config.templates.cloudflaredConfig || this.config.getDefaultCloudflaredTemplate();
    const cfConfig = this.config.renderTemplate(template, {
      TUNNEL_ID: tunnelId,
      TARGET_HOST: targetHost,
      TARGET_PORT: targetPort,
    });

    this.utils.writeFileSafe(cfConfigPath, cfConfig + '\n', 0o600);
    this.logInfo(`Config written: ${cfConfigPath}`);

    // Start tunnel
    this.logInfo('Starting tunnel...');

    const args = ['tunnel', '--config', cfConfigPath, 'run', '--token', apiKey];

    if (foreground) {
      const { spawn } = require('child_process');
      const child = spawn('cloudflared', args, { stdio: 'inherit' });
      child.on('exit', code => process.exit(code ?? 0));
      return { started: true, foreground: true };
    }

    this.pid = this.utils.spawnDetached('cloudflared', args, this.logFile);
    fs.writeFileSync(pidFile, String(this.pid), 'utf8');

    this.logSuccess(`Started in background (PID: ${this.pid})`);
    this.logInfo(`Log file: ${this.logFile}`);

    // Parse endpoint from log
    this.endpoint = await this.parseEndpointFromLog(
      /https:\/\/[a-f0-9-]+\.cfargotunnel\.com/i,
      this.config.timeouts.cfEndpoint
    );

    if (this.endpoint) {
      this.logSuccess(`Endpoint: ${this.endpoint}`);

      // Set pipeline variables
      this.hostrunner.setPipelineVar('CF_TUNNEL_URL', this.endpoint);
      
      const connectCmd = await this.getConnectCommand();
      if (connectCmd) {
        this.hostrunner.setPipelineVar('CF_SSH_COMMAND', connectCmd);
        this.logInfo('Connect command:');
        this.logInfo(`  ${connectCmd}`);
      }
    } else {
      this.logWarn('Endpoint not detected yet. Check cloudflared.log');
    }

    return {
      started: true,
      foreground: false,
      pid: this.pid,
      tunnelId,
      endpoint: this.endpoint,
      logFile: this.logFile,
    };
  }

  async findTunnelId(tunnelName) {
    try {
      const listOut = this.utils.runCapture('cloudflared tunnel list --output json 2>/dev/null || echo "[]"');
      const tunnels = JSON.parse(listOut || '[]');
      const existing = tunnels.find(t => t.name === tunnelName);
      return existing ? existing.id : null;
    } catch (err) {
      this.logWarn(`Failed to list tunnels: ${err.message}`);
      return null;
    }
  }

  async createTunnel(tunnelName) {
    try {
      const createOut = this.utils.runCapture(`cloudflared tunnel create ${tunnelName} 2>&1`);
      
      if (!createOut || createOut.includes('error')) {
        throw new Error(createOut || 'Unknown error');
      }

      // Extract tunnel ID
      const match = createOut.match(/Created tunnel .+ with id ([a-f0-9-]+)/i);
      if (match) {
        return match[1];
      }

      throw new Error('Could not extract tunnel ID');
    } catch (err) {
      throw new TunnelError(this.name, `Failed to create tunnel: ${err.message}`);
    }
  }

  async getConnectCommand() {
    if (!this.endpoint) return null;

    const currentUser = os.userInfo().username;
    return `ssh -o ProxyCommand="cloudflared access tcp --hostname ${this.endpoint}" ${currentUser}@${this.endpoint}`;
  }
}

module.exports = CloudflareTunnel;

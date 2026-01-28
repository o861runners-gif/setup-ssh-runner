/**
 * config.js - Configuration management for setup-ssh (Refactored)
 * Enhanced with validation, better defaults, and comprehensive ENV support
 */

const os = require('os');
const path = require('path');
const { ConfigError } = require('./errors');

class Config {
  constructor() {
    this.platform = os.platform();
    this.arch = os.arch();
    this.isWindows = this.platform === 'win32';
    this.isLinux = this.platform === 'linux';
    this.isDarwin = this.platform === 'darwin';

    this.init();
  }

  init() {
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 📥 DOWNLOAD URLs - Multi-platform support
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    this.downloads = {
      cloudflared: this.getCloudflaredUrl(),
      pinggy: process.env.PINGGY_DOWNLOAD_URL || 'https://pinggy.io/pinggy',
      sshj: this.getSshjUrl(),
    };

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 📂 PATHS - Binary installation paths
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    this.paths = {
      cloudflared: this.getCloudflaredPath(),
      pinggy: this.getPinggyPath(),
      sshj: this.getSshjPath(),
      sshd: this.getSshdPath(),
    };

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // ⏱️ TIMEOUTS - Configurable timeouts in milliseconds
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    this.timeouts = {
      portWait: parseInt(process.env.SSH_PORT_TIMEOUT || '8000', 10),
      cfEndpoint: parseInt(process.env.CF_ENDPOINT_TIMEOUT || '15000', 10),
      httpRequest: parseInt(process.env.HTTP_REQUEST_TIMEOUT || '8000', 10),
      tunnelStartup: parseInt(process.env.TUNNEL_STARTUP_TIMEOUT || '10000', 10),
      downloadTimeout: parseInt(process.env.DOWNLOAD_TIMEOUT || '30000', 10),
    };

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 📄 TEMPLATES - Config templates (support base64 encoding)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    this.templates = {
      sshdConfig: this.loadTemplate('SSHD_CONFIG_TEMPLATE'),
      cloudflaredConfig: this.loadTemplate('CLOUDFLARED_CONFIG_TEMPLATE'),
    };

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🔧 SSH Configuration
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    this.ssh = {
      port: process.env.SSH_PORT || '2222',
      mode: (process.env.SSH_MODE || 'auto').toLowerCase(),
      allowUsers: this.parseAllowUsers(process.env.SSH_ALLOW_USERS),
      defaultCwd: process.env.SSH_DEFAULT_CWD || null,
      disableForceCwd: process.env.SSH_DISABLE_FORCE_CWD === '1',
      listenAddress: process.env.SSH_LISTEN_ADDRESS || '127.0.0.1',
      publicKey: process.env.PIPELINE_SSH_PUBKEY || null,
    };

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🚇 Tunnel Configuration
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    this.tunnels = {
      pinggy: {
        enabled: process.env.PINGGY_ENABLE === '1',
        foreground: process.env.PINGGY_FOREGROUND === '1',
        targetHost: process.env.PINGGY_TARGET_HOST || 'localhost',
        targetPort: process.env.PINGGY_TARGET_PORT || null,
        regionHost: process.env.PINGGY_REGION_HOST || 'a.pinggy.io',
      },
      sshj: {
        enabled: process.env.SSHJ_ENABLE === '1',
        foreground: process.env.SSHJ_FOREGROUND === '1',
        host: process.env.SSHJ_HOST || 'ssh-j.com',
        namespace: process.env.SSHJ_NAMESPACE || null,
        device: process.env.SSHJ_DEVICE || null,
        devicePort: process.env.SSHJ_DEVICE_PORT || '22',
        localHost: process.env.SSHJ_LOCAL_HOST || 'localhost',
        localPort: process.env.SSHJ_LOCAL_PORT || null,
      },
      cloudflare: {
        enabled: process.env.CF_ENABLE === '1',
        foreground: process.env.CLOUDFLARED_FOREGROUND === '1',
        apiKey: process.env.CLOUDFLARED_APIKEY || null,
        tunnelName: process.env.CLOUDFLARED_TUNNEL_NAME || null,
        targetHost: process.env.CLOUDFLARED_TARGET_HOST || 'localhost',
        targetPort: process.env.CLOUDFLARED_TARGET_PORT || null,
      },
    };

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 💾 Persistence Configuration
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    this.persistence = {
      rtdb: {
        enabled: !!(process.env.ENV_SSH_URLS && process.env.ENV_SSH_URLS_ID),
        url: process.env.ENV_SSH_URLS || null,
        id: process.env.ENV_SSH_URLS_ID || null,
      },
      ntfy: {
        enabled: !!process.env.ENV_NTFY_TOPIC,
        topic: process.env.ENV_NTFY_TOPIC || null,
        url: process.env.NTFY_URL || 'https://ntfy.sh',
      },
    };

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 🔧 Other settings
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    this.maxTunnelNameLength = parseInt(process.env.MAX_TUNNEL_NAME_LENGTH || '28', 10);
    this.dryRun = process.env.DRY_RUN === '1';
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 🔧 Helper Methods
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  parseAllowUsers(value) {
    if (!value) return [];
    return value.split(/[,\s]+/).filter(Boolean);
  }

  getCloudflaredUrl() {
    if (process.env.CLOUDFLARED_DOWNLOAD_URL) {
      return process.env.CLOUDFLARED_DOWNLOAD_URL;
    }

    const baseUrl = 'https://github.com/cloudflare/cloudflared/releases/latest/download';

    const platformUrls = {
      'linux-x64': `${baseUrl}/cloudflared-linux-amd64`,
      'linux-arm64': `${baseUrl}/cloudflared-linux-arm64`,
      'linux-arm': `${baseUrl}/cloudflared-linux-arm`,
      'darwin-x64': `${baseUrl}/cloudflared-darwin-amd64.tgz`,
      'darwin-arm64': `${baseUrl}/cloudflared-darwin-amd64.tgz`,
      'win32-x64': `${baseUrl}/cloudflared-windows-amd64.exe`,
      'win32-ia32': `${baseUrl}/cloudflared-windows-386.exe`,
    };

    const key = `${this.platform}-${this.arch}`;
    const url = platformUrls[key];

    if (!url) {
      throw new ConfigError(`Unsupported platform for cloudflared: ${key}`);
    }

    return url;
  }

  getSshjUrl() {
    if (process.env.SSHJ_DOWNLOAD_URL) {
      return process.env.SSHJ_DOWNLOAD_URL;
    }

    const baseUrl = 'https://github.com/ssh-j/cli/releases/latest/download';

    const platformUrls = {
      linux: `${baseUrl}/sshj-linux`,
      darwin: `${baseUrl}/sshj-macos`,
      win32: `${baseUrl}/sshj-windows.exe`,
    };

    const url = platformUrls[this.platform];

    if (!url) {
      throw new ConfigError(`Unsupported platform for sshj: ${this.platform}`);
    }

    return url;
  }

  getCloudflaredPath() {
    if (process.env.CLOUDFLARED_PATH) {
      return process.env.CLOUDFLARED_PATH;
    }

    if (this.isWindows) {
      return path.join(os.homedir(), '.cloudflared', 'cloudflared.exe');
    }

    return '/usr/local/bin/cloudflared';
  }

  getPinggyPath() {
    if (process.env.PINGGY_PATH) {
      return process.env.PINGGY_PATH;
    }

    if (this.isWindows) {
      return path.join(os.homedir(), '.pinggy', 'pinggy.exe');
    }

    return '/usr/local/bin/pinggy';
  }

  getSshjPath() {
    if (process.env.SSHJ_PATH) {
      return process.env.SSHJ_PATH;
    }

    if (this.isWindows) {
      return path.join(os.homedir(), '.sshj', 'sshj.exe');
    }

    return '/usr/local/bin/sshj';
  }

  getSshdPath() {
    if (process.env.SSHD_PATH) {
      return process.env.SSHD_PATH;
    }

    const paths = {
      linux: '/usr/sbin/sshd',
      darwin: '/usr/sbin/sshd',
      win32: 'C:\\Windows\\System32\\OpenSSH\\sshd.exe',
    };

    return paths[this.platform] || '/usr/sbin/sshd';
  }

  loadTemplate(envVarName) {
    const envValue = process.env[envVarName];

    if (!envValue) {
      return null;
    }

    const base64Regex = /^[A-Za-z0-9+/]+=*$/;

    if (base64Regex.test(envValue.trim())) {
      try {
        const decoded = Buffer.from(envValue.trim(), 'base64').toString('utf8');

        if (decoded.includes('\n') || /^[ -~\n\r\t]+$/.test(decoded)) {
          return decoded;
        }
      } catch (err) {
        // Not valid base64, treat as raw text
      }
    }

    return envValue;
  }

  renderTemplate(template, vars) {
    let result = template;

    for (const [key, value] of Object.entries(vars)) {
      const regex = new RegExp(`{{${key}}}`, 'g');
      result = result.replace(regex, value);
    }

    return result;
  }

  getDefaultSshdTemplate() {
    return `# Auto-generated (USER-MODE) by setup-ssh.js
Port {{PORT}}
ListenAddress {{LISTEN_ADDRESS}}

PasswordAuthentication no
KbdInteractiveAuthentication no
ChallengeResponseAuthentication no
PubkeyAuthentication yes
PermitRootLogin no
UsePAM no
PrintMotd no
StrictModes no

AuthorizedKeysFile {{AUTHORIZED_KEYS_FILE}}
AllowUsers {{ALLOW_USERS}}

PidFile {{PID_FILE}}
HostKey {{HOSTKEY_ED25519}}
HostKey {{HOSTKEY_RSA}}

Subsystem sftp internal-sftp
LogLevel VERBOSE

{{FORCE_CWD_BLOCK}}`;
  }

  getDefaultCloudflaredTemplate() {
    return `tunnel: {{TUNNEL_ID}}

ingress:
  - service: tcp://{{TARGET_HOST}}:{{TARGET_PORT}}
  - service: http_status:404`;
  }

  validate() {
    const errors = [];

    // Required: SSH public key
    if (!this.ssh.publicKey) {
      errors.push('PIPELINE_SSH_PUBKEY is required');
    }

    // Validate SSH mode
    if (!['auto', 'root', 'user'].includes(this.ssh.mode)) {
      errors.push('SSH_MODE must be: auto, root, or user');
    }

    // Validate SSH port
    const port = parseInt(this.ssh.port, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      errors.push('SSH_PORT must be between 1-65535');
    }

    // Validate timeouts
    if (this.timeouts.portWait < 1000) {
      errors.push('SSH_PORT_TIMEOUT must be >= 1000ms');
    }

    if (this.timeouts.cfEndpoint < 5000) {
      errors.push('CF_ENDPOINT_TIMEOUT must be >= 5000ms');
    }

    // Validate tunnel configs
    if (this.tunnels.cloudflare.enabled && !this.tunnels.cloudflare.apiKey) {
      errors.push('CLOUDFLARED_APIKEY is required when CF_ENABLE=1');
    }

    // Validate persistence
    if (this.persistence.rtdb.enabled) {
      if (!this.persistence.rtdb.url || !this.persistence.rtdb.id) {
        errors.push('Both ENV_SSH_URLS and ENV_SSH_URLS_ID are required for RTDB persistence');
      }
    }

    if (errors.length > 0) {
      throw new ConfigError(`Configuration validation failed:\n${errors.map(e => `  - ${e}`).join('\n')}`);
    }
  }

  printSummary() {
    console.log('\n📋 Configuration Summary:');
    console.log('  Platform:', this.platform, this.arch);
    console.log('  SSH Port:', this.ssh.port);
    console.log('  SSH Mode:', this.ssh.mode);
    console.log('\n  Timeouts:');
    console.log('    Port Wait:', this.timeouts.portWait + 'ms');
    console.log('    CF Endpoint:', this.timeouts.cfEndpoint + 'ms');
    console.log('    HTTP Request:', this.timeouts.httpRequest + 'ms');
    console.log('\n  Tunnels:');
    console.log('    Pinggy:', this.tunnels.pinggy.enabled ? 'Enabled' : 'Disabled');
    console.log('    SSH-J:', this.tunnels.sshj.enabled ? 'Enabled' : 'Disabled');
    console.log('    Cloudflare:', this.tunnels.cloudflare.enabled ? 'Enabled' : 'Disabled');
    console.log('');
  }
}

module.exports = new Config();
module.exports.Config = Config;

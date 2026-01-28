/**
 * setup-ssh.js - SSH server setup for Linux and Windows
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const logger = require('./logger');
const utils = require('./utils');
const config = require('./config');
const { SSHDError, PermissionError } = require('./errors');

class SetupSSH {
  constructor() {
    this.HOME = os.homedir();
    this.CURRENT_USER = os.userInfo().username;
    
    this.PATHS = utils.isWindows
      ? {
          sshd_config: 'C:\\ProgramData\\ssh\\sshd_config',
          ssh_dir: path.join(this.HOME, '.ssh'),
          authorized_keys: path.join(this.HOME, '.ssh', 'authorized_keys'),
        }
      : {
          sshd_config: '/etc/ssh/sshd_config',
          ssh_dir: path.join(this.HOME, '.ssh'),
          authorized_keys: path.join(this.HOME, '.ssh', 'authorized_keys'),
        };
  }

  /**
   * Write authorized_keys file
   */
  writeAuthorizedKeys(pubkey) {
    if (!pubkey || !pubkey.trim()) {
      throw new SSHDError('PIPELINE_SSH_PUBKEY is required');
    }

    logger.section('Writing SSH Authorized Keys');

    utils.ensureDir(this.PATHS.ssh_dir, 0o700);

    // Parse and validate keys
    const keys = pubkey
      .split('\n')
      .map(k => k.trim())
      .filter(k => k && !k.startsWith('#'))
      .filter(k => k.startsWith('ssh-'));

    if (keys.length === 0) {
      throw new SSHDError('No valid SSH keys found in PIPELINE_SSH_PUBKEY');
    }

    logger.info(`Found ${keys.length} valid SSH key(s)`);

    // Add timestamp comment
    const timestamp = new Date().toISOString();
    const content = keys
      .map(k => `${k} # Added by setup-ssh at ${timestamp}`)
      .join('\n') + '\n';

    utils.writeFileSafe(this.PATHS.authorized_keys, content, 0o600);
    logger.success(`Authorized keys written: ${this.PATHS.authorized_keys}`);

    // Fix permissions on Linux
    if (utils.isLinux) {
      utils.run(`chmod 700 "${this.PATHS.ssh_dir}"`, { ignoreError: true });
      utils.run(`chmod 600 "${this.PATHS.authorized_keys}"`, { ignoreError: true });
      utils.run(`chown -R ${this.CURRENT_USER}:${this.CURRENT_USER} "${this.PATHS.ssh_dir}"`, {
        ignoreError: true,
      });
    }
  }

  /**
   * Setup SSH in Linux user mode (run sshd as user)
   */
  async linuxUserMode(sshPort, sshDefaultCwd, disableForceCwd) {
    logger.section('Setting up SSH (Linux User Mode)');

    // Check if sshd exists
    if (!utils.commandExists('sshd')) {
      logger.warn('sshd not found, attempting to install openssh-server...');
      
      if (utils.commandExists('apt-get')) {
        utils.run('sudo -n apt-get update', { ignoreError: true });
        utils.run('sudo -n apt-get install -y openssh-server', { ignoreError: true });
      } else if (utils.commandExists('yum')) {
        utils.run('sudo -n yum install -y openssh-server', { ignoreError: true });
      } else {
        throw new SSHDError('sshd not found and cannot auto-install');
      }
    }

    const baseDir = path.join(this.HOME, '.ssh', 'ci-sshd');
    const cfgPath = path.join(baseDir, 'sshd_config');
    const pidPath = path.join(baseDir, 'sshd.pid');
    const logPath = path.join(baseDir, 'sshd.log');
    const hostKeyEd = path.join(baseDir, 'ssh_host_ed25519_key');
    const hostKeyRsa = path.join(baseDir, 'ssh_host_rsa_key');

    utils.ensureDir(baseDir, 0o700);

    // Generate host keys
    if (!fs.existsSync(hostKeyEd)) {
      logger.info('Generating ED25519 host key...');
      utils.run(`ssh-keygen -t ed25519 -f "${hostKeyEd}" -N ""`);
    }

    if (!fs.existsSync(hostKeyRsa)) {
      logger.info('Generating RSA host key...');
      utils.run(`ssh-keygen -t rsa -b 2048 -f "${hostKeyRsa}" -N ""`);
    }

    // Fix permissions
    utils.run(`chmod 600 "${hostKeyEd}" "${hostKeyRsa}"`, { ignoreError: true });
    utils.run(`chmod 644 "${hostKeyEd}.pub" "${hostKeyRsa}.pub"`, { ignoreError: true });

    // Build ForceCommand block if needed
    const forceCwdBlock = disableForceCwd
      ? ''
      : `
Match User ${this.CURRENT_USER}
  ForceCommand /bin/bash -lc ${utils.shSingleQuote(
    `cd ${sshDefaultCwd} && if [ -n "$SSH_ORIGINAL_COMMAND" ]; then exec /bin/bash -lc "$SSH_ORIGINAL_COMMAND"; else exec /bin/bash -l; fi`
  )}
`.trim();

    // Get template and render
    const template = config.templates.sshdConfig || config.getDefaultSshdTemplate();
    const cfg = config.renderTemplate(template, {
      PORT: sshPort,
      LISTEN_ADDRESS: config.ssh.listenAddress,
      AUTHORIZED_KEYS_FILE: this.PATHS.authorized_keys,
      ALLOW_USERS: this.CURRENT_USER,
      PID_FILE: pidPath,
      HOSTKEY_ED25519: hostKeyEd,
      HOSTKEY_RSA: hostKeyRsa,
      FORCE_CWD_BLOCK: forceCwdBlock,
    });

    utils.writeFileSafe(cfgPath, cfg, 0o600);
    logger.success(`SSHD config written: ${cfgPath}`);

    // Start sshd
    logger.info('Starting SSHD in user mode...');
    const sshdPath = config.paths.sshd;
    const pid = utils.spawnDetached(sshdPath, ['-f', cfgPath, '-D'], logPath);

    fs.writeFileSync(pidPath, String(pid), 'utf8');
    logger.success(`SSHD started (PID: ${pid})`);
    logger.info(`Log file: ${logPath}`);

    // Wait for port to be ready
    logger.info(`Waiting for port ${sshPort} to be ready...`);
    const ready = await utils.waitPortLocalhost(sshPort, config.timeouts.portWait);

    if (!ready) {
      throw new SSHDError(`Port ${sshPort} is not listening after timeout`);
    }

    logger.success(`SSH server is ready on port ${sshPort}`);

    return {
      mode: 'user',
      baseDir,
      logPath,
      pid,
      port: sshPort,
    };
  }

  /**
   * Setup SSH in Linux root mode (use system sshd)
   */
  async linuxRootMode(sshPort, sshDefaultCwd, disableForceCwd, allowUsers) {
    logger.section('Setting up SSH (Linux Root Mode)');

    // Check permissions
    if (!utils.isRootOnLinux() && !utils.hasSudoNoPass()) {
      throw new PermissionError('Root mode requires root user or sudo without password');
    }

    // Backup original config
    const backupPath = this.PATHS.sshd_config + '.backup-' + Date.now();
    if (fs.existsSync(this.PATHS.sshd_config)) {
      utils.run(`sudo cp "${this.PATHS.sshd_config}" "${backupPath}"`, { ignoreError: true });
      logger.info(`Backed up config to: ${backupPath}`);
    }

    // Modify system sshd_config
    logger.info('Modifying system sshd_config...');
    
    const settings = [
      `Port ${sshPort}`,
      'PubkeyAuthentication yes',
      'PasswordAuthentication no',
      'PermitRootLogin ' + (this.CURRENT_USER === 'root' ? 'yes' : 'no'),
    ];

    if (allowUsers && allowUsers.length > 0) {
      settings.push(`AllowUsers ${allowUsers.join(' ')}`);
    }

    for (const setting of settings) {
      utils.run(`sudo sed -i 's/^#*${setting.split(' ')[0]}.*/${setting}/' "${this.PATHS.sshd_config}"`, {
        ignoreError: true,
      });
    }

    // Add ForceCommand if needed
    if (!disableForceCwd) {
      const forceCmd = `/bin/bash -lc ${utils.shSingleQuote(`cd ${sshDefaultCwd} && exec /bin/bash -l`)}`;
      utils.run(
        `echo "Match User ${this.CURRENT_USER}\n  ForceCommand ${forceCmd}" | sudo tee -a "${this.PATHS.sshd_config}"`,
        { ignoreError: true }
      );
    }

    // Restart sshd service
    logger.info('Restarting SSHD service...');
    utils.run('sudo systemctl restart sshd', { ignoreError: true });
    utils.run('sudo service sshd restart', { ignoreError: true });

    // Wait for port
    const ready = await utils.waitPortLocalhost(sshPort, config.timeouts.portWait);

    if (!ready) {
      throw new SSHDError(`Port ${sshPort} is not listening after restart`);
    }

    logger.success(`SSH server is ready on port ${sshPort}`);

    return {
      mode: 'root',
      port: sshPort,
    };
  }

  /**
   * Setup SSH on Windows
   */
  async windowsSetup(sshPort, allowUsers) {
    logger.section('Setting up SSH (Windows)');

    // Check if OpenSSH Server is installed
    if (!utils.commandExists('sshd')) {
      logger.info('Installing OpenSSH Server...');
      utils.run('powershell -Command "Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0"');
    }

    // Start and enable sshd service
    logger.info('Starting SSHD service...');
    utils.run('powershell -Command "Start-Service sshd"', { ignoreError: true });
    utils.run('powershell -Command "Set-Service -Name sshd -StartupType Automatic"', { ignoreError: true });

    // Configure sshd_config
    logger.info('Configuring SSHD...');
    const settings = [
      `Port ${sshPort}`,
      'PubkeyAuthentication yes',
      'PasswordAuthentication no',
    ];

    for (const setting of settings) {
      utils.run(
        `powershell -Command "(Get-Content '${this.PATHS.sshd_config}') -replace '^#*${setting.split(' ')[0]}.*', '${setting}' | Set-Content '${this.PATHS.sshd_config}'"`,
        { ignoreError: true }
      );
    }

    // Restart service
    logger.info('Restarting SSHD service...');
    utils.run('powershell -Command "Restart-Service sshd"');

    const ready = await utils.waitPortLocalhost(sshPort, config.timeouts.portWait);

    if (!ready) {
      throw new SSHDError(`Port ${sshPort} is not listening after restart`);
    }

    logger.success(`SSH server is ready on port ${sshPort}`);

    return {
      mode: 'windows',
      port: sshPort,
    };
  }

  /**
   * Main setup method - auto-detect mode
   */
  async setup() {
    const sshPort = config.ssh.port;
    const sshMode = config.ssh.mode;
    const sshDefaultCwd = config.ssh.defaultCwd || require('./hostrunner').detectDefaultCwd();
    const disableForceCwd = config.ssh.disableForceCwd;
    const allowUsers = config.ssh.allowUsers;

    // Write authorized keys first
    this.writeAuthorizedKeys(config.ssh.publicKey);

    // Setup based on platform and mode
    if (utils.isWindows) {
      return await this.windowsSetup(sshPort, allowUsers);
    } else if (utils.isLinux) {
      if (sshMode === 'root') {
        return await this.linuxRootMode(sshPort, sshDefaultCwd, disableForceCwd, allowUsers);
      } else {
        // Default to user mode
        return await this.linuxUserMode(sshPort, sshDefaultCwd, disableForceCwd);
      }
    } else {
      throw new SSHDError(`Unsupported platform: ${os.platform()}`);
    }
  }
}

module.exports = SetupSSH;

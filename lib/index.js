/**
 * index.js - Main orchestrator for setup-ssh
 */

const os = require('os');
const logger = require('./logger');
const config = require('./config');
const utils = require('./utils');
const hostrunner = require('./hostrunner');
const SetupSSH = require('./setup-ssh');
const PinggyTunnel = require('./tunnels/pinggy');
const SshjTunnel = require('./tunnels/sshj');
const CloudflareTunnel = require('./tunnels/cloudflare');
const persistence = require('./persistence');

/**
 * Print summary report
 */
function printSummary(sshResult, tunnelResults) {
  logger.section('Setup Summary');

  // SSH Server
  console.log('📌 SSH Server:');
  console.log(`   Status: ${sshResult.success ? '✅ Running' : '❌ Failed'}`);
  if (sshResult.success) {
    console.log(`   Mode: ${sshResult.mode}`);
    console.log(`   Port: ${sshResult.port}`);
    console.log(`   User: ${os.userInfo().username}`);
    if (sshResult.logPath) {
      console.log(`   Log: ${sshResult.logPath}`);
    }
  } else if (sshResult.error) {
    console.log(`   Error: ${sshResult.error}`);
  }

  // Tunnels
  console.log('\n🚇 Tunnels:');
  let tunnelCount = 0;
  
  for (const result of tunnelResults) {
    if (result.status === 'fulfilled' && result.value) {
      const data = result.value;
      tunnelCount++;
      
      console.log(`   ✅ ${data.tunnelType || 'Tunnel'}`);
      if (data.endpoint) {
        console.log(`      Endpoint: ${data.endpoint}`);
      }
      if (data.connectCommand) {
        console.log(`      Connect: ${data.connectCommand}`);
      }
    } else if (result.status === 'rejected') {
      console.log(`   ❌ ${result.reason?.tunnelType || 'Tunnel'}`);
      console.log(`      Error: ${result.reason?.message || 'Unknown error'}`);
    }
  }

  if (tunnelCount === 0) {
    console.log('   ℹ️  No tunnels configured');
  }

  // Connection Instructions
  if (sshResult.success) {
    console.log('\n🔗 Local Connection:');
    console.log(`   ssh -p ${sshResult.port} ${os.userInfo().username}@127.0.0.1 -i <your-private-key>`);
  }

  // Debug Info
  console.log('\n📋 Debug Info:');
  console.log(`   Platform: ${os.platform()} ${os.arch()}`);
  console.log(`   Node: ${process.version}`);
  console.log(`   CI: ${hostrunner.isLikelyCI() ? hostrunner.detectCIPlatform() : 'No'}`);
  console.log(`   CWD: ${process.cwd()}`);
  
  console.log('\n' + '═'.repeat(60) + '\n');
}

/**
 * Main setup function
 */
async function run(options = {}) {
  const startTime = Date.now();

  try {
    // Display banner
    console.log('\n' + '═'.repeat(60));
    console.log('🔐 SSH Tunnel Setup v2.0');
    console.log('═'.repeat(60) + '\n');

    // Merge options with config
    if (options.sshPort) config.ssh.port = options.sshPort;
    if (options.sshMode) config.ssh.mode = options.sshMode;
    if (options.publicKey) config.ssh.publicKey = options.publicKey;

    // Validate configuration
    logger.info('Validating configuration...');
    config.validate();
    logger.success('Configuration valid');

    if (process.env.DEBUG === '1') {
      config.printSummary();
    }

    // Initialize results
    const results = {
      ssh: { success: false, error: null },
      tunnels: [],
      persistence: { rtdb: false, ntfy: false },
    };

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 1. Setup SSH Server
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    try {
      const setupSSH = new SetupSSH();
      const sshResult = await setupSSH.setup();
      
      results.ssh = {
        success: true,
        mode: sshResult.mode,
        port: sshResult.port,
        logPath: sshResult.logPath,
        pid: sshResult.pid,
      };
    } catch (err) {
      logger.error('SSH setup failed:', { error: err.message });
      results.ssh.error = err.message;
      
      // Don't continue if SSH setup failed
      printSummary(results.ssh, results.tunnels);
      process.exit(1);
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 2. Setup Tunnels (in parallel)
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    logger.section('Starting Tunnels');

    const logDir = results.ssh.logPath 
      ? require('path').dirname(results.ssh.logPath)
      : require('path').join(os.homedir(), '.ssh');

    // Initialize tunnel instances
    const tunnels = [
      { instance: new PinggyTunnel(config, utils), type: 'Pinggy' },
      { instance: new SshjTunnel(config, utils, hostrunner), type: 'SSH-J' },
      { instance: new CloudflareTunnel(config, utils, hostrunner), type: 'Cloudflare' },
    ];

    // Start tunnels in parallel
    const tunnelPromises = tunnels.map(async ({ instance, type }) => {
      try {
        if (await instance.isAvailable()) {
          logger.info(`Starting ${type} tunnel...`);
          const result = await instance.start(results.ssh.port, logDir);
          
          return {
            tunnelType: type,
            success: true,
            endpoint: result.endpoint || null,
            connectCommand: await instance.getConnectCommand(),
            pid: result.pid,
            logFile: result.logFile,
          };
        } else {
          logger.debug(`${type} tunnel not configured`);
          return null;
        }
      } catch (err) {
        logger.error(`${type} tunnel failed:`, { error: err.message });
        return {
          tunnelType: type,
          success: false,
          error: err.message,
        };
      }
    });

    results.tunnels = await Promise.allSettled(tunnelPromises);

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 3. Persist & Notify
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    try {
      results.persistence = await persistence.persist(results.tunnels);
    } catch (err) {
      logger.error('Persistence failed:', { error: err.message });
    }

    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    // 4. Print Summary
    // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    printSummary(results.ssh, results.tunnels);

    const duration = Date.now() - startTime;
    logger.success(`Setup completed in ${duration}ms`);

    return results;
  } catch (err) {
    logger.error('Fatal error:', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

module.exports = {
  run,
  config,
  utils,
  logger,
  hostrunner,
  SetupSSH,
  PinggyTunnel,
  SshjTunnel,
  CloudflareTunnel,
};

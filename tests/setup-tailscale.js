#!/usr/bin/env node
/**
 * setup-tailscale.js
 * Join GitHub Actions runner vào Tailscale network
 * Input: TAILSCALE_CLIENT_ID, TAILSCALE_CLIENT_SECRET (OAuth)
 * Output: Tailscale IP, hostname exported ra pipeline vars
 */

const fs = require("fs");
const path = require("path");
const os = require("os");
const { execSync, spawn } = require("child_process");

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🧰 UTILS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const utils = (() => {
  const isWindows = os.platform() === "win32";
  const isLinux = os.platform() === "linux";
  const isMacOS = os.platform() === "darwin";

  function log(msg) {
    let maskedMsg = msg;

    // Danh sách giá trị phổ biến KHÔNG mask
    const skipValues = new Set(["true", "false", "TRUE", "FALSE", "null", "undefined", "NULL", "production", "development", "test", "staging"]);

    // Danh sách key patterns cần mask
    const sensitivePatterns = [
      "PASSWORD",
      "SECRET",
      "KEY",
      "TOKEN",
      "API",
      "CLIENT_ID",
      "CLIENT_SECRET",
      "AUTH",
      "OAUTH",
      "PRIVATE",
      "CREDENTIAL",
      "ACCESS",
      "PASSPHRASE",
    ];

    const envValues = Object.entries(process.env)
      .filter(([key, value]) => {
        if (!value || typeof value !== "string") return false;
        const trimmed = value.trim();

        // Bỏ qua giá trị quá ngắn (< 10 ký tự)
        if (trimmed.length < 6) return false;

        // Bỏ qua giá trị phổ biến
        if (skipValues.has(trimmed)) return false;

        // Bỏ qua số thuần túy
        if (/^\d+$/.test(trimmed)) return false;

        // Chỉ mask nếu key chứa pattern nhạy cảm
        const upperKey = key.toUpperCase();
        return sensitivePatterns.some((pattern) => upperKey.includes(pattern));
      })
      .map(([key, value]) => value.trim())
      .sort((a, b) => b.length - a.length);

    const uniqueValues = [...new Set(envValues)];

    for (const value of uniqueValues) {
      if (maskedMsg.includes(value)) {
        const masked = "*".repeat(value.length);
        maskedMsg = maskedMsg.split(value).join(masked);
      }
    }

    process.stdout.write(maskedMsg + "\n");
  }
  function run(cmd, opts = {}) {
    log(`🔧 ${cmd}`);
    try {
      return execSync(cmd, { stdio: "inherit", ...opts });
    } catch (err) {
      if (opts.ignoreError) {
        log(`⚠️  Command failed (ignored): ${cmd}`);
        return null;
      }
      throw err;
    }
  }

  function runCapture(cmd, opts = {}) {
    try {
      return execSync(cmd, {
        stdio: ["ignore", "pipe", "pipe"],
        encoding: "utf8",
        ...opts,
      }).trim();
    } catch {
      return null;
    }
  }

  function commandExists(cmd) {
    const check = isWindows ? `where ${cmd}` : `command -v ${cmd}`;
    return !!runCapture(check);
  }

  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function waitForCondition(checkFn, timeoutMs = 30000, intervalMs = 1000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (checkFn()) return true;
      await sleep(intervalMs);
    }
    return false;
  }

  return {
    isWindows,
    isLinux,
    isMacOS,
    log,
    run,
    runCapture,
    commandExists,
    sleep,
    waitForCondition,
  };
})();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🏃 HOSTRUNNER - Pipeline context
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const hostrunner = (() => {
  function setPipelineVar(name, value) {
    const v = String(value ?? "");

    // Azure DevOps
    if (process.env.TF_BUILD) {
      utils.log(`##vso[task.setvariable variable=${name}]${v}`);
    }

    // GitHub Actions
    if (process.env.GITHUB_ENV) {
      try {
        fs.appendFileSync(process.env.GITHUB_ENV, `${name}=${v}\n`);
      } catch {}
    }
  }

  function getRepoName() {
    const az = process.env.BUILD_REPOSITORY_NAME;
    if (az) return az;

    const gh = process.env.GITHUB_REPOSITORY;
    if (gh && gh.includes("/")) return gh.split("/").pop();

    return path.basename(process.cwd());
  }

  function getRunnerId() {
    return process.env.AGENT_ID || process.env.BUILD_BUILDID || process.env.GITHUB_RUN_ID || process.env.RUNNER_NAME || `ts-${Date.now()}`;
  }

  return {
    setPipelineVar,
    getRepoName,
    getRunnerId,
  };
})();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 🌐 TAILSCALE - Install, authenticate, connect
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const tailscale = (() => {
  function installTailscale() {
    if (utils.commandExists("tailscale")) {
      utils.log("✅ Tailscale already installed");
      const version = utils.runCapture("tailscale version");
      if (version) utils.log(`📌 Version: ${version.split("\n")[0]}`);
      return true;
    }

    utils.log("📦 Installing Tailscale...");

    if (utils.isLinux) {
      // Dùng install script chính thống
      utils.run("curl -fsSL https://tailscale.com/install.sh | sh", { ignoreError: false });

      // Start tailscaled service
      utils.run("sudo systemctl enable --now tailscaled", { ignoreError: true });

      utils.log("✅ Tailscale installed on Linux");
      return true;
    }

    if (utils.isMacOS) {
      utils.log("❌ macOS detected. Install via: brew install tailscale");
      return false;
    }

    if (utils.isWindows) {
      utils.log("❌ Windows detected. Download from: https://tailscale.com/download/windows");
      return false;
    }

    utils.log("❌ Unsupported OS for auto-install");
    return false;
  }

  function getTailscaleStatus() {
    const status = utils.runCapture("tailscale status --json");
    if (!status) return null;

    try {
      return JSON.parse(status);
    } catch {
      return null;
    }
  }

  function isLoggedIn() {
    const status = getTailscaleStatus();
    return status && status.BackendState === "Running";
  }

  function getTailscaleIP() {
    const status = getTailscaleStatus();
    if (!status || !status.Self) return null;

    // Lấy IPv4 đầu tiên
    const ipv4 = status.Self.TailscaleIPs?.find((ip) => !ip.includes(":"));
    return ipv4 || null;
  }

  function getHostname() {
    const status = getTailscaleStatus();
    if (!status || !status.Self) return null;
    return status.Self.DNSName?.replace(/\.$/, "") || null;
  }

  async function loginWithOAuth(clientId, clientSecret, tags) {
    utils.log("🔐 Logging in to Tailscale with OAuth client...");

    const tagStr = tags ? `--advertise-tags=${tags}` : "";

    const cmd = [
      "sudo",
      "tailscale",
      "up",
      `--client-id=${clientId}`,
      `--client-secret=${clientSecret}`,
      "--accept-routes",
      "--accept-dns=false",
      utils.isLinux === true ? "--ssh" : "",
      tagStr,
    ]
      .filter(Boolean)
      .join(" ");

    utils.run(cmd, { ignoreError: false });

    // Đợi kết nối
    utils.log("⏳ Waiting for Tailscale connection...");
    const connected = await utils.waitForCondition(() => isLoggedIn(), 30000, 2000);

    if (!connected) {
      utils.log("❌ Tailscale failed to connect after 30s");
      return false;
    }

    utils.log("✅ Tailscale connected successfully");
    return true;
  }

  function cleanup() {
    utils.log("🧹 Cleaning up Tailscale...");
    utils.run("sudo tailscale down", { ignoreError: true });
    utils.run("sudo tailscale logout", { ignoreError: true });
  }

  return {
    installTailscale,
    getTailscaleStatus,
    isLoggedIn,
    getTailscaleIP,
    getHostname,
    loginWithOAuth,
    cleanup,
  };
})();

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ▶️ MAIN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
(async () => {
  const TAILSCALE_CLIENT_ID = process.env.TAILSCALE_CLIENT_ID;
  const TAILSCALE_CLIENT_SECRET = process.env.TAILSCALE_CLIENT_SECRET;
  const TAILSCALE_TAGS = process.env.TAILSCALE_TAGS || "tag:ci";
  const TAILSCALE_ENABLE = String(process.env.TAILSCALE_ENABLE || "").trim() === "1";

  if (!TAILSCALE_ENABLE) {
    utils.log("ℹ️  TAILSCALE_ENABLE not set => skip");
    process.exit(0);
  }

  utils.log("🚀 Starting Tailscale setup...");
  utils.log(`📌 Platform: ${utils.isLinux ? "Linux" : utils.isMacOS ? "macOS" : utils.isWindows ? "Windows" : os.platform()}`);
  utils.log(`📌 Tags: ${TAILSCALE_TAGS}`);

  // ✅ Validate credentials
  if (!TAILSCALE_CLIENT_ID || !TAILSCALE_CLIENT_SECRET) {
    utils.log("❌ Missing TAILSCALE_CLIENT_ID or TAILSCALE_CLIENT_SECRET");
    utils.log("📚 Create OAuth client at: https://login.tailscale.com/admin/settings/oauth");
    process.exit(1);
  }

  // ✅ Install Tailscale
  const installed = tailscale.installTailscale();
  if (!installed) {
    utils.log("❌ Failed to install Tailscale");
    process.exit(1);
  }

  // ✅ Login with OAuth client credentials
  const connected = await tailscale.loginWithOAuth(TAILSCALE_CLIENT_ID, TAILSCALE_CLIENT_SECRET, TAILSCALE_TAGS);

  if (!connected) {
    utils.log("❌ Failed to connect to Tailscale network");
    process.exit(1);
  }

  // ✅ Get connection info
  const tailscaleIP = tailscale.getTailscaleIP();
  const hostname = tailscale.getHostname();

  if (tailscaleIP) {
    utils.log(`✅ Tailscale IP: ${tailscaleIP}`);
    hostrunner.setPipelineVar("TAILSCALE_IP", tailscaleIP);
  } else {
    utils.log("⚠️  Could not detect Tailscale IP");
  }

  if (hostname) {
    utils.log(`✅ Tailscale Hostname: ${hostname}`);
    hostrunner.setPipelineVar("TAILSCALE_HOSTNAME", hostname);
  }

  // ✅ Display status
  const status = tailscale.getTailscaleStatus();
  if (status) {
    utils.log("\n📊 Tailscale Status:");
    utils.log(`   Backend: ${status.BackendState}`);
    utils.log(`   Self: ${status.Self?.HostName || "N/A"}`);
    utils.log(`   IPs: ${status.Self?.TailscaleIPs?.join(", ") || "N/A"}`);

    if (status.Peer && Object.keys(status.Peer).length > 0) {
      utils.log(`   Peers: ${Object.keys(status.Peer).length} connected`);
    }
  }

  utils.log("\n✅ Tailscale setup completed!");
  utils.log("\n🧪 Test connection from your local machine:");
  if (tailscaleIP) {
    utils.log(`   ping ${tailscaleIP}`);
    utils.log(`   ssh <user>@${tailscaleIP}`);
  }
  if (hostname) {
    utils.log(`   ssh <user>@${hostname}`);
  }

  utils.log("\n🛑 To cleanup: tailscale down && tailscale logout");

  // ✅ Register cleanup on exit (best-effort)
  process.on("SIGINT", () => {
    tailscale.cleanup();
    process.exit(0);
  });

  process.on("SIGTERM", () => {
    tailscale.cleanup();
    process.exit(0);
  });
})();

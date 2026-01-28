/**
 * hostrunner.js - Detect CI/CD environment and runner context
 */

const fs = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * Check if running in CI environment
 */
function isLikelyCI() {
  return !!(
    process.env.CI ||
    process.env.GITHUB_ACTIONS ||
    process.env.TF_BUILD ||
    process.env.AGENT_ID ||
    process.env.BUILD_BUILDID
  );
}

/**
 * Detect default working directory based on CI environment
 * Priority order:
 * 1. SYSTEM_DEFAULTWORKINGDIRECTORY (Azure)
 * 2. BUILD_SOURCESDIRECTORY (Azure)
 * 3. BUILD_REPOSITORY_LOCALPATH (Azure)
 * 4. AGENT_BUILDDIRECTORY (Azure)
 * 5. GITHUB_WORKSPACE (GitHub)
 * 6. process.cwd() (fallback)
 */
function detectDefaultCwd() {
  const candidates = [
    process.env.SYSTEM_DEFAULTWORKINGDIRECTORY,
    process.env.BUILD_SOURCESDIRECTORY,
    process.env.BUILD_REPOSITORY_LOCALPATH,
    process.env.AGENT_BUILDDIRECTORY,
    process.env.GITHUB_WORKSPACE,
    process.cwd(),
  ].filter(Boolean);

  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) {
        logger.debug(`Detected default CWD: ${p}`);
        return p;
      }
    } catch (err) {
      logger.debug(`Failed to check path ${p}: ${err.message}`);
    }
  }

  const fallback = process.cwd();
  logger.debug(`Using fallback CWD: ${fallback}`);
  return fallback;
}

/**
 * Get repository name from CI environment
 */
function getRepoName() {
  // Azure Pipelines
  const az = process.env.BUILD_REPOSITORY_NAME;
  if (az) return az;

  // GitHub Actions
  const gh = process.env.GITHUB_REPOSITORY;
  if (gh && gh.includes('/')) {
    return gh.split('/').pop();
  }

  // Fallback to current directory name
  return path.basename(process.cwd());
}

/**
 * Get unique runner ID from CI environment
 */
function getRunnerId() {
  return (
    process.env.AGENT_ID ||
    process.env.BUILD_BUILDID ||
    process.env.BUILD_BUILDNUMBER ||
    process.env.GITHUB_RUN_ID ||
    process.env.GITHUB_RUN_NUMBER ||
    process.env.RUNNER_NAME ||
    Date.now().toString()
  );
}

/**
 * Set pipeline variable for Azure Pipelines or GitHub Actions
 * @param {string} name - Variable name
 * @param {string} value - Variable value
 */
function setPipelineVar(name, value) {
  const v = String(value ?? '');

  // Azure Pipelines
  if (process.env.TF_BUILD) {
    console.log(`##vso[task.setvariable variable=${name}]${v}`);
    logger.debug(`Set Azure pipeline variable: ${name}`);
  }

  // GitHub Actions
  if (process.env.GITHUB_ENV) {
    try {
      fs.appendFileSync(process.env.GITHUB_ENV, `${name}=${v}\n`);
      logger.debug(`Set GitHub Actions variable: ${name}`);
    } catch (err) {
      logger.warn(`Failed to set GitHub variable ${name}: ${err.message}`);
    }
  }
}

/**
 * Detect CI platform
 */
function detectCIPlatform() {
  if (process.env.GITHUB_ACTIONS) return 'github';
  if (process.env.TF_BUILD) return 'azure';
  if (process.env.CIRCLECI) return 'circleci';
  if (process.env.GITLAB_CI) return 'gitlab';
  if (process.env.JENKINS_URL) return 'jenkins';
  return 'unknown';
}

module.exports = {
  isLikelyCI,
  detectDefaultCwd,
  getRepoName,
  getRunnerId,
  setPipelineVar,
  detectCIPlatform,
};

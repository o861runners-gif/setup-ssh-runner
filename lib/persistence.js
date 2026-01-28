/**
 * persistence.js - Persist tunnel URLs to Firebase RTDB and notify via ntfy
 */

const logger = require('./logger');
const utils = require('./utils');
const config = require('./config');

/**
 * Build Firebase RTDB URL with ID path
 */
function buildRtdbUrl(base, id) {
  const b = String(base || '').trim();
  const i = encodeURIComponent(String(id || '').trim());
  
  if (!b || !i) return '';

  // Handle .json in URL
  if (b.includes('.json')) {
    const idx = b.indexOf('.json');
    const before = b.slice(0, idx);
    const after = b.slice(idx + 5);
    return `${before}/${i}.json${after}`;
  }

  return `${b}/${i}.json`;
}

/**
 * Save tunnel URLs to Firebase RTDB
 */
async function saveToRTDB(tunnelResults) {
  if (!config.persistence.rtdb.enabled) {
    logger.debug('RTDB persistence disabled');
    return false;
  }

  const { url, id } = config.persistence.rtdb;
  
  logger.info('Persisting tunnel URLs to Firebase RTDB...');

  const payload = {
    timestamp: new Date().toISOString(),
    user: require('os').userInfo().username,
  };

  // Extract endpoints from tunnel results
  for (const result of tunnelResults) {
    if (result.status === 'fulfilled' && result.value) {
      const data = result.value;
      
      if (data.endpoint) {
        const key = data.tunnelType || 'endpoint';
        payload[key] = data.endpoint;
      }
      
      if (data.connectCommand) {
        const key = (data.tunnelType || 'tunnel') + '_connect';
        payload[key] = data.connectCommand;
      }
    }
  }

  if (Object.keys(payload).length <= 2) {
    logger.warn('No tunnel endpoints to persist');
    return false;
  }

  const rtdbUrl = buildRtdbUrl(url, id);
  if (!rtdbUrl) {
    logger.error('Failed to build RTDB URL');
    return false;
  }

  try {
    if (typeof fetch !== 'function') {
      logger.error('fetch() not available (need Node 18+)');
      return false;
    }

    const { controller, clear } = utils.withTimeout(config.timeouts.httpRequest);

    const response = await fetch(rtdbUrl, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clear();

    if (!response.ok) {
      let errorText = '';
      try {
        errorText = await response.text();
      } catch {}
      
      logger.error(`RTDB request failed: HTTP ${response.status} ${response.statusText}`);
      if (errorText) {
        logger.debug(`Response: ${errorText.slice(0, 200)}`);
      }
      return false;
    }

    logger.success('Tunnel URLs saved to RTDB');
    return true;
  } catch (err) {
    const msg = err?.name === 'AbortError' 
      ? `Timeout after ${config.timeouts.httpRequest}ms`
      : err?.message || String(err);
    
    logger.error(`RTDB persist failed: ${msg}`);
    return false;
  }
}

/**
 * Send notification via ntfy.sh
 */
async function notifyViaLntfy(tunnelResults) {
  if (!config.persistence.ntfy.enabled) {
    logger.debug('ntfy notifications disabled');
    return false;
  }

  const { topic, url } = config.persistence.ntfy;

  logger.info('Sending notifications via ntfy...');

  // Build message
  const lines = ['🔐 SSH Tunnel URLs\n'];

  for (const result of tunnelResults) {
    if (result.status === 'fulfilled' && result.value) {
      const data = result.value;
      const name = data.tunnelType || 'Tunnel';
      
      if (data.endpoint) {
        lines.push(`${name}: ${data.endpoint}`);
      }
      
      if (data.connectCommand) {
        lines.push(`Connect: ${data.connectCommand}`);
      }
    }
  }

  if (lines.length <= 1) {
    logger.warn('No tunnel info to notify');
    return false;
  }

  const message = lines.join('\n');

  // Send via curl (most reliable cross-platform)
  if (!utils.commandExists('curl')) {
    logger.warn('curl not found, skipping ntfy notification');
    return false;
  }

  try {
    const ntfyUrl = `${url}/${encodeURIComponent(topic)}`;
    
    const { spawnSync } = require('child_process');
    const result = spawnSync('curl', [
      '-sS',
      '-X', 'POST',
      ntfyUrl,
      '-H', 'X-Title: SSH Tunnel Ready',
      '-H', 'X-Priority: 3',
      '-H', 'X-Tags: ssh,tunnel,ci',
      '-H', 'Content-Type: text/plain; charset=utf-8',
      '--data-binary', message,
    ], {
      stdio: 'pipe',
      timeout: config.timeouts.httpRequest,
    });

    if (result.status !== 0) {
      logger.error(`ntfy notification failed (exit ${result.status})`);
      return false;
    }

    logger.success('Notification sent via ntfy');
    return true;
  } catch (err) {
    logger.error(`ntfy notification error: ${err.message}`);
    return false;
  }
}

/**
 * Main persistence function
 */
async function persist(tunnelResults) {
  logger.section('Persisting Results');

  const results = {
    rtdb: false,
    ntfy: false,
  };

  // Save to RTDB
  try {
    results.rtdb = await saveToRTDB(tunnelResults);
  } catch (err) {
    logger.error(`RTDB error: ${err.message}`);
  }

  // Notify via ntfy
  try {
    results.ntfy = await notifyViaLntfy(tunnelResults);
  } catch (err) {
    logger.error(`ntfy error: ${err.message}`);
  }

  return results;
}

module.exports = {
  persist,
  saveToRTDB,
  notifyViaLntfy,
  buildRtdbUrl,
};

#!/usr/bin/env node

/**
 * setup-ssh CLI entry point
 */

const setupSsh = require('../lib/index');

(async () => {
  try {
    await setupSsh.run();
  } catch (err) {
    console.error('❌ Error:', err.message);
    if (process.env.DEBUG === '1') {
      console.error(err.stack);
    }
    process.exit(1);
  }
})();

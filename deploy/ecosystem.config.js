// pm2 config for Replyvoo (alternative to the systemd unit).
//   npm install -g pm2
//   pm2 start deploy/ecosystem.config.js
//   pm2 save && pm2 startup        # start again after a reboot
//   pm2 install pm2-logrotate      # rotate logs
//
// ONE instance only, in fork mode. Do NOT use cluster mode or instances > 1:
// - SQLite is a single file; several processes writing to it cause "database is locked" errors.
// - The rate limiter lives in memory, so each copy would have its own limits.
// - The scheduler (blasts, nudges, renewal emails, reports) runs inside the process,
//   so two copies would send every blast, nudge and email twice.
const path = require('node:path');

module.exports = {
  apps: [{
    name: 'replyvoo',
    cwd: path.join(__dirname, '..'),
    script: 'src/server.js',
    node_args: '--disable-warning=ExperimentalWarning',
    exec_mode: 'fork',
    instances: 1,
    autorestart: true,
    max_memory_restart: '600M',
    kill_timeout: 10000,
    time: true,
    env: {
      NODE_ENV: 'production',
      TZ: 'UTC'
    }
  }]
};

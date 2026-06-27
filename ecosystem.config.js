module.exports = {
  apps: [{
    name:         "falkon-api",
    script:       "./artifacts/api-server/dist/index.mjs",
    cwd:          "/opt/falkon",
    instances:    1,
    exec_mode:    "fork",
    watch:        false,
    max_memory_restart: "12G",
    error_file:   "/var/log/falkon/error.log",
    out_file:     "/var/log/falkon/out.log",
    log_date_format: "YYYY-MM-DD HH:mm:ss",
    restart_delay: 3000,
    max_restarts:  10,
    autorestart:   true,
    kill_timeout:  10000,
    listen_timeout: 8000,
  }]
};

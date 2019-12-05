const path = require('path');

module.exports = {
  development: {
    client: 'postgresql',
    connection: {
      host: 'localhost',
      user: 'postgres',
      password: 'password',
      port: '5432',
      database: 'ae_middleware_local',
    },
    pool: {
      min: 0,
      max: 10,
      idleTimeoutMillis: 500
    },
    migrations: {
      directory: path.join(__dirname, 'db', 'migrations'),
    },
    seeds: {
      directory: path.join(__dirname, 'db', 'seeds'),
    },
  },
};
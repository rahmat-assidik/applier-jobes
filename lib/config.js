var databaseOptions = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'applier_app',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'applier_jobes',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: 'utf8mb4'
};

module.exports = { databaseOptions };

export default () => ({
  port: parseInt(process.env.PORT, 10) || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendReturnUrl:
    process.env.FRONTEND_RETURN_URL ||
    'http://localhost:3000/api/payments/orders/{order_id}',
  
  cashfree: {
    appId: process.env.CASHFREE_APP_ID || '',
    secretKey: process.env.CASHFREE_SECRET_KEY || '',
    apiVersion: process.env.CASHFREE_API_VERSION || '2023-08-01',
    environment: (process.env.CASHFREE_ENVIRONMENT || 'SANDBOX').toUpperCase(),
    // Automatically enable mock simulation mode if mock mode is true OR credentials are not set
    mockMode:
      process.env.CASHFREE_MOCK_MODE === 'true' ||
      !process.env.CASHFREE_APP_ID ||
      process.env.CASHFREE_APP_ID.includes('YOUR_CASHFREE_APP_ID'),
    webhookSecret:
      process.env.CASHFREE_WEBHOOK_SECRET ||
      process.env.CASHFREE_SECRET_KEY ||
      'test_webhook_secret_key',
  },

  database: {
    type: process.env.DB_TYPE || 'postgres',
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'ums_cashfree_db',
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    sqliteDatabase: process.env.SQLITE_DB_PATH || './data/payments.sqlite',
  },
});

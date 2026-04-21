export const env = {
  JWT_SECRET: () => process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  DATABASE_URL: () => process.env.DATABASE_URL || '',
  NODE_ENV: () => process.env.NODE_ENV || 'development',
}

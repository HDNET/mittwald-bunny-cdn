import { cleanEnv, num, str } from 'envalid'

export const getEnvironmentVariables = () =>
  cleanEnv(process.env, {
    EXTENSION_ID: str(),
    EXTENSION_SECRET: str(),
    ENCRYPTION_MASTER_PASSWORD: str(),
    ENCRYPTION_SALT: str(),
    DATABASE_URL: str({ default: './data/sqlite.db' }),
    PORT: num({ default: 3000 }),
    ZROK_RESERVED_TOKEN: str({ default: undefined }),
  })

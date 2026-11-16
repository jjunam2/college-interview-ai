import type { User } from '../src/types';

export interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  ENTRY_CODE: string;
  BOOTSTRAP_ADMIN_EMAIL: string;
  SESSION_SECRET: string;
}

export interface AppVariables {
  user: User;
  sessionId: string;
  clientIp: string;
}

export interface AppHonoEnv {
  Bindings: Env;
  Variables: AppVariables;
}

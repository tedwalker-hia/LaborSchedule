import 'vitest';

declare module 'vitest' {
  export interface ProvidedContext {
    DATABASE_URL: string;
  }
}

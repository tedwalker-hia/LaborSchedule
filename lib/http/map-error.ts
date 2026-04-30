import { NextResponse } from 'next/server';
import logger from '@/lib/logger';

interface DomainError extends Error {
  statusHint: number;
}

function isDomainError(err: unknown): err is DomainError {
  return err instanceof Error && typeof (err as DomainError).statusHint === 'number';
}

export function mapErrorResponse(error: unknown, label: string): NextResponse {
  if (isDomainError(error)) {
    return NextResponse.json({ error: error.message }, { status: error.statusHint });
  }
  try {
    logger.error({ err: error }, label);
  } catch {
    console.error(label, error);
  }
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
}

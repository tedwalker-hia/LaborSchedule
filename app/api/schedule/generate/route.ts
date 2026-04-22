import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { makeGenerationService } from '@/lib/services/generation-service';
import { GenerateBodySchema } from '@/lib/schemas/schedule';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const parsed = GenerateBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
    }

    const svc = makeGenerationService();
    const result = await svc.generate(parsed.data);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Schedule generate error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const {
      usrSystemCompanyId,
      employeeCode,
      oldDeptName,
      oldPositionName,
      newDeptName,
      newPositionName,
    } = await request.json();

    if (!usrSystemCompanyId || !employeeCode) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const result = await prisma.laborSchedule.updateMany({
      where: {
        usrSystemCompanyId,
        employeeCode,
        deptName: oldDeptName || null,
        positionName: oldPositionName || null,
      },
      data: {
        deptName: newDeptName || null,
        positionName: newPositionName || null,
      },
    });

    return NextResponse.json({ updated: result.count });
  } catch (error) {
    console.error('Employee update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

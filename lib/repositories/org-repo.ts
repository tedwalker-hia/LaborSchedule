import { Prisma } from '@prisma/client';
import { prisma } from '../prisma';

export interface OrgHotel {
  hotelName: string;
  branchId: number | null;
  usrSystemCompanyId: string | null;
}

export class OrgRepo {
  constructor(private readonly db: Prisma.TransactionClient = prisma) {}

  async findTenants() {
    return this.db.laborSchedule.findMany({
      distinct: ['tenant'],
      where: { tenant: { not: '' } },
      select: { tenant: true },
    });
  }

  async findHotelsByTenant(tenant: string): Promise<OrgHotel[]> {
    const rows = await this.db.laborSchedule.groupBy({
      by: ['hotelName', 'branchId', 'usrSystemCompanyId'],
      where: { tenant },
    });
    return rows
      .filter(
        (r): r is typeof r & { hotelName: string } => r.hotelName !== null && r.hotelName !== '',
      )
      .map((r) => ({
        hotelName: r.hotelName,
        branchId: r.branchId,
        usrSystemCompanyId: r.usrSystemCompanyId,
      }));
  }

  async findHotelsByTenantAndNames(tenant: string, hotelNames: string[]): Promise<OrgHotel[]> {
    const rows = await this.db.laborSchedule.groupBy({
      by: ['hotelName', 'branchId', 'usrSystemCompanyId'],
      where: { tenant, hotelName: { in: hotelNames } },
    });
    return rows
      .filter(
        (r): r is typeof r & { hotelName: string } => r.hotelName !== null && r.hotelName !== '',
      )
      .map((r) => ({
        hotelName: r.hotelName,
        branchId: r.branchId,
        usrSystemCompanyId: r.usrSystemCompanyId,
      }));
  }

  async findDepts(params: { hotelName: string; usrSystemCompanyId: string }) {
    return this.db.laborSchedule.findMany({
      distinct: ['deptName'],
      where: {
        hotelName: params.hotelName,
        usrSystemCompanyId: params.usrSystemCompanyId,
        deptName: { not: '' },
      },
      select: { deptName: true },
    });
  }

  async findPositions(params: {
    hotelName: string;
    usrSystemCompanyId: string;
    deptName?: string;
  }) {
    const where: Prisma.LaborScheduleWhereInput = {
      hotelName: params.hotelName,
      usrSystemCompanyId: params.usrSystemCompanyId,
      positionName: { not: '' },
    };
    if (params.deptName !== undefined) {
      where.deptName = params.deptName;
    }
    return this.db.laborSchedule.findMany({
      distinct: ['positionName'],
      where,
      select: { positionName: true },
    });
  }
}

export function makeOrgRepo(db: Prisma.TransactionClient = prisma): OrgRepo {
  return new OrgRepo(db);
}

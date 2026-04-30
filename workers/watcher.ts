import chokidar from 'chokidar';
import fs from 'fs/promises';
import path from 'path';
import { z } from 'zod';
import logger from '../lib/logger';
import { parseWorkbook } from '../lib/excel/parser';
import { makeImportService, type ImportService } from '../lib/services/import-service';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  WORKER_COMPANY_ID: z.string().min(1, 'WORKER_COMPANY_ID is required'),
  WORKER_HOTEL: z.string().optional(),
  WORKER_BRANCH_ID: z.coerce.number().int().optional(),
  WORKER_TENANT: z.string().optional(),
  WATCH_DIR: z.string().default('./populateschedule'),
});

export type WorkerEnv = z.infer<typeof envSchema>;

export function loadEnv(): WorkerEnv {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid worker environment: ${issues}`);
  }
  return result.data;
}

export interface ProcessFileOpts {
  companyId: string;
  hotel?: string | null;
  branchId?: number | null;
  tenant?: string | null;
  watchDir: string;
}

export async function processXlsx(
  filePath: string,
  opts: ProcessFileOpts,
  svc: ImportService = makeImportService(),
): Promise<void> {
  const filename = path.basename(filePath);
  const errorsDir = path.join(opts.watchDir, 'imported', 'errors');

  try {
    logger.info({ file: filename }, 'Processing xlsx');

    const buffer = await fs.readFile(filePath);
    const { records } = await parseWorkbook(buffer);

    if (records.length > 0) {
      const parsedRows = records.map((r) => ({
        employeeCode: r.employeeCode,
        firstName: r.firstName || null,
        lastName: r.lastName || null,
        date: r.date,
        clockIn: r.clockIn || null,
        clockOut: r.clockOut || null,
        deptName: r.deptName || null,
        positionName: r.positionName || null,
      }));

      const result = await svc.commit(parsedRows, {
        usrSystemCompanyId: opts.companyId,
        hotel: opts.hotel ?? null,
        branchId: opts.branchId ?? null,
        tenant: opts.tenant ?? null,
        overwriteLocked: false,
        userId: null,
      });

      logger.info({ file: filename, ...result }, 'Import committed');
    } else {
      logger.warn({ file: filename }, 'Workbook has no records');
    }

    // Move to processed/<YYYY-MM-DD>/<filename> on success
    const dateStr = new Date().toISOString().split('T')[0]!;
    const processedDir = path.join(opts.watchDir, 'processed', dateStr);
    await fs.mkdir(processedDir, { recursive: true });
    await fs.rename(filePath, path.join(processedDir, filename));

    logger.info({ file: filename, dest: processedDir }, 'Moved to processed');
  } catch (err) {
    logger.error({ err, file: filename }, 'Import failed');

    await fs.mkdir(errorsDir, { recursive: true });

    const errDest = path.join(errorsDir, filename);
    try {
      await fs.rename(filePath, errDest);
    } catch (renameErr) {
      logger.error({ err: renameErr, file: filename }, 'Failed to move file to errors dir');
    }

    await fs.writeFile(
      path.join(errorsDir, `${filename}.error.json`),
      JSON.stringify(
        {
          file: filename,
          timestamp: new Date().toISOString(),
          error: err instanceof Error ? err.message : String(err),
        },
        null,
        2,
      ),
    );
  }
}

export async function main(): Promise<void> {
  const env = loadEnv();
  const watchDir = path.resolve(env.WATCH_DIR);

  await fs.mkdir(watchDir, { recursive: true });

  logger.info({ watchDir }, 'Watcher starting');

  const svc = makeImportService();
  const opts: ProcessFileOpts = {
    companyId: env.WORKER_COMPANY_ID,
    hotel: env.WORKER_HOTEL,
    branchId: env.WORKER_BRANCH_ID,
    tenant: env.WORKER_TENANT,
    watchDir,
  };

  // Serial processing: each file job chains onto the previous promise
  let currentJob = Promise.resolve();

  const watcher = chokidar.watch(path.join(watchDir, '*.xlsx'), {
    persistent: true,
    ignoreInitial: false,
    // usePolling required for Docker bind mounts on macOS/Windows filesystems
    usePolling: true,
    interval: 1000,
  });

  watcher.on('add', (filePath: string) => {
    logger.info({ file: path.basename(filePath) }, 'File detected');
    currentJob = currentJob.then(() => processXlsx(filePath, opts, svc)).catch(() => {});
  });

  watcher.on('error', (err: unknown) => {
    logger.error({ err }, 'Watcher error');
  });

  watcher.on('ready', () => {
    logger.info({ watchDir }, 'Watcher ready');
  });

  const shutdown = async () => {
    logger.info('Shutting down watcher');
    await watcher.close();
    process.exit(0);
  };

  process.on('SIGTERM', () => {
    void shutdown();
  });
  process.on('SIGINT', () => {
    void shutdown();
  });
}

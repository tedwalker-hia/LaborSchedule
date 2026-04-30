import { main } from './watcher';
import logger from '../lib/logger';

main().catch((err) => {
  logger.fatal({ err }, 'Fatal watcher error');
  process.exit(1);
});

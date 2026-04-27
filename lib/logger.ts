import pino from 'pino';

// In dev, pino-pretty's worker thread dies on Next.js hot reload, after which
// every logger call throws "the worker has exited" — masking the real error.
// Use the synchronous default destination instead.
const logger = pino();

export default logger;

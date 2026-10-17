/**
 * Booking confirmation queue.
 * Uses the same BullMQ + in-memory fallback as email, on its own queue so a WhatsApp
 * retry never blocks mail. Failed attempts are retried up to three times.
 */
const net = require('net');
const { Queue, Worker } = require('bullmq');
const { WHATSAPP_QUEUE_NAME, processWhatsAppJob } = require('../workers/whatsappWorker');
const { maskPhone } = require('../services/whatsappService');

let bullQueue = null;
let bullWorker = null;
let queueMode = 'UNDETERMINED';

const memoryQueue = [];
const RETRY_STEP_MS = 3000;
const MAX_ATTEMPTS = 3;

const processMemoryTask = async (task) => {
  task.attempts += 1;
  try {
    console.log(
      `[WhatsAppQueue] Processing job ${task.id} for booking ${task.job.bookingNumber || task.job.bookingId} ` +
      `(attempt ${task.attempts}/${task.maxAttempts})`
    );
    await processWhatsAppJob(task.job);
    console.log(`[WhatsAppQueue] Job ${task.id} completed.`);
  } catch (err) {
    if (task.attempts < task.maxAttempts) {
      const delayMs = task.attempts * RETRY_STEP_MS;
      task.nextRunAt = Date.now() + delayMs;
      memoryQueue.push(task);
      setTimeout(runMemoryQueueWorker, delayMs);
      console.warn(
        `[WhatsAppQueue] Job ${task.id} failed (attempt ${task.attempts}/${task.maxAttempts}). ` +
        `Retrying in ${delayMs / 1000}s. Reason: ${err.message}`
      );
    } else {
      console.error(
        `[WhatsAppQueue] Job ${task.id} permanently failed after ${task.attempts} attempts. Reason: ${err.message}`
      );
    }
  }
};

const runMemoryQueueWorker = async () => {
  const now = Date.now();
  const readyTasks = memoryQueue.filter((task) => task.nextRunAt <= now);
  readyTasks.forEach((task) => memoryQueue.splice(memoryQueue.indexOf(task), 1));
  await Promise.all(readyTasks.map(processMemoryTask));
};

const enqueueInMemory = (jobData) => {
  const task = {
    id: `wa_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    job: jobData,
    attempts: 0,
    maxAttempts: MAX_ATTEMPTS,
    nextRunAt: Date.now(),
  };
  memoryQueue.push(task);
  console.log(
    `[WhatsAppQueue] Job queued: id=${task.id}, booking=${jobData.bookingNumber || jobData.bookingId}, to=${maskPhone(jobData.to)}`
  );
  setImmediate(runMemoryQueueWorker);
};

const isRedisReachable = (host, port) => {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let responded = false;

    socket.setTimeout(800);
    socket.once('connect', () => {
      responded = true;
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      if (!responded) {
        socket.destroy();
        resolve(false);
      }
    });
    socket.once('error', () => {
      if (!responded) {
        socket.destroy();
        resolve(false);
      }
    });

    socket.connect(port, host);
  });
};

const initializeWhatsAppQueue = async () => {
  const redisHost = process.env.REDIS_HOST || '127.0.0.1';
  const redisPort = Number(process.env.REDIS_PORT) || 6379;

  const redisOnline = await isRedisReachable(redisHost, redisPort);
  if (redisOnline) {
    try {
      const connection = {
        host: redisHost,
        port: redisPort,
        password: process.env.REDIS_PASSWORD || undefined,
        maxRetriesPerRequest: null,
      };

      bullQueue = new Queue(WHATSAPP_QUEUE_NAME, {
        connection,
        defaultJobOptions: {
          attempts: MAX_ATTEMPTS,
          backoff: {
            type: 'exponential',
            delay: RETRY_STEP_MS,
          },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 5000 },
        },
      });

      bullWorker = new Worker(
        WHATSAPP_QUEUE_NAME,
        async (job) => {
          await processWhatsAppJob(job.data);
        },
        { connection, concurrency: 5 }
      );

      bullWorker.on('completed', (job) => {
        console.log(`[WhatsAppQueue] Job ${job.id} completed successfully`);
      });

      bullWorker.on('failed', (job, err) => {
        const attempts = job?.attemptsMade || 0;
        const max = job?.opts?.attempts || MAX_ATTEMPTS;
        if (attempts >= max) {
          console.error(`[WhatsAppQueue] Job ${job?.id} permanently failed after ${attempts} attempts: ${err.message}`);
          return;
        }
        console.warn(`[WhatsAppQueue] Job ${job?.id} failed (attempt ${attempts}/${max}): ${err.message}`);
      });

      queueMode = 'REDIS';
      console.log('[WhatsAppQueue] BullMQ + Redis queue engine initialized.');
      return queueMode;
    } catch (err) {
      console.warn(`[WhatsAppQueue] Redis initialization failed (${err.message}). Falling back to in-memory queue.`);
      queueMode = 'IN_MEMORY';
      return queueMode;
    }
  }

  queueMode = 'IN_MEMORY';
  console.log('[WhatsAppQueue] Redis is offline. Running in-memory retry queue.');
  return queueMode;
};

/**
 * Queue a confirmation built by whatsappService. Does not call the Cloud API itself.
 * @param {Object} jobData
 * @returns {Promise<void>}
 */
const queueWhatsApp = async (jobData) => {
  if (!jobData || !jobData.to) {
    console.warn('[WhatsAppQueue] Skipped queuing: no recipient.');
    return;
  }

  if (queueMode === 'UNDETERMINED') {
    await initializeWhatsAppQueue();
  }

  if (queueMode === 'REDIS' && bullQueue) {
    try {
      const job = await bullQueue.add(jobData.type || 'BOOKING_CONFIRMATION', jobData);
      console.log(
        `[WhatsAppQueue] BullMQ job queued: id=${job.id}, booking=${jobData.bookingNumber || jobData.bookingId}, to=${maskPhone(jobData.to)}`
      );
      return;
    } catch (redisErr) {
      console.warn(`[WhatsAppQueue] BullMQ add failed (${redisErr.message}), falling back to in-memory queue.`);
      queueMode = 'IN_MEMORY';
      enqueueInMemory(jobData);
      return;
    }
  }

  enqueueInMemory(jobData);
};

module.exports = {
  queueWhatsApp,
  initializeWhatsAppQueue,
};

/**
 * Transactional Email Queue Manager.
 * Supports BullMQ + Redis with automatic Resilient In-Memory Async fallback when Redis is offline.
 */
const net = require('net');
const { Queue, Worker } = require('bullmq');
const { EMAIL_QUEUE_NAME, processEmailJob } = require('../workers/emailWorker');
const { maskEmail } = require('../services/emailService');

let bullQueue = null;
let bullWorker = null;
let queueMode = 'UNDETERMINED'; // 'REDIS' | 'IN_MEMORY' | 'UNDETERMINED'

// =========================================================================
// IN-MEMORY RESILIENT ASYNC FALLBACK QUEUE (When Redis is offline)
// =========================================================================
const memoryQueue = [];
const RETRY_STEP_MS = 3000;

const processMemoryTask = async (task) => {
  task.attempts += 1;
  try {
    console.log(`[InMemoryQueue] Processing job ${task.id} (Type: ${task.job.type}, To: ${maskEmail(task.job.to)})`);
    await processEmailJob(task.job);
    console.log(`[InMemoryQueue] Job ${task.id} completed successfully (Type: ${task.job.type})`);
  } catch (err) {
    if (task.attempts < task.maxAttempts) {
      const delayMs = task.attempts * RETRY_STEP_MS;
      task.nextRunAt = Date.now() + delayMs;
      memoryQueue.push(task);
      setTimeout(runMemoryQueueWorker, delayMs);
      console.warn(`[InMemoryQueue] Job ${task.id} failed (Attempt ${task.attempts}/${task.maxAttempts}). Retrying in ${delayMs / 1000}s... Reason: ${err.message}`);
    } else {
      console.error(`[InMemoryQueue] Job ${task.id} PERMANENTLY failed after ${task.attempts} attempts. Reason: ${err.message}`);
    }
  }
};

// Ready jobs are taken off the queue first and sent in parallel, so one slow email never delays the others.
const runMemoryQueueWorker = async () => {
  const now = Date.now();
  const readyTasks = memoryQueue.filter((t) => t.nextRunAt <= now);
  readyTasks.forEach((task) => memoryQueue.splice(memoryQueue.indexOf(task), 1));
  await Promise.all(readyTasks.map(processMemoryTask));
};

const enqueueInMemory = (jobData) => {
  const task = {
    id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    job: jobData,
    attempts: 0,
    maxAttempts: 3,
    nextRunAt: Date.now(),
  };
  memoryQueue.push(task);
  console.log(`[InMemoryQueue] Job queued: id=${task.id}, type=${jobData.type}, to=${maskEmail(jobData.to)}`);
  setImmediate(runMemoryQueueWorker);
};

// =========================================================================
// REDIS REACHABILITY TEST
// =========================================================================
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

// =========================================================================
// INITIALIZE QUEUE SYSTEM
// =========================================================================
const initializeEmailQueue = async () => {
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

      bullQueue = new Queue(EMAIL_QUEUE_NAME, {
        connection,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 3000,
          },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 5000 },
        },
      });

      bullWorker = new Worker(
        EMAIL_QUEUE_NAME,
        async (job) => {
          await processEmailJob(job.data);
        },
        { connection, concurrency: 5 }
      );

      bullWorker.on('completed', (job) => {
        console.log(`[BullWorker] Job ${job.id} completed successfully`);
      });

      bullWorker.on('failed', (job, err) => {
        console.warn(`[BullWorker] Job ${job?.id} failed with error: ${err.message}`);
      });

      queueMode = 'REDIS';
      console.log('[EmailQueue] BullMQ + Redis queue engine initialized.');
      return queueMode;
    } catch (err) {
      console.warn(`[EmailQueue] Redis initialization failed (${err.message}). Falling back to in-memory queue.`);
      queueMode = 'IN_MEMORY';
      return queueMode;
    }
  }

  queueMode = 'IN_MEMORY';
  console.log('[EmailQueue] Redis is offline. Running Resilient In-Memory Async Queue mode.');
  return queueMode;
};

/**
 * High-Performance Non-Blocking Job Dispatcher
 * @param {string} type - e.g. 'HOTEL_REGISTERED'
 * @param {string} to - Recipient email
 * @param {Object} data - Email payload
 * @returns {Promise<void>}
 */
const queueEmail = async (type, to, data) => {
  const recipient = to ? to.trim() : '';
  if (!recipient) {
    console.warn('[EmailQueue] Skipped queuing: No recipient provided.');
    return;
  }

  const jobData = {
    type,
    to: recipient,
    data,
    createdAt: new Date().toISOString(),
  };

  if (queueMode === 'UNDETERMINED') {
    await initializeEmailQueue();
  }

  if (queueMode === 'REDIS' && bullQueue) {
    try {
      const job = await bullQueue.add(type, jobData);
      console.log(`[EmailQueue] BullMQ job queued: id=${job.id}, type=${type}, to=${maskEmail(recipient)}`);
      return;
    } catch (redisErr) {
      console.warn(`[EmailQueue] BullMQ add failed (${redisErr.message}), falling back to in-memory queue.`);
      queueMode = 'IN_MEMORY';
      enqueueInMemory(jobData);
      return;
    }
  }

  enqueueInMemory(jobData);
};

module.exports = {
  queueEmail,
  initializeEmailQueue,
};

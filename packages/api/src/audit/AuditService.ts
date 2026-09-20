import { createHash, createSign, generateKeyPairSync, createVerify, randomUUID } from 'crypto';
import * as fs from 'fs';
import path from 'path';
import pino from 'pino';

const logger = pino();
const runtimeDir = path.resolve(process.cwd(), '.runtime');
const keyFile = path.join(runtimeDir, 'audit-signing-key.json');

interface StoredSigningKey {
  keyId: string;
  privateKey: string;
  publicKey: string;
}

let _privateKey: string | undefined;
let _publicKey: string | undefined;
let _keyId: string | undefined;

const auditStorageFile = path.join(runtimeDir, 'audit-chains.json');
const receiptStorageFile = path.join(runtimeDir, 'audit-receipts.json');

async function readPersistedChains(): Promise<Record<string, any[]>> {
  try {
    fs.mkdirSync(runtimeDir, { recursive: true });
    if (!fs.existsSync(auditStorageFile)) return {};
    const raw = fs.readFileSync(auditStorageFile, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writePersistedChains(chains: Record<string, any[]>) {
  try {
    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.writeFileSync(auditStorageFile, JSON.stringify(chains, null, 2), 'utf8');
  } catch (e) {
    logger.warn({ err: e }, 'Failed to write persisted audit chains');
  }
}

async function readPersistedReceipts(): Promise<Record<string, any>> {
  try {
    fs.mkdirSync(runtimeDir, { recursive: true });
    if (!fs.existsSync(receiptStorageFile)) return {};
    const raw = fs.readFileSync(receiptStorageFile, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writePersistedReceipts(receipts: Record<string, any>) {
  try {
    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.writeFileSync(receiptStorageFile, JSON.stringify(receipts, null, 2), 'utf8');
  } catch (e) {
    logger.warn({ err: e }, 'Failed to write persisted receipts');
  }
}

function readStoredKey(): StoredSigningKey | undefined {
  try {
    fs.mkdirSync(runtimeDir, { recursive: true });
    const raw = fs.readFileSync(keyFile, 'utf8');
    return JSON.parse(raw) as StoredSigningKey;
  } catch {
    return undefined;
  }
}

function writeStoredKey(payload: StoredSigningKey) {
  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.writeFileSync(keyFile, JSON.stringify(payload, null, 2), 'utf8');
}

function ensureKeys() {
  if (_privateKey && _publicKey && _keyId) return;

  const stored = readStoredKey();
  if (stored) {
    _privateKey = stored.privateKey;
    _publicKey = stored.publicKey;
    _keyId = stored.keyId;
    return;
  }

  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  _privateKey = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
  _publicKey = publicKey.export({ type: 'spki', format: 'pem' }) as string;
  _keyId = `runtime-key-${Date.now()}`;
  writeStoredKey({ keyId: _keyId, privateKey: _privateKey, publicKey: _publicKey });
  logger.warn('Using persisted runtime signing key. For production, store this in a protected key vault or HSM.');
}

export interface AuditEvent {
  id: string;
  jobId: string;
  seq: number;
  nodeId?: string;
  eventType: string;
  parentHashes: string[];
  inputHash: string;
  outputHash: string;
  blockHash: string;
  createdAt: string;
  metadata?: any;
}

export interface ExecutionReceipt {
  id: string;
  jobId: string;
  rootHash: string;
  signature: string;
  keyId: string;
  verifierVersion: string;
  events: AuditEvent[];
  createdAt: string;
}

export class AuditService {
  private chains: Map<string, AuditEvent[]> = new Map();
  private receiptsCache: Map<string, ExecutionReceipt> = new Map();
  private prismaAvailable = false;
  private prisma: any = null;
  private pendingWrites: Promise<any>[] = [];

  constructor(private readonly loadPersisted = true) {
    if (!this.loadPersisted) return;

    // Initialize persisted chains from disk (survives restarts)
    try {
      const persisted = readPersistedChains();
      persisted.then((map) => {
        for (const [jobId, events] of Object.entries(map)) {
          this.chains.set(jobId, events as AuditEvent[]);
        }
      }).catch((e) => logger.warn({ err: e }, 'Failed to load persisted audit chains'));
    } catch (e) {
      logger.warn({ err: e }, 'Failed to initialize persisted chains');
    }

    // Load persisted receipts
    try {
      const persistedReceipts = readPersistedReceipts();
      persistedReceipts.then((map) => {
        for (const [jobId, r] of Object.entries(map)) {
          this.receiptsCache.set(jobId, r as ExecutionReceipt);
        }
      }).catch((e) => logger.warn({ err: e }, 'Failed to load persisted receipts'));
    } catch (e) {
      logger.warn({ err: e }, 'Failed to initialize persisted receipts');
    }

    // Try to initialize Prisma client if DATABASE_URL is set
    if (process.env.DATABASE_URL) {
      try {
        // Lazy import to avoid mandatory dependency at runtime
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { PrismaClient } = require('@prisma/client');
        this.prisma = new PrismaClient();
        this.prismaAvailable = true;
        // Kick off DB-backed load in background; explicit init() can be awaited by startup
        this.loadFromDb().catch((e: any) => logger.warn({ err: e }, 'Failed to load audit data from DB'));
      } catch (e) {
        logger.warn({ err: e }, 'Prisma client unavailable; falling back to file-backed audit persistence');
      }
    }
  }

  reset(): void {
    this.chains.clear();
    this.receiptsCache.clear();
    this.pendingWrites = [];
  }

  private async flushPendingWrites(): Promise<void> {
    if (this.pendingWrites.length === 0) return;
    const pending = this.pendingWrites;
    this.pendingWrites = [];
    await Promise.allSettled(pending);
  }

  private async ensurePrismaJob(jobId: string): Promise<boolean> {
    if (!this.prismaAvailable || !this.prisma) return false;

    try {
      const existing = await this.prisma.job.findUnique({ where: { id: jobId } });
      if (existing) return true;

      const userId = `audit-user-${jobId}`;
      const projectId = `audit-project-${jobId}`;

      await this.prisma.user.upsert({
        where: { id: userId },
        update: {},
        create: { id: userId, role: 'USER', status: 'ACTIVE' }
      });

      await this.prisma.project.upsert({
        where: { id: projectId },
        update: {},
        create: { id: projectId, name: `Audit Project ${jobId}`, policyProfile: 'DEFAULT' }
      });

      await this.prisma.job.create({
        data: {
          id: jobId,
          userId,
          projectId,
          workflowVersion: '1.0',
          status: 'QUEUED',
          request: { source: 'audit-service', jobId }
        }
      });
      return true;
    } catch (e) {
      logger.warn({ err: e, jobId }, 'Unable to ensure DB job exists for audit records');
      return false;
    }
  }

  // Load existing audit events and receipts from the DB into memory
  async loadFromDb() {
    if (!this.prismaAvailable) return;
    try {
      const events = await this.prisma.auditEvent.findMany({ orderBy: { seq: 'asc' } });
      const map: Record<string, AuditEvent[]> = {};
      for (const ev of events) {
        const a: AuditEvent = {
          id: ev.id,
          jobId: ev.jobId,
          seq: ev.seq,
          nodeId: ev.nodeId ?? undefined,
          eventType: ev.eventType ?? ev.event_type ?? 'EVENT',
          parentHashes: ev.parentHashes ?? [],
          inputHash: ev.inputHash,
          outputHash: ev.outputHash,
          blockHash: ev.blockHash,
          createdAt: ev.createdAt.toISOString(),
          metadata: ev.metadata ?? undefined
        };
        map[ev.jobId] = map[ev.jobId] ?? [];
        map[ev.jobId].push(a);
      }
      // Replace in-memory chains with DB-backed ones
      for (const [jobId, arr] of Object.entries(map)) {
        this.chains.set(jobId, arr);
      }

      const receipts = await this.prisma.executionReceipt.findMany();
      for (const r of receipts) {
        const rec: ExecutionReceipt = {
          id: r.id,
          jobId: r.jobId,
          rootHash: r.rootHash,
          signature: r.signature,
          keyId: r.keyId,
          verifierVersion: r.verifierVersion ?? '1.0.0',
          events: this.chains.get(r.jobId) ?? [],
          createdAt: r.createdAt ? r.createdAt.toISOString() : new Date().toISOString()
        };
        this.receiptsCache.set(r.jobId, rec);
      }
      logger.info({ jobs: this.chains.size, receipts: this.receiptsCache.size }, 'Loaded audit data from DB');
    } catch (e) {
      logger.warn({ err: e }, 'Error loading audit data from DB');
    }
  }

  emit(
    jobId: string,
    eventType: string,
    inputData: any,
    outputData: any,
    nodeId?: string,
    metadata?: any
  ): AuditEvent {
    ensureKeys();
    const chain = this.chains.get(jobId) ?? [];
    const seq = chain.length;
    const parentHashes = chain.length > 0 ? [chain[chain.length - 1].blockHash] : [];
    const inputHash = createHash('sha256').update(JSON.stringify(inputData)).digest('hex');
    const outputHash = createHash('sha256').update(JSON.stringify(outputData)).digest('hex');

    const blockPayload = JSON.stringify({ parentHashes, inputHash, outputHash, seq, jobId, eventType });
    const blockHash = createHash('sha256').update(blockPayload).digest('hex');

    const event: AuditEvent = {
      id: randomUUID(),
      jobId,
      seq,
      nodeId,
      eventType,
      parentHashes,
      inputHash,
      outputHash,
      blockHash,
      createdAt: new Date().toISOString(),
      metadata
    };

    chain.push(event);
    this.chains.set(jobId, chain);
    logger.info({ jobId, seq, eventType, blockHash }, 'Audit event emitted');

    // Persist to disk (best-effort)
    try {
      const mapObj: Record<string, AuditEvent[]> = {};
      for (const [k, v] of this.chains.entries()) mapObj[k] = v;
      void writePersistedChains(mapObj);
    } catch (e) {
      logger.warn({ err: e }, 'Failed to persist audit chains to disk');
    }

    // If Prisma available, persist event into DB
    if (this.prismaAvailable) {
      const auditWrite = (async () => {
        try {
          await this.ensurePrismaJob(event.jobId);
          await this.prisma.auditEvent.create({
            data: {
              id: event.id,
              jobId: event.jobId,
              seq: event.seq,
              parentHashes: event.parentHashes,
              inputHash: event.inputHash,
              outputHash: event.outputHash,
              blockHash: event.blockHash
            }
          });
        } catch (e) {
          logger.warn({ err: e, jobId: event.jobId }, 'Failed to write audit event to DB');
        }
      })();
      this.pendingWrites.push(auditWrite);
    }
    return event;
  }

  // Ensure pending writes are flushed and then create a persisted execution receipt
  async seal(jobId: string): Promise<ExecutionReceipt> {
    ensureKeys();
    const chain = this.chains.get(jobId);
    if (!chain || chain.length === 0) throw new Error(`PROVENANCE_ERROR: No audit chain for job ${jobId}`);

    const rootHash = chain[chain.length - 1].blockHash;
    const sign = createSign('SHA256');
    sign.update(rootHash);
    const signature = sign.sign(_privateKey!, 'base64');

    const receipt: ExecutionReceipt = {
      id: randomUUID(),
      jobId,
      rootHash,
      signature,
      keyId: _keyId!,
      verifierVersion: '1.0.0',
      events: chain,
      createdAt: new Date().toISOString()
    };

    // Persist: flush any pending event writes first
    try {
      await this.flushPendingWrites();
    } catch (e) {
      logger.warn({ err: e }, 'Error while flushing pending writes');
    }

    // Persist receipt to disk (best-effort)
    try {
      const receiptsObj: Record<string, any> = {};
      void readPersistedReceipts().then((existing) => {
        Object.assign(receiptsObj, existing);
        receiptsObj[jobId] = receipt;
        return writePersistedReceipts(receiptsObj);
      }).catch((e) => logger.warn({ err: e }, 'Failed to persist receipt to disk'));
    } catch (e) {
      logger.warn({ err: e }, 'Failed to persist receipt to disk');
    }

    // Persist receipt to DB if Prisma available (await to ensure durability)
    if (this.prismaAvailable) {
      try {
        await this.ensurePrismaJob(receipt.jobId);
        await this.prisma.executionReceipt.upsert({
          where: { jobId: receipt.jobId },
          update: {
            rootHash: receipt.rootHash,
            signature: receipt.signature,
            keyId: receipt.keyId,
            verifierVersion: receipt.verifierVersion
          },
          create: {
            id: receipt.id,
            jobId: receipt.jobId,
            rootHash: receipt.rootHash,
            signature: receipt.signature,
            keyId: receipt.keyId,
            verifierVersion: receipt.verifierVersion
          }
        });
      } catch (e) {
        logger.warn({ err: e }, 'Prisma write failed for receipt');
      }
    }

    // Cache receipt in-memory
    this.receiptsCache.set(jobId, receipt);
    logger.info({ jobId, rootHash, keyId: _keyId }, 'Execution receipt sealed');

    return receipt;
  }

  getChain(jobId: string): AuditEvent[] {
    return this.chains.get(jobId) ?? [];
  }

  verify(receipt: ExecutionReceipt): boolean {
    ensureKeys();
    if (!_publicKey) return false;

    try {
      const verifier = createVerify('SHA256');
      verifier.update(receipt.rootHash);
      const signatureValid = verifier.verify(_publicKey, receipt.signature, 'base64');
      if (!signatureValid) return false;
    } catch {
      return false;
    }

    let prevHash = '';
    for (const ev of receipt.events) {
      if (ev.seq > 0 && !ev.parentHashes.includes(prevHash)) return false;
      const blockPayload = JSON.stringify({
        parentHashes: ev.parentHashes,
        inputHash: ev.inputHash,
        outputHash: ev.outputHash,
        seq: ev.seq,
        jobId: ev.jobId,
        eventType: ev.eventType
      });
      const computed = createHash('sha256').update(blockPayload).digest('hex');
      if (computed !== ev.blockHash) return false;
      prevHash = ev.blockHash;
    }

    const finalHash = receipt.events.length > 0 ? receipt.events[receipt.events.length - 1].blockHash : '';
    return receipt.rootHash === finalHash;
  }
}

export const auditService = new AuditService();

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
    return event;
  }

  seal(jobId: string): ExecutionReceipt {
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

    logger.info({ jobId, rootHash, keyId: _keyId }, 'Execution receipt sealed');
    return receipt;
  }

  getChain(jobId: string): AuditEvent[] {
    return this.chains.get(jobId) ?? [];
  }

  verify(receipt: ExecutionReceipt): boolean {
    ensureKeys();
    if (!_publicKey) return false;

    const verify = createVerify('SHA256');
    verify.update(receipt.rootHash);
    verify.end();
    const signatureValid = verify.verify(_publicKey, receipt.signature, 'base64');
    if (!signatureValid) return false;

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
    return true;
  }
}

export const auditService = new AuditService();

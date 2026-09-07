import { createHash, createSign, generateKeyPairSync } from 'crypto';
import pino from 'pino';
import { randomUUID } from 'crypto';

const logger = pino();

// In production: load from a protected key store / HSM.
// For development: generate an in-memory keypair at startup.
let _privateKey: string;
let _publicKey: string;
let _keyId: string;

function ensureKeys() {
  if (!_privateKey) {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    _privateKey = privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    _publicKey = publicKey.export({ type: 'spki', format: 'pem' }) as string;
    _keyId = 'dev-ephemeral-key-' + Date.now();
    logger.warn('Using ephemeral in-memory signing key. For production, load from a protected key store.');
  }
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

    // Chain: blockHash = sha256(parentHashes + inputHash + outputHash + seq)
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

    // Sign root hash
    const sign = createSign('SHA256');
    sign.update(rootHash);
    const signature = sign.sign(_privateKey, 'base64');

    const receipt: ExecutionReceipt = {
      id: randomUUID(),
      jobId,
      rootHash,
      signature,
      keyId: _keyId,
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
    // Re-verify chain integrity
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

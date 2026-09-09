import { Capability, JobRequest } from '@sih2k26/core';
/**
 * CapabilitySelector analyzes a job request and selects appropriate capabilities
 * from the set that are actually implemented in this repository.
 *
 * IMPLEMENTED CAPABILITIES:
 * - GENERAL_REASONING: local model reasoning (Ollama)
 * - CODE_EXECUTION: docker-based sandboxed execution
 * - ASME_CALCULATION: deterministic engineering calculations
 * - POLICY_CHECK: security/policy enforcement
 * - SOP_RETRIEVAL: knowledge base retrieval (BM25)
 * - SIGNED_AUDIT: execution provenance and signing
 *
 * NOT FULLY IMPLEMENTED IN THIS BUILD:
 * - CODE_GENERATION: no code generation executor wired
 * - VISION_EXTRACTION: no vision model configured
 * - EMBEDDINGS: vector retrieval infrastructure not active
 * - DOCUMENT_GENERATION: limited artifact support
 */
export declare class CapabilitySelector {
    static selectCapabilities(request: JobRequest): Capability[];
    private static matchesPattern;
}

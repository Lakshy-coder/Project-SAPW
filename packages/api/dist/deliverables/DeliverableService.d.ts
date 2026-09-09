export type DeliverableType = 'DOCX' | 'XLSX' | 'PDF' | 'PPTX';
export interface ArtifactRecord {
    id: string;
    jobId: string;
    type: DeliverableType;
    filename: string;
    sha256: string;
    templateVersion: string;
    generatorVersion: string;
    executionId: string;
    createdAt: string;
    citationIds: string[];
    sizeBytes: number;
}
export declare class DeliverableService {
    private outDir;
    constructor();
    /** Generate a real DOCX file using docx package */
    generateReport(jobId: string, title: string, sections: {
        heading: string;
        body: string;
    }[], citations: {
        documentTitle: string;
        location: string;
        excerpt: string;
    }[], executionId: string): Promise<ArtifactRecord>;
    /** Generate a real XLSX file using xlsx package */
    generateWorkbook(jobId: string, title: string, rows: Record<string, any>[], executionId: string): Promise<ArtifactRecord>;
    getArtifact(id: string): ArtifactRecord | undefined;
    listArtifacts(jobId: string): ArtifactRecord[];
    verifyArtifact(id: string): {
        valid: boolean;
        expected: string;
        actual: string;
    };
    private buildReportText;
    private writeArtifact;
}
export declare const deliverableService: DeliverableService;

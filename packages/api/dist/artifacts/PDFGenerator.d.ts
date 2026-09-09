export interface PDFArtifact {
    id: string;
    jobId: string;
    type: 'REPORT' | 'CALCULATION_SHEET' | 'SUMMARY';
    filePath: string;
    sha256: string;
    createdAt: string;
    sizeBytes: number;
}
export declare class PDFGenerator {
    private outDir;
    constructor();
    /**
     * Generate a PDF report with sections and citations
     */
    generateReport(jobId: string, title: string, sections: {
        heading: string;
        body: string;
    }[], citations?: {
        documentTitle: string;
        location: string;
        excerpt: string;
    }[]): Promise<PDFArtifact>;
    /**
     * Generate a simple calculation sheet PDF
     */
    generateCalculationSheet(jobId: string, title: string, calculations: {
        parameter: string;
        value: number;
        unit: string;
    }[], result: {
        name: string;
        value: number;
        unit: string;
        status: string;
    }): Promise<PDFArtifact>;
    /**
     * Verify a generated PDF artifact
     */
    verifyArtifact(artifact: PDFArtifact): {
        valid: boolean;
        expected: string;
        actual: string;
    };
}
export declare const pdfGenerator: PDFGenerator;

export interface ParsedDocument {
    id: string;
    title: string;
    content: string;
    metadata: Record<string, any>;
    format: 'PDF' | 'DOCX' | 'XLSX' | 'TXT' | 'CSV';
    pageRefs?: {
        pageNum: number;
        text: string;
    }[];
}
export declare class DocumentParser {
    /**
     * Parse a file based on its extension
     */
    parseFile(filePath: string): Promise<ParsedDocument>;
    /**
     * Parse PDF file using pdf-parse
     */
    private parsePDF;
    /**
     * Parse DOCX file using mammoth
     */
    private parseDOCX;
    /**
     * Parse XLSX file - simple CSV-like extraction
     */
    private parseXLSX;
    /**
     * Parse TXT file
     */
    private parseTXT;
    /**
     * Parse CSV file
     */
    private parseCSV;
    /**
     * Check if a format is supported
     */
    isSupported(format: string): boolean;
    /**
     * Get list of supported formats
     */
    getSupportedFormats(): string[];
}
export declare const documentParser: DocumentParser;

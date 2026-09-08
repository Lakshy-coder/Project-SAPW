import * as pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
import * as fs from 'fs';
import * as path from 'path';
import pino from 'pino';

const logger = pino();

export interface ParsedDocument {
  id: string;
  title: string;
  content: string;
  metadata: Record<string, any>;
  format: 'PDF' | 'DOCX' | 'XLSX' | 'TXT' | 'CSV';
  pageRefs?: { pageNum: number; text: string }[];
}

export class DocumentParser {
  /**
   * Parse a file based on its extension
   */
  async parseFile(filePath: string): Promise<ParsedDocument> {
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);
    
    switch (ext) {
      case '.pdf':
        return this.parsePDF(filePath, fileName);
      case '.docx':
        return this.parseDOCX(filePath, fileName);
      case '.xlsx':
        return this.parseXLSX(filePath, fileName);
      case '.txt':
        return this.parseTXT(filePath, fileName);
      case '.csv':
        return this.parseCSV(filePath, fileName);
      default:
        throw new Error(`UNSUPPORTED_FORMAT: ${ext} is not supported`);
    }
  }

  /**
   * Parse PDF file using pdf-parse
   */
  private async parsePDF(filePath: string, fileName: string): Promise<ParsedDocument> {
    try {
      const dataBuffer = fs.readFileSync(filePath);
      const data: any = await (pdfParse as any)(dataBuffer);
      
      const pageRefs: { pageNum: number; text: string }[] = [];
      if (data.numpages > 0) {
        // Store reference to full text (pdf-parse doesn't support per-page extraction easily)
        pageRefs.push({ pageNum: 1, text: data.text });
      }
      
      return {
        id: `pdf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: fileName,
        content: data.text,
        metadata: {
          numpages: data.numpages,
          info: data.info,
          version: data.version,
          filePath
        },
        format: 'PDF',
        pageRefs
      };
    } catch (error: any) {
      logger.error({ error: error.message, filePath }, 'Failed to parse PDF');
      throw new Error(`PDF_PARSE_ERROR: ${error.message}`);
    }
  }

  /**
   * Parse DOCX file using mammoth
   */
  private async parseDOCX(filePath: string, fileName: string): Promise<ParsedDocument> {
    try {
      const result = await mammoth.extractRawText({ path: filePath });
      
      if (result.messages && result.messages.length > 0) {
        logger.warn({ messages: result.messages }, 'Warnings during DOCX parsing');
      }
      
      return {
        id: `docx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: fileName,
        content: result.value,
        metadata: {
          messages: result.messages,
          filePath
        },
        format: 'DOCX'
      };
    } catch (error: any) {
      logger.error({ error: error.message, filePath }, 'Failed to parse DOCX');
      throw new Error(`DOCX_PARSE_ERROR: ${error.message}`);
    }
  }

  /**
   * Parse XLSX file - simple CSV-like extraction
   */
  private async parseXLSX(filePath: string, fileName: string): Promise<ParsedDocument> {
    try {
      // For now, treat XLSX as requiring xlsx package
      // This is a simplified implementation
      const content = fs.readFileSync(filePath, 'utf8');
      
      return {
        id: `xlsx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: fileName,
        content: `[XLSX file - binary format requires xlsx package for full parsing]`,
        metadata: {
          filePath,
          note: 'Binary XLSX format - use xlsx package in deliverables for full parsing'
        },
        format: 'XLSX'
      };
    } catch (error: any) {
      logger.error({ error: error.message, filePath }, 'Failed to parse XLSX');
      throw new Error(`XLSX_PARSE_ERROR: ${error.message}`);
    }
  }

  /**
   * Parse TXT file
   */
  private async parseTXT(filePath: string, fileName: string): Promise<ParsedDocument> {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      
      return {
        id: `txt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: fileName,
        content,
        metadata: { filePath },
        format: 'TXT'
      };
    } catch (error: any) {
      logger.error({ error: error.message, filePath }, 'Failed to parse TXT');
      throw new Error(`TXT_PARSE_ERROR: ${error.message}`);
    }
  }

  /**
   * Parse CSV file
   */
  private async parseCSV(filePath: string, fileName: string): Promise<ParsedDocument> {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      
      return {
        id: `csv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        title: fileName,
        content,
        metadata: { filePath, delimiter: ',' },
        format: 'CSV'
      };
    } catch (error: any) {
      logger.error({ error: error.message, filePath }, 'Failed to parse CSV');
      throw new Error(`CSV_PARSE_ERROR: ${error.message}`);
    }
  }

  /**
   * Check if a format is supported
   */
  isSupported(format: string): boolean {
    const supported = ['PDF', 'DOCX', 'XLSX', 'TXT', 'CSV'];
    return supported.includes(format.toUpperCase());
  }

  /**
   * Get list of supported formats
   */
  getSupportedFormats(): string[] {
    return ['PDF', 'DOCX', 'XLSX', 'TXT', 'CSV'];
  }
}

export const documentParser = new DocumentParser();

"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.documentParser = exports.DocumentParser = void 0;
const pdfParse = __importStar(require("pdf-parse"));
const mammoth_1 = __importDefault(require("mammoth"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)();
class DocumentParser {
    /**
     * Parse a file based on its extension
     */
    async parseFile(filePath) {
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
    async parsePDF(filePath, fileName) {
        try {
            const dataBuffer = fs.readFileSync(filePath);
            const data = await pdfParse(dataBuffer);
            const pageRefs = [];
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
        }
        catch (error) {
            logger.error({ error: error.message, filePath }, 'Failed to parse PDF');
            throw new Error(`PDF_PARSE_ERROR: ${error.message}`);
        }
    }
    /**
     * Parse DOCX file using mammoth
     */
    async parseDOCX(filePath, fileName) {
        try {
            const result = await mammoth_1.default.extractRawText({ path: filePath });
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
        }
        catch (error) {
            logger.error({ error: error.message, filePath }, 'Failed to parse DOCX');
            throw new Error(`DOCX_PARSE_ERROR: ${error.message}`);
        }
    }
    /**
     * Parse XLSX file - simple CSV-like extraction
     */
    async parseXLSX(filePath, fileName) {
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
        }
        catch (error) {
            logger.error({ error: error.message, filePath }, 'Failed to parse XLSX');
            throw new Error(`XLSX_PARSE_ERROR: ${error.message}`);
        }
    }
    /**
     * Parse TXT file
     */
    async parseTXT(filePath, fileName) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            return {
                id: `txt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                title: fileName,
                content,
                metadata: { filePath },
                format: 'TXT'
            };
        }
        catch (error) {
            logger.error({ error: error.message, filePath }, 'Failed to parse TXT');
            throw new Error(`TXT_PARSE_ERROR: ${error.message}`);
        }
    }
    /**
     * Parse CSV file
     */
    async parseCSV(filePath, fileName) {
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            return {
                id: `csv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                title: fileName,
                content,
                metadata: { filePath, delimiter: ',' },
                format: 'CSV'
            };
        }
        catch (error) {
            logger.error({ error: error.message, filePath }, 'Failed to parse CSV');
            throw new Error(`CSV_PARSE_ERROR: ${error.message}`);
        }
    }
    /**
     * Check if a format is supported
     */
    isSupported(format) {
        const supported = ['PDF', 'DOCX', 'XLSX', 'TXT', 'CSV'];
        return supported.includes(format.toUpperCase());
    }
    /**
     * Get list of supported formats
     */
    getSupportedFormats() {
        return ['PDF', 'DOCX', 'XLSX', 'TXT', 'CSV'];
    }
}
exports.DocumentParser = DocumentParser;
exports.documentParser = new DocumentParser();

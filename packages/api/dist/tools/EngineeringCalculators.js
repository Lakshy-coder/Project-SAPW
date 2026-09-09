"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pipeThicknessCalc = void 0;
const zod_1 = require("zod");
const ToolRegistry_1 = require("./ToolRegistry");
// ─── ASME B31.3 Pipe Wall Thickness Calculator ─────────────────────────────
// Formula: t_min = (P * D) / (2 * (S * E + P * Y))
// Ref: ASME B31.3-2022 Section 304.1.2
const PipeThicknessInputSchema = zod_1.z.object({
    designPressureMPa: zod_1.z.number().positive(),
    outsideDiameterMM: zod_1.z.number().positive(),
    allowableStressMPa: zod_1.z.number().positive(),
    weldJointFactor: zod_1.z.number().min(0).max(1).default(1.0),
    yCoefficient: zod_1.z.number().min(0).max(1).default(0.4),
    measuredThicknessMM: zod_1.z.number().positive().optional()
});
const PipeThicknessOutputSchema = zod_1.z.object({
    minimumRequiredThicknessMM: zod_1.z.number(),
    measuredThicknessMM: zod_1.z.number().optional(),
    status: zod_1.z.enum(['PASS', 'FAIL', 'NOT_CHECKED']),
    formula: zod_1.z.string(),
    assumptions: zod_1.z.object({
        codeEdition: zod_1.z.string(),
        formulaId: zod_1.z.string(),
        units: zod_1.z.string()
    })
});
const pipeThicknessCalc = {
    id: 'asme-b31-3-pipe-thickness',
    version: '1.0.0',
    name: 'ASME B31.3 Pipe Wall Thickness',
    description: 'Calculates minimum required wall thickness per ASME B31.3-2022 §304.1.2',
    capabilityClass: 'ENGINEERING',
    riskLevel: 'HIGH',
    timeoutMs: 5000,
    inputSchema: PipeThicknessInputSchema,
    outputSchema: PipeThicknessOutputSchema,
    requiredPermissions: ['tools:engineering'],
    async execute(input) {
        const { designPressureMPa: P, outsideDiameterMM: D, allowableStressMPa: S, weldJointFactor: E, yCoefficient: Y, measuredThicknessMM } = input;
        const t_min = (P * D) / (2 * (S * E + P * Y));
        let status = 'NOT_CHECKED';
        if (measuredThicknessMM !== undefined) {
            status = measuredThicknessMM >= t_min ? 'PASS' : 'FAIL';
        }
        return {
            minimumRequiredThicknessMM: parseFloat(t_min.toFixed(4)),
            measuredThicknessMM,
            status,
            formula: `t_min = (P * D) / (2 * (S * E + P * Y)) = (${P} * ${D}) / (2 * (${S} * ${E} + ${P} * ${Y}))`,
            assumptions: {
                codeEdition: 'ASME B31.3-2022',
                formulaId: '304.1.2',
                units: 'MPa, mm'
            }
        };
    }
};
exports.pipeThicknessCalc = pipeThicknessCalc;
ToolRegistry_1.toolRegistry.register(pipeThicknessCalc);

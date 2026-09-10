import { z } from 'zod';
import { ToolDefinition, toolRegistry } from './ToolRegistry';

// ─── ASME B31.3 Pipe Wall Thickness Calculator ─────────────────────────────
// Formula: t_min = (P * D) / (2 * (S * E + P * Y))
// Ref: ASME B31.3-2022 Section 304.1.2

const PipeThicknessInputSchema = z.object({
  designPressureMPa: z.number().positive(),
  outsideDiameterMM: z.number().positive(),
  allowableStressMPa: z.number().positive(),
  weldJointFactor: z.number().min(0).max(1).default(1.0),
  yCoefficient: z.number().min(0).max(1).default(0.4),
  measuredThicknessMM: z.number().positive().optional()
});

const PipeThicknessOutputSchema = z.object({
  minimumRequiredThicknessMM: z.number(),
  measuredThicknessMM: z.number().optional(),
  status: z.enum(['PASS', 'FAIL', 'NOT_CHECKED']),
  formula: z.string(),
  assumptions: z.object({
    codeEdition: z.string(),
    formulaId: z.string(),
    units: z.string()
  })
});

const pipeThicknessCalc: ToolDefinition = {
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
    let status: 'PASS' | 'FAIL' | 'NOT_CHECKED' = 'NOT_CHECKED';
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

toolRegistry.register(pipeThicknessCalc);
export { pipeThicknessCalc };

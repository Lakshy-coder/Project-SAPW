import { describe, it, expect } from 'vitest';

// ASME B31.3 formula: t_min = (P * D) / (2 * (S * E + P * Y))
function calcMinThickness(P: number, D: number, S: number, E: number, Y: number): number {
  return (P * D) / (2 * (S * E + P * Y));
}

describe('ASME B31.3 Pipe Thickness Calculator', () => {
  it('produces correct minimum thickness for known reference case', () => {
    // P=12MPa, D=219.1mm, S=137.9MPa, E=1.0, Y=0.4
    const t = calcMinThickness(12, 219.1, 137.9, 1.0, 0.4);
    // Expected ~9.12mm (verified against manual calc)
    expect(t).toBeGreaterThan(9.0);
    expect(t).toBeLessThan(9.3);
  });

  it('PASS when measured >= minimum', () => {
    const t_min = calcMinThickness(12, 219.1, 137.9, 1.0, 0.4);
    const measured = 9.5;
    expect(measured >= t_min).toBe(true);
  });

  it('FAIL when measured < minimum', () => {
    const t_min = calcMinThickness(12, 219.1, 137.9, 1.0, 0.4);
    const measured = 8.0;
    expect(measured >= t_min).toBe(false);
  });

  it('boundary: zero pressure yields zero thickness', () => {
    const t = calcMinThickness(0, 219.1, 137.9, 1.0, 0.4);
    expect(t).toBe(0);
  });
});

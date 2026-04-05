import { describe, expect, it } from 'vitest';
import { estimateTokens } from '../../src/utils/tokens';

describe('estimateTokens', () => {
  it('returns zero for empty text', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('estimates tokens using a simple character heuristic', () => {
    expect(estimateTokens('test')).toBe(1);
    expect(estimateTokens('12345')).toBe(2);
    expect(estimateTokens('a'.repeat(11))).toBe(3);
  });
});

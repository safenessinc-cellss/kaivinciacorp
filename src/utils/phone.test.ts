import { describe, expect, it } from 'vitest';
import { formatPhoneE164 } from './phone';

describe('formatPhoneE164', () => {
  it('uses Mexico as the default country for ten-digit national numbers', () => {
    expect(formatPhoneE164('55 1234 5678')).toBe('+525512345678');
  });

  it('normalizes the legacy Mexican mobile prefix +52 1', () => {
    expect(formatPhoneE164('+52 1 55 1234 5678')).toBe('+525512345678');
  });

  it('preserves already international E.164 numbers', () => {
    expect(formatPhoneE164('+14155552671')).toBe('+14155552671');
  });

  it('supports US national numbers when US is explicitly selected', () => {
    expect(formatPhoneE164('(202) 555-0123', 'US')).toBe('+12025550123');
  });

  it('rejects malformed numbers', () => {
    expect(() => formatPhoneE164('123')).toThrow();
  });
});

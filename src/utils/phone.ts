export type PhoneDefaultCountry = 'MX' | 'US';

/**
 * Converts common Mexican/US national dial strings into E.164.
 * Mexican mobile legacy +52 1 NXX... is normalized to current +52 NXX...
 * If the input already starts with +, its international country code is preserved.
 */
export function formatPhoneE164(value: unknown, defaultCountry: PhoneDefaultCountry = 'MX'): string {
  const raw = String(value ?? '').trim();
  if (!raw) throw new Error('Escribe un número telefónico.');

  const digits = raw.replace(/\D/g, '');
  let normalized = '';

  if (digits.length === 13 && digits.startsWith('521')) {
    normalized = `+52${digits.slice(3)}`;
  } else if (raw.startsWith('+')) {
    normalized = `+${digits}`;
  } else if (digits.length === 12 && digits.startsWith('52')) {
    normalized = `+${digits}`;
  } else if (digits.length === 11 && digits.startsWith('1')) {
    normalized = `+${digits}`;
  } else if (digits.length === 10) {
    normalized = defaultCountry === 'MX' ? `+52${digits}` : `+1${digits}`;
  } else {
    throw new Error('Usa un número válido con código de país, por ejemplo +525512345678.');
  }

  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    throw new Error('El número no tiene un formato internacional válido.');
  }
  return normalized;
}

import type { BarcodeValidator } from './barcodeValidation';

/**
 * DEVELOPMENT-ONLY validator (mock mode).
 *
 * Accepts any non-empty, successfully decoded payload and keeps the original raw payload untouched.
 * It deliberately does NOT enforce a length or character set: the real label format is unconfirmed.
 * Records accepted here are tagged `validationMode: 'development'` and are never production data.
 */
export const developmentBarcodeValidator: BarcodeValidator = {
  mode: 'development',
  check(rawPayload) {
    const barcode = rawPayload.trim();
    if (barcode.length === 0) {
      return {
        ok: false,
        reason: 'empty',
        message: 'The code was empty or could not be read.',
        rawPayload,
      };
    }
    return { ok: true, barcode, rawPayload, mode: 'development' };
  },
};

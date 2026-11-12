import type { BarcodeValidator } from './barcodeValidation';
import { checkPayloadStructure } from './payloadChecks';

/**
 * DEVELOPMENT-ONLY validator (mock mode).
 *
 * Accepts any non-empty, safe decoded payload and keeps the original raw payload untouched.
 * It deliberately does NOT enforce a barcode length or character set: the real label format is unconfirmed.
 * Records accepted here are tagged `validationMode: 'development'` and are never production data.
 */
export const developmentBarcodeValidator: BarcodeValidator = {
  mode: 'development',
  check(rawPayload) {
    const result = checkPayloadStructure(rawPayload);
    if (!result.ok) {
      return { ok: false, reason: result.reason, message: result.message, rawPayload };
    }
    return { ok: true, barcode: result.barcode, rawPayload, mode: 'development' };
  },
};

import type { BarcodeValidator } from './barcodeValidation';
import { checkPayloadStructure } from './payloadChecks';

/**
 * LIVE-mode client validator.
 *
 * The Apps Script backend is the only authority on which validation mode applies (pilot or, later,
 * strict production) and on how the Battery Barcode is derived. This client-side check only rejects
 * obviously unusable input early (empty, control characters, oversized) so the operator gets instant
 * feedback; the server repeats every check. The result is tagged `development` (= "not production
 * validated by the client"); the server's own mode and UNVERIFIED status are what get stored.
 */
export const serverBarcodeValidator: BarcodeValidator = {
  mode: 'development',
  check(rawPayload) {
    const result = checkPayloadStructure(rawPayload);
    if (!result.ok) {
      return { ok: false, reason: result.reason, message: result.message, rawPayload };
    }
    return { ok: true, barcode: result.barcode, rawPayload, mode: 'development' };
  },
};

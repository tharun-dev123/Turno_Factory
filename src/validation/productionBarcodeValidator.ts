import type { BarcodeValidator } from './barcodeValidation';

/**
 * PRODUCTION validator - intentionally strict and NOT yet defined.
 *
 * Real rules (payload structure, length, characters, Battery Barcode extraction) will be added only after
 * actual decoded battery QR samples are received and verified. Until then every payload is rejected, so an
 * unverified payload can never become a production-validated registration.
 */
export const productionBarcodeValidator: BarcodeValidator = {
  mode: 'production',
  check(rawPayload) {
    return {
      ok: false,
      reason: 'production_rules_pending',
      message: 'Production barcode validation is not configured yet.',
      rawPayload,
    };
  },
};

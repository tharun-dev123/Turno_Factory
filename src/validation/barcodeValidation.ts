import { appConfig } from '@/config/appConfig';
import type { ValidationMode } from '@/models/cell';

import { developmentBarcodeValidator } from './developmentBarcodeValidator';
import { productionBarcodeValidator } from './productionBarcodeValidator';
import type { PayloadRejectReason } from './payloadChecks';
import { serverBarcodeValidator } from './serverBarcodeValidator';

/**
 * Barcode parsing + validation.
 *
 * Development validation (mock mode only) and production validation are separate units.
 * The real QR payload structure is still unconfirmed, so nothing here assumes a fixed length or format.
 */

export type BarcodeRejectReason = PayloadRejectReason | 'production_rules_pending';

export type BarcodeCheckResult =
  | {
      ok: true;
      /** Battery Barcode derived from the payload */
      barcode: string;
      /** Original decoded payload, unchanged */
      rawPayload: string;
      /** Which validator accepted it */
      mode: ValidationMode;
    }
  | {
      ok: false;
      reason: BarcodeRejectReason;
      message: string;
      rawPayload: string;
    };

export interface BarcodeValidator {
  readonly mode: ValidationMode;
  /** Parse the raw decoded payload into a Battery Barcode and validate it. */
  check(rawPayload: string): BarcodeCheckResult;
}

/** Resolve the validator for the current configuration. */
export function getBarcodeValidator(): BarcodeValidator {
  switch (appConfig.validationMode) {
    case 'development':
      // Development validation is only allowed while running on mock data.
      if (appConfig.dataMode !== 'mock') {
        throw new Error('Development barcode validation is only allowed in mock mode.');
      }
      return developmentBarcodeValidator;
    case 'server':
      // Live mode: the backend decides (pilot / production); the client only does early sanity checks.
      return serverBarcodeValidator;
    case 'production':
      return productionBarcodeValidator;
  }
}

/** Convenience wrapper used by the service layer. */
export function checkScanPayload(rawPayload: string): BarcodeCheckResult {
  return getBarcodeValidator().check(rawPayload);
}

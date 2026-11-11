import { developmentBarcodeValidator } from '../developmentBarcodeValidator';
import { productionBarcodeValidator } from '../productionBarcodeValidator';
import { checkScanPayload, getBarcodeValidator } from '../barcodeValidation';

describe('development barcode validator (mock mode)', () => {
  it('accepts any non-empty payload and preserves the raw payload', () => {
    const result = developmentBarcodeValidator.check('  ABC-123 \n');
    expect(result).toEqual({ ok: true, barcode: 'ABC-123', rawPayload: '  ABC-123 \n', mode: 'development' });
  });

  it('does not assume a fixed 24-character format', () => {
    expect(developmentBarcodeValidator.check('X').ok).toBe(true);
    expect(developmentBarcodeValidator.check('a'.repeat(80)).ok).toBe(true);
    expect(developmentBarcodeValidator.check('02KCBE516100CHG702022741').ok).toBe(true);
  });

  it('rejects empty and whitespace-only payloads', () => {
    for (const payload of ['', '   ', '\n\t']) {
      const result = developmentBarcodeValidator.check(payload);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('empty');
    }
  });
});

describe('production barcode validator (rules pending)', () => {
  it('rejects every payload until real rules are verified', () => {
    const result = productionBarcodeValidator.check('02KCBE516100CHG702022741');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('production_rules_pending');
  });
});

describe('validator selection', () => {
  it('uses the development validator while the app runs in mock mode', () => {
    expect(getBarcodeValidator().mode).toBe('development');
    expect(checkScanPayload('anything')).toMatchObject({ ok: true, mode: 'development' });
  });
});

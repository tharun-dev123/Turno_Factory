import { developmentBarcodeValidator } from '../developmentBarcodeValidator';
import { serverBarcodeValidator } from '../serverBarcodeValidator';
import { checkPayloadStructure, MAX_PAYLOAD_LENGTH } from '../payloadChecks';
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

describe('payload structure checks (shared by development and live modes)', () => {
  it('rejects control characters and oversized payloads, and accepts everything else', () => {
    expect(checkPayloadStructure('AB\u0000C')).toMatchObject({ ok: false, reason: 'control_characters' });
    expect(checkPayloadStructure('A\nB')).toMatchObject({ ok: false, reason: 'control_characters' });
    expect(checkPayloadStructure('x'.repeat(MAX_PAYLOAD_LENGTH + 1))).toMatchObject({ ok: false, reason: 'too_long' });
    expect(checkPayloadStructure('  ')).toMatchObject({ ok: false, reason: 'empty' });
    expect(checkPayloadStructure('  edge newline allowed\n')).toEqual({ ok: true, barcode: 'edge newline allowed' });
    expect(checkPayloadStructure('x'.repeat(MAX_PAYLOAD_LENGTH))).toMatchObject({ ok: true });
  });

  it('applies the same checks in development and server mode, with no format rule', () => {
    for (const validator of [developmentBarcodeValidator, serverBarcodeValidator]) {
      expect(validator.check('A\u0001').ok).toBe(false);
      expect(validator.check('x'.repeat(513)).ok).toBe(false);
      expect(validator.check('a').ok).toBe(true);
      expect(validator.check('02KCBE516100CHG702022741').ok).toBe(true);
      expect(validator.check('anything else, any length 123').ok).toBe(true);
    }
  });

  it('the server-mode validator never claims production validation', () => {
    const result = serverBarcodeValidator.check('ANY');
    expect(result).toMatchObject({ ok: true, mode: 'development' });
  });
});

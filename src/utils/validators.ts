import type { EditableCellFields, EditableFieldKey } from '@/models/cell';

/**
 * Field-level validation for the Edit Cell form.
 * Only structural checks are applied (numeric, non-negative, length). Value ranges are NOT enforced
 * because valid ranges have not been confirmed by the factory yet.
 */

export const NUMERIC_FIELDS: readonly EditableFieldKey[] = [
  'cellWeightG',
  'cellVoltageV',
  'acirMohm',
  'dischargeCapacity05CAh',
  'dcir20Mohm',
  'dcir50Mohm',
  'dcir90Mohm',
];

export const TEXT_FIELDS: readonly EditableFieldKey[] = ['sortingGrade', 'cellLocalNumber'];

const MAX_TEXT_LENGTH = 64;

export const FIELD_LABELS: Record<EditableFieldKey, string> = {
  sortingGrade: 'Sorting grade',
  cellLocalNumber: 'Cell local number',
  cellWeightG: 'Cell weight',
  cellVoltageV: 'Cell voltage',
  acirMohm: 'ACIR',
  dischargeCapacity05CAh: '0.5C discharge capacity',
  dcir20Mohm: 'DCIR @20%',
  dcir50Mohm: 'DCIR @50%',
  dcir90Mohm: 'DCIR @90%',
};

/** Parse a form string to a number. Empty string -> null. Invalid -> NaN. */
export function parseNumberInput(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  return Number(trimmed);
}

/** Format a stored number for a form input. */
export function formatNumberInput(value: number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value);
}

/** Validate a partial set of editable fields. Returns field -> message (empty when valid). */
export function validateEditableFields(input: Partial<EditableCellFields>): Record<string, string> {
  const errors: Record<string, string> = {};

  for (const key of NUMERIC_FIELDS) {
    const value = input[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      errors[key] = `${FIELD_LABELS[key]} must be a number.`;
    } else if (value < 0) {
      errors[key] = `${FIELD_LABELS[key]} cannot be negative.`;
    }
  }

  for (const key of TEXT_FIELDS) {
    const value = input[key];
    if (value === undefined || value === null) continue;
    if (typeof value !== 'string' || value.length > MAX_TEXT_LENGTH) {
      errors[key] = `${FIELD_LABELS[key]} must be at most ${MAX_TEXT_LENGTH} characters.`;
    }
  }

  return errors;
}

/** Normalise text fields: trim, and turn empty strings into null. */
export function normalizeText(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

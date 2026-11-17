import { useCallback, useMemo, useState } from 'react';

import type { CellRecord, EditableFieldKey, ScanSource, VisualInspectionStatus } from '@/models/cell';
import { updateCell, type UpdateCellRequest } from '@/services/cellService';
import { getErrorMessage, ValidationError } from '@/services/errors';
import { FIELD_LABELS, formatNumberInput, NUMERIC_FIELDS, parseNumberInput } from '@/utils/validators';

/** Form values: numbers are edited as text so partial input like "3." is possible. */
export interface CellFormValues {
  cellLocalNumber: string;
  cellWeightG: string;
  cellVoltageV: string;
  acirMohm: string;
  dischargeCapacity05CAh: string;
  dcir20Mohm: string;
  dcir50Mohm: string;
  dcir90Mohm: string;
  visualInspectionStatus: VisualInspectionStatus;
  remarks: string;
}

export interface PendingBarcode {
  rawPayload: string;
  barcode: string;
  source: ScanSource;
}

function toFormValues(cell: CellRecord): CellFormValues {
  return {
    cellLocalNumber: cell.cellLocalNumber ?? '',
    cellWeightG: formatNumberInput(cell.cellWeightG),
    cellVoltageV: formatNumberInput(cell.cellVoltageV),
    acirMohm: formatNumberInput(cell.acirMohm),
    dischargeCapacity05CAh: formatNumberInput(cell.dischargeCapacity05CAh),
    dcir20Mohm: formatNumberInput(cell.dcir20Mohm),
    dcir50Mohm: formatNumberInput(cell.dcir50Mohm),
    dcir90Mohm: formatNumberInput(cell.dcir90Mohm),
    visualInspectionStatus: cell.visualInspectionStatus,
    remarks: cell.remarks ?? '',
  };
}

const normalizeForCompare = (values: CellFormValues) => JSON.stringify({ ...values, cellLocalNumber: values.cellLocalNumber.trim(), remarks: values.remarks.trim() });

/** State + save logic for the Edit Cell screen. Saves only through cellService. */
export function useCellForm(cell: CellRecord) {
  const initial = useMemo(() => toFormValues(cell), [cell]);
  const [values, setValues] = useState<CellFormValues>(initial);
  const [pendingBarcode, setPendingBarcode] = useState<PendingBarcode | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const dirty = pendingBarcode !== null || normalizeForCompare(values) !== normalizeForCompare(initial);

  const setField = useCallback(<K extends keyof CellFormValues>(key: K, value: CellFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  /** Returns the saved record, or null when validation/saving failed (errors are set on the form). */
  const save = useCallback(async (): Promise<CellRecord | null> => {
    setFormError(null);

    const nextErrors: Record<string, string> = {};
    const request: UpdateCellRequest = {
      cellLocalNumber: values.cellLocalNumber,
      visualInspectionStatus: values.visualInspectionStatus,
      remarks: values.remarks,
      // Reject the save (instead of overwriting) if someone else changed this cell after it was loaded.
      expectedVersion: cell.version,
    };
    for (const key of NUMERIC_FIELDS) {
      const parsed = parseNumberInput(values[key as keyof CellFormValues] as string);
      if (parsed !== null && Number.isNaN(parsed)) {
        nextErrors[key] = `${FIELD_LABELS[key as EditableFieldKey]} must be a number.`;
      } else {
        (request as Record<string, unknown>)[key] = parsed;
      }
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return null;
    }
    if (pendingBarcode) request.newBarcode = { rawPayload: pendingBarcode.rawPayload, source: pendingBarcode.source };

    setSaving(true);
    try {
      const saved = await updateCell(cell.id, request);
      setErrors({});
      return saved;
    } catch (error) {
      if (error instanceof ValidationError) {
        setErrors(error.fieldErrors);
        setFormError(Object.keys(error.fieldErrors).length === 0 ? error.message : null);
      } else {
        setFormError(getErrorMessage(error));
      }
      return null;
    } finally {
      setSaving(false);
    }
  }, [cell.id, cell.version, pendingBarcode, values]);

  return { values, setField, pendingBarcode, setPendingBarcode, errors, formError, dirty, saving, save };
}

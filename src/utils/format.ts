import type { InspectionStatus, QcStatus } from '@/models/cell';

/** `1` -> `#001` */
export function formatSerial(serial: number): string {
  return `#${String(serial).padStart(3, '0')}`;
}

export function formatCount(value: number): string {
  return value.toLocaleString('en-US');
}

/** Value with unit, or an em dash when missing. */
export function formatMeasurement(value: number | null | undefined, unit: string, fractionDigits?: number): string {
  if (value === null || value === undefined) return '—';
  const text = fractionDigits === undefined ? String(value) : value.toFixed(fractionDigits);
  return `${text} ${unit}`;
}

/** `02KCBE516100CHG702023891` -> `02KCBE516100CHG702023...` */
export function truncateMiddle(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}...`;
}

export function formatRelativeTime(iso: string, now: number = Date.now()): string {
  const diffMs = Math.max(0, now - new Date(iso).getTime());
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export const QC_LABEL: Record<QcStatus, string> = { passed: 'Passed', failed: 'Failed', pending: 'Pending' };
export const INSPECTION_LABEL: Record<InspectionStatus, string> = {
  complete: 'Complete',
  in_progress: 'In progress',
  not_started: 'Not started',
};

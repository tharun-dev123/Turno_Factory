import { Pill, type PillTone } from '@/components/ui/Pill';
import type { VisualInspectionStatus } from '@/models/cell';

const TONE: Record<VisualInspectionStatus, PillTone> = {
  Good: 'success',
  Damaged: 'warning',
  'Under Review': 'neutral',
  Rejected: 'danger',
};

/** Coloured label for a visual inspection status. */
export function VisualStatusPill({ status, size }: { status: VisualInspectionStatus; size?: 'sm' | 'md' }) {
  return <Pill label={status} tone={TONE[status]} dot size={size} />;
}

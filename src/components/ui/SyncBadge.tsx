import type { SyncStatus } from '@/models/cell';

import { Pill, type PillTone } from './Pill';

const SYNC: Record<SyncStatus, { label: string; tone: PillTone }> = {
  synced: { label: 'Synced', tone: 'success' },
  pending: { label: 'Pending', tone: 'warning' },
  error: { label: 'Sync error', tone: 'danger' },
};

export function SyncBadge({ status }: { status: SyncStatus }) {
  const { label, tone } = SYNC[status];
  return <Pill label={label} tone={tone} dot size="sm" />;
}

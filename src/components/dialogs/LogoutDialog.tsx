import { ConfirmDialog } from './ConfirmDialog';

export interface LogoutDialogProps {
  visible: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 10 - Logout Confirmation */
export function LogoutDialog({ visible, loading, onConfirm, onCancel }: LogoutDialogProps) {
  return (
    <ConfirmDialog
      visible={visible}
      icon="logout"
      title="Log Out?"
      confirmLabel="Log Out"
      confirmIcon="power-settings-new"
      loading={loading}
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}

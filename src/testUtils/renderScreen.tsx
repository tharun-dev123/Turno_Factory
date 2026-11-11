import type { ReactElement } from 'react';
import { render } from '@testing-library/react-native';

import { ToastProvider } from '@/components/ui/Toast';
import { AuthProvider } from '@/context/AuthContext';

type TestGlobals = typeof globalThis & {
  __router: { push: jest.Mock; replace: jest.Mock; back: jest.Mock; navigate: jest.Mock };
  __routeParams: Record<string, string>;
  __cameraProps?: { onBarcodeScanned?: (e: { data: string }) => void };
};

export const testGlobals = globalThis as TestGlobals;

/** Render a screen inside the same providers the app root supplies. */
export function renderScreen(ui: ReactElement) {
  return render(
    <AuthProvider>
      <ToastProvider>{ui}</ToastProvider>
    </AuthProvider>,
  );
}

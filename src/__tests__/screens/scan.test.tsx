import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import ScanScreen from '@/app/(tabs)/scan';

import { login, logout } from '@/services/authService';
import { renderScreen, testGlobals } from '@/testUtils/renderScreen';

/** Simulate the camera decoding a code. */
async function scan(payload: string) {
  await act(async () => {
    testGlobals.__cameraProps?.onBarcodeScanned?.({ data: payload });
  });
}

/** Run `fn` as if the scan cooldown had passed (the clock is moved forward, then restored). */
async function afterCooldown(fn: () => Promise<void>) {
  const realNow = Date.now;
  const offset = 3000;
  Date.now = () => realNow() + offset;
  try {
    await fn();
  } finally {
    Date.now = realNow;
  }
}

describe('Scan screen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await login('Admin', 'admin@123');
  });

  it('shows a read-only notice instead of the camera for a Viewer', async () => {
    await logout();
    await login('Viewer', 'viewer@123');
    await renderScreen(<ScanScreen />);
    expect(await screen.findByText('Read-only access')).toBeTruthy();
    expect(screen.queryByTestId('camera')).toBeNull();
  });

  it('shows the camera and the manual entry button', async () => {
    await renderScreen(<ScanScreen />);
    expect(await screen.findByTestId('camera')).toBeTruthy();
    expect(await screen.findByLabelText('Enter barcode manually')).toBeTruthy();
  });

  it('registers a new code, preserving it, and shows the success card', async () => {
    await renderScreen(<ScanScreen />);
    await screen.findByTestId('camera');
    await scan('BRAND-NEW-CELL-1');
    expect(await screen.findByText('Cell Registered Successfully')).toBeTruthy();
    expect(screen.getByText('BRAND-NEW-CELL-1')).toBeTruthy();
    expect(screen.getByText('Dev validation')).toBeTruthy();
    expect(screen.getByText('#021')).toBeTruthy();
  });

  it('rejects a code already scanned in this session without a second write', async () => {
    await renderScreen(<ScanScreen />);
    await screen.findByTestId('camera');
    await scan('SESSION-DUP-1');
    await screen.findByText('Cell Registered Successfully');
    await fireEvent.press(screen.getByLabelText('Scan Next Cell'));
    await waitFor(() => expect(screen.queryByText('Cell Registered Successfully')).toBeNull());

    // The same cell scanned again after the cooldown is a session duplicate.
    await afterCooldown(() => scan('SESSION-DUP-1'));
    expect(await screen.findByText('Cell Already Registered')).toBeTruthy();
    expect(screen.getByText(/Scanned earlier this session/)).toBeTruthy();
  });

  it('rejects a code that is already stored', async () => {
    await renderScreen(<ScanScreen />);
    await screen.findByTestId('camera');
    await scan('02KCBE516100DHG702113060');
    expect(await screen.findByText('Cell Already Registered')).toBeTruthy();
    expect(screen.getByText('MATCH SERIAL')).toBeTruthy();
    expect(screen.getByText('#001')).toBeTruthy();
  });

  it('shows Invalid QR Code for an empty payload and lets the operator retry', async () => {
    await renderScreen(<ScanScreen />);
    await screen.findByTestId('camera');
    await scan('   ');
    expect(await screen.findByText('Invalid QR Code')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Retry Scan'));
    await waitFor(() => expect(screen.queryByText('Invalid QR Code')).toBeNull());
  });

  it('registers a manually entered barcode', async () => {
    await renderScreen(<ScanScreen />);
    await fireEvent.press(await screen.findByLabelText('Enter barcode manually'));
    await fireEvent.changeText(await screen.findByLabelText('Battery barcode'), 'MANUAL-ENTRY-9');
    await fireEvent.press(screen.getByLabelText('Register Cell'));
    expect(await screen.findByText('Cell Registered Successfully')).toBeTruthy();
    expect(screen.getByText('MANUAL-ENTRY-9')).toBeTruthy();
  });

  describe('scanner states', () => {
    it('starts in the ready state with the alignment hint', async () => {
      await renderScreen(<ScanScreen />);
      expect(await screen.findByTestId('scanner-frame-ready')).toBeTruthy();
      expect(screen.getByLabelText('Scanner status: ALIGN QR CODE')).toBeTruthy();
    });

    it('turns the frame green with the serial after a registration, and the result header green', async () => {
      await renderScreen(<ScanScreen />);
      await screen.findByTestId('camera');
      await scan('GREEN-STATE-1');
      expect(await screen.findByTestId('scanner-frame-success')).toBeTruthy();
      expect(screen.getByLabelText(/Scanner status: REGISTERED #\d{3}/)).toBeTruthy();
      expect(screen.getByTestId('scan-result-header-success')).toBeTruthy();
      expect(screen.getByText('Continuing to the next scan automatically')).toBeTruthy();
    });

    it('shows amber for a duplicate and red for an invalid code', async () => {
      await renderScreen(<ScanScreen />);
      await screen.findByTestId('camera');
      await scan('02KCBE516100DHG702113060');
      expect(await screen.findByTestId('scanner-frame-duplicate')).toBeTruthy();
      expect(screen.getByLabelText('Scanner status: ALREADY REGISTERED #001')).toBeTruthy();
      expect(screen.getByTestId('scan-result-header-warning')).toBeTruthy();
      expect(screen.queryByText('Continuing to the next scan automatically')).toBeNull();

      await fireEvent.press(screen.getByLabelText('Scan Next Cell'));
      await scan('   ');
      expect(await screen.findByTestId('scanner-frame-invalid')).toBeTruthy();
      expect(screen.getByTestId('scan-result-header-danger')).toBeTruthy();
    });

    it('pauses the camera while a result is on screen, so the result is not overwritten', async () => {
      await renderScreen(<ScanScreen />);
      await screen.findByTestId('camera');
      await scan('PAUSE-1');
      await screen.findByText('Cell Registered Successfully');
      expect(testGlobals.__cameraProps?.onBarcodeScanned).toBeUndefined();

      // Even a late read of the same or another code must not change the result.
      await afterCooldown(() => scan('PAUSE-1'));
      await scan('PAUSE-OTHER');
      expect(screen.getByText('Cell Registered Successfully')).toBeTruthy();
      expect(screen.queryByText('Cell Already Registered')).toBeNull();
    });

    it('continues automatically after a success, but waits for the operator after a duplicate', async () => {
      await renderScreen(<ScanScreen />);
      await screen.findByTestId('camera');
      await scan('AUTO-1');
      await screen.findByText('Cell Registered Successfully');
      await waitFor(() => expect(screen.queryByText('Cell Registered Successfully')).toBeNull(), { timeout: 4000 });
      expect(screen.getByTestId('scanner-frame-ready')).toBeTruthy();
      expect(typeof testGlobals.__cameraProps?.onBarcodeScanned).toBe('function');

      await scan('02KCBE516100DHG702113060');
      await screen.findByText('Cell Already Registered');
      await new Promise((r) => setTimeout(r, 2200));
      expect(screen.getByText('Cell Already Registered')).toBeTruthy();
    }, 15000);

    it('counts today\'s registrations in the header', async () => {
      await renderScreen(<ScanScreen />);
      const before = await screen.findByText(/^Today: \d+$/);
      const start = Number(String(before.props.children).replace('Today: ', ''));
      await scan('COUNT-1');
      await screen.findByText('Cell Registered Successfully');
      expect(await screen.findByText(`Today: ${start + 1}`)).toBeTruthy();
    });

    it('vibrates on detection and plays the success sound on a registration', async () => {
      const Haptics = jest.requireMock('expo-haptics');
      const players = (globalThis as unknown as { __audioPlayers: { play: jest.Mock }[] }).__audioPlayers;
      await renderScreen(<ScanScreen />);
      await screen.findByTestId('camera');
      players.forEach((p) => p.play.mockClear());
      await scan('SOUND-1');
      await screen.findByText('Cell Registered Successfully');
      expect(Haptics.impactAsync).toHaveBeenCalled();
      expect(Haptics.notificationAsync).toHaveBeenCalledWith('success');
      await waitFor(() => expect(players.some((p) => p.play.mock.calls.length > 0)).toBe(true));
    });
  });
});

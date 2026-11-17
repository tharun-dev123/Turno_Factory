import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import ScanScreen from '@/app/(tabs)/scan';

import { login, logout } from '@/services/authService';
import { getCell } from '@/services/cellService';
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

  it('registers a new code and opens that cell\'s Edit Cell page straight away', async () => {
    await renderScreen(<ScanScreen />);
    await screen.findByTestId('camera');
    await scan('BRAND-NEW-CELL-1');
    await waitFor(() => expect(testGlobals.__router.push).toHaveBeenCalledTimes(1));
    expect(testGlobals.__router.push).toHaveBeenCalledWith({ pathname: '/cell/edit/[id]', params: { id: expect.any(String) } });

    // The cell really was registered (it is the one the Edit page was opened for), and no result card is left
    // behind: the scanner is ready for the next scan when the operator comes back.
    const { params } = testGlobals.__router.push.mock.calls[0][0] as { params: { id: string } };
    const cell = await getCell(params.id);
    expect(cell).toMatchObject({ batteryBarcode: 'BRAND-NEW-CELL-1', rawPayload: 'BRAND-NEW-CELL-1', visualInspectionStatus: 'Under Review', serialNumber: 21 });
    expect(screen.queryByText('Cell Registered Successfully')).toBeNull();
    expect(screen.getByTestId('scanner-frame-ready')).toBeTruthy();
    expect(typeof testGlobals.__cameraProps?.onBarcodeScanned).toBe('function');
  });

  it('does not open the Edit page for a duplicate, an invalid code, or a failed registration', async () => {
    await renderScreen(<ScanScreen />);
    await screen.findByTestId('camera');
    await scan('02KCBE516100DHG702113060'); // already stored
    await screen.findByText('Cell Already Registered');
    await fireEvent.press(screen.getByLabelText('Scan Next Cell'));
    await scan('   '); // invalid
    await screen.findByText('Invalid QR Code');
    expect(testGlobals.__router.push).not.toHaveBeenCalled();
  });

  it('rejects a code already scanned in this session without a second write', async () => {
    await renderScreen(<ScanScreen />);
    await screen.findByTestId('camera');
    await scan('SESSION-DUP-1');
    await waitFor(() => expect(testGlobals.__router.push).toHaveBeenCalledTimes(1));

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
    await waitFor(() => expect(testGlobals.__router.push).toHaveBeenCalledWith({ pathname: '/cell/edit/[id]', params: { id: expect.any(String) } }));
    const { params } = testGlobals.__router.push.mock.calls[0][0] as { params: { id: string } };
    expect(await getCell(params.id)).toMatchObject({ batteryBarcode: 'MANUAL-ENTRY-9', rawPayload: null });
  });

  describe('scanner states', () => {
    it('starts in the ready state with the alignment hint', async () => {
      await renderScreen(<ScanScreen />);
      expect(await screen.findByTestId('scanner-frame-ready')).toBeTruthy();
      expect(screen.getByLabelText('Scanner status: ALIGN QR CODE')).toBeTruthy();
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
      await scan('02KCBE516100DHG702113060'); // already stored: a result stays on screen
      await screen.findByText('Cell Already Registered');
      expect(testGlobals.__cameraProps?.onBarcodeScanned).toBeUndefined();

      // Even a late read of the same or another code must not change the result.
      await afterCooldown(() => scan('02KCBE516100DHG702113060'));
      await scan('PAUSE-OTHER');
      expect(screen.getByText('Cell Already Registered')).toBeTruthy();
      expect(testGlobals.__router.push).not.toHaveBeenCalled();
    });

    it('is ready again right after a registration, and waits for the operator after a duplicate', async () => {
      await renderScreen(<ScanScreen />);
      await screen.findByTestId('camera');
      await scan('AUTO-1');
      await waitFor(() => expect(testGlobals.__router.push).toHaveBeenCalledTimes(1));
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
      expect(await screen.findByText(`Today: ${start + 1}`)).toBeTruthy();
    });

    it('vibrates on detection and plays the success sound on a registration', async () => {
      const Haptics = jest.requireMock('expo-haptics');
      const players = (globalThis as unknown as { __audioPlayers: { play: jest.Mock }[] }).__audioPlayers;
      await renderScreen(<ScanScreen />);
      await screen.findByTestId('camera');
      players.forEach((p) => p.play.mockClear());
      await scan('SOUND-1');
      await waitFor(() => expect(Haptics.notificationAsync).toHaveBeenCalledWith('success'));
      expect(Haptics.impactAsync).toHaveBeenCalled();
      await waitFor(() => expect(players.some((p) => p.play.mock.calls.length > 0)).toBe(true));
    });
  });
});

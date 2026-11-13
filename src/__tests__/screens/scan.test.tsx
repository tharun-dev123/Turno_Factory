import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import ScanScreen from '@/app/(tabs)/scan';

import { renderScreen, testGlobals } from '@/testUtils/renderScreen';

/** Simulate the camera decoding a code. */
async function scan(payload: string) {
  await act(async () => {
    testGlobals.__cameraProps?.onBarcodeScanned?.({ data: payload });
  });
}

describe('Scan screen', () => {
  beforeEach(() => jest.clearAllMocks());

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

    await scan('SESSION-DUP-1');
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
});

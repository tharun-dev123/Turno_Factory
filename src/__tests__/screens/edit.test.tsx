import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import EditCellScreen from '@/app/cell/edit/[id]';
import { getCell } from '@/services/cellService';

import { renderScreen, testGlobals } from '@/testUtils/renderScreen';

describe('Edit Cell screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    testGlobals.__routeParams = { id: 'dummy-001' };
  });

  it('loads the cell with a locked serial and no unsaved changes', async () => {
    await renderScreen(<EditCellScreen />);
    expect(await screen.findByText('Edit Cell #001')).toBeTruthy();
    expect(screen.getByLabelText('Serial number (read-only)').props.editable).toBe(false);
    expect(screen.queryByText('Unsaved Changes')).toBeNull();
    expect(screen.getByLabelText('Save Changes').props.accessibilityState.disabled).toBe(true);
  });

  it('marks the form dirty when a value changes', async () => {
    await renderScreen(<EditCellScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Cell Weight'), '3200.5');
    expect(await screen.findByText('Unsaved Changes')).toBeTruthy();
  });

  it('blocks non-numeric measurements with an inline error', async () => {
    await renderScreen(<EditCellScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Cell Voltage (OCV)'), 'abc');
    await fireEvent.press(screen.getByLabelText('Save Changes'));
    expect(await screen.findByText('Cell voltage must be a number.')).toBeTruthy();
    expect(testGlobals.__router.back).not.toHaveBeenCalled();
  });

  it('blocks negative measurements reported by the service', async () => {
    await renderScreen(<EditCellScreen />);
    await fireEvent.changeText(await screen.findByLabelText('ACIR (1kHz)'), '-1');
    await fireEvent.press(screen.getByLabelText('Save Changes'));
    expect(await screen.findByText('ACIR cannot be negative.')).toBeTruthy();
  });

  it('saves valid changes through the service and goes back', async () => {
    await renderScreen(<EditCellScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Cell Weight'), '3333.3');
    await fireEvent.changeText(screen.getByLabelText('DCIR @90%'), '');
    await fireEvent.press(screen.getByLabelText('Save Changes'));
    await waitFor(() => expect(testGlobals.__router.back).toHaveBeenCalled());

    const saved = await getCell('dummy-001');
    expect(saved.cellWeightG).toBe(3333.3);
    expect(saved.dcir90Mohm).toBeNull();
    expect(saved.batteryBarcode).toBe('02KCBE516100DHG702113060');
  });
});

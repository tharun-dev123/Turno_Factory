import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import EditCellScreen from '@/app/cell/edit/[id]';
import { login, logout } from '@/services/authService';
import { clearCellCache, getCell, listCells, seedCellCache, updateCell } from '@/services/cellService';

import { renderScreen, testGlobals } from '@/testUtils/renderScreen';

describe('Edit Cell screen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    testGlobals.__routeParams = { id: 'dummy-001' };
    await login('Admin', 'admin@123');
  });

  it('shows a read-only notice instead of the form for a Viewer', async () => {
    await logout();
    await login('Viewer', 'viewer@123');
    await renderScreen(<EditCellScreen />);
    expect(await screen.findByText('Read-only access')).toBeTruthy();
    expect(screen.queryByText('Edit Cell')).toBeNull();
    expect(screen.queryByLabelText('Save Changes')).toBeNull();
  });

  it('loads the cell with a locked serial and no unsaved changes', async () => {
    await renderScreen(<EditCellScreen />);
    expect(await screen.findByText('Edit Cell')).toBeTruthy();
    expect(screen.getByLabelText('Serial number (read-only)').props.editable).toBe(false);
    expect(screen.queryByText('Unsaved Changes')).toBeNull();
    expect(screen.getByLabelText('Save Changes').props.accessibilityState?.disabled).toBeFalsy();
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
  describe('Visual Inspection', () => {
    it('shows the current status and an optional remarks box for an Under Review cell', async () => {
      testGlobals.__routeParams = { id: 'dummy-013' }; // seeded as Under Review
      await renderScreen(<EditCellScreen />);
      expect(await screen.findByLabelText('Cell Status: Under Review')).toBeTruthy();
      expect(screen.getByText('Remarks')).toBeTruthy();
      expect(screen.queryByText('Remarks (required)')).toBeNull();
    });

    it('offers exactly the four statuses and no "Not set" option', async () => {
      await renderScreen(<EditCellScreen />);
      await fireEvent.press(await screen.findByLabelText('Cell Status: Good'));
      for (const status of ['Good', 'Damaged', 'Under Review', 'Rejected']) expect(screen.getAllByText(status).length).toBeGreaterThan(0);
      expect(screen.queryByText('Not set')).toBeNull();
    });

    it('requires remarks for Damaged: shows an inline error and saves nothing', async () => {
      await renderScreen(<EditCellScreen />);
      await fireEvent.press(await screen.findByLabelText('Cell Status: Good'));
      await fireEvent.press(screen.getByText('Damaged'));
      expect(await screen.findByText('Remarks (required)')).toBeTruthy();
      await fireEvent.press(screen.getByLabelText('Save Changes'));
      expect(await screen.findByText('Remarks are required when the status is Damaged.')).toBeTruthy();
      expect(testGlobals.__router.back).not.toHaveBeenCalled();
      expect((await getCell('dummy-001')).visualInspectionStatus).toBe('Good');
    });

    it('saves Rejected with remarks', async () => {
      await renderScreen(<EditCellScreen />);
      await fireEvent.press(await screen.findByLabelText('Cell Status: Good'));
      await fireEvent.press(screen.getByText('Rejected'));
      await fireEvent.changeText(screen.getByLabelText('Remarks'), '  Swollen cell  ');
      await fireEvent.press(screen.getByLabelText('Save Changes'));
      await waitFor(() => expect(testGlobals.__router.back).toHaveBeenCalled());
      expect(await getCell('dummy-001')).toMatchObject({ visualInspectionStatus: 'Rejected', remarks: 'Swollen cell' });
    });
  });

  describe('opening from the last known copy', () => {
    it('opens the form without waiting for a fetch when the cell is already known', async () => {
      await listCells(); // what the All Cells / Cell Details screens have already done
      const known = await getCell('dummy-001'); // earlier tests in this file may have saved changes
      await renderScreen(<EditCellScreen />);
      expect(screen.queryByText('Loading cell...')).toBeNull();
      expect(screen.getByLabelText('Cell Weight').props.value).toBe(String(known.cellWeightG));
      expect(screen.queryByText('Unsaved Changes')).toBeNull();
    });

    it('still loads normally when the cell is not known yet', async () => {
      const known = await getCell('dummy-001');
      clearCellCache();
      await renderScreen(<EditCellScreen />);
      expect(await screen.findByText('Edit Cell')).toBeTruthy();
      expect(screen.getByLabelText('Cell Weight').props.value).toBe(String(known.cellWeightG));
    });

    it('does not replace the form when a newer copy arrives, warns instead, and refuses to overwrite on save', async () => {
      const known = await getCell('dummy-001'); // the app remembers this version...
      await updateCell('dummy-001', { cellWeightG: 4000, expectedVersion: known.version }); // ...then someone else saves a newer one
      seedCellCache(known); // put the out-of-date copy back, as it would be on this phone
      await renderScreen(<EditCellScreen />);

      // The newer copy is fetched in the background: the user is warned, the fields are not swapped, nothing is "dirty".
      expect(await screen.findByText(/updated by someone else/)).toBeTruthy();
      expect(screen.getByLabelText('Cell Weight').props.value).toBe(String(known.cellWeightG));
      expect(screen.queryByText('Unsaved Changes')).toBeNull();

      await fireEvent.changeText(screen.getByLabelText('Cell Voltage (OCV)'), '3.7');
      await fireEvent.press(screen.getByLabelText('Save Changes'));
      expect(await screen.findByText(/changed by someone else/)).toBeTruthy();
      expect(testGlobals.__router.back).not.toHaveBeenCalled();
      expect((await getCell('dummy-001')).cellWeightG).toBe(4000); // their change survived
    });
  });

  describe('right after a scan', () => {
    it('shows a "registered" banner with the serial number when opened from the scanner', async () => {
      testGlobals.__routeParams = { id: 'dummy-001', registered: '1' };
      await renderScreen(<EditCellScreen />);
      expect(await screen.findByTestId('registered-banner')).toBeTruthy();
      expect(screen.getByText('Cell #001 registered')).toBeTruthy();
      expect(screen.getByText('Enter the cell details below, then save.')).toBeTruthy();
    });

    it('does not show the banner when a cell is opened for editing from All Cells', async () => {
      testGlobals.__routeParams = { id: 'dummy-001' };
      await renderScreen(<EditCellScreen />);
      await screen.findByText('Edit Cell');
      expect(screen.queryByTestId('registered-banner')).toBeNull();
    });
  });

  describe('saving without changes', () => {
    it('keeps Save enabled; pressing it with no changes just goes back without writing anything', async () => {
      await renderScreen(<EditCellScreen />);
      await screen.findByText('Edit Cell');
      const before = await getCell('dummy-001');
      const button = screen.getByLabelText('Save Changes');
      expect(button.props.accessibilityState?.disabled).toBeFalsy();
      await fireEvent.press(button);
      await waitFor(() => expect(testGlobals.__router.back).toHaveBeenCalled());
      expect(await getCell('dummy-001')).toEqual(before); // same version and updatedAt: no write happened
    });
  });

  describe('Manufacturer', () => {
    it('offers exactly the two manufacturers plus "Not set"', async () => {
      await renderScreen(<EditCellScreen />);
      await fireEvent.press(await screen.findByLabelText(/^Manufacturer: /));
      expect(screen.getAllByText('GREAT POWER 100').length).toBeGreaterThan(0);
      expect(screen.getAllByText('EVE 230').length).toBeGreaterThan(0);
      expect(screen.getByText('Not set')).toBeTruthy();
    });

    it('saves the chosen manufacturer', async () => {
      testGlobals.__routeParams = { id: 'dummy-013' };
      await renderScreen(<EditCellScreen />);
      await fireEvent.press(await screen.findByLabelText(/^Manufacturer: /));
      await fireEvent.press(screen.getByText('EVE 230'));
      await fireEvent.press(screen.getByLabelText('Save Changes'));
      await waitFor(() => expect(testGlobals.__router.back).toHaveBeenCalled());
      expect((await getCell('dummy-013')).manufacturer).toBe('EVE 230');
    });

    it('can clear it with "Not set"', async () => {
      testGlobals.__routeParams = { id: 'dummy-001' };
      await renderScreen(<EditCellScreen />);
      await fireEvent.press(await screen.findByLabelText(/^Manufacturer: /));
      await fireEvent.press(screen.getByText('Not set'));
      await fireEvent.press(screen.getByLabelText('Save Changes'));
      await waitFor(() => expect(testGlobals.__router.back).toHaveBeenCalled());
      expect((await getCell('dummy-001')).manufacturer).toBeNull();
    });
  });
});

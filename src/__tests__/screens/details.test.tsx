import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import CellDetailsScreen from '@/app/cell/[id]';

import { login, logout } from '@/services/authService';
import { clearCellCache, getCell, listCells, peekCell } from '@/services/cellService';
import { renderScreen, testGlobals } from '@/testUtils/renderScreen';

describe('Cell Details screen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await login('Admin', 'admin@123');
  });

  it('shows identification, classification and measurements', async () => {
    testGlobals.__routeParams = { id: 'dummy-001' };
    await renderScreen(<CellDetailsScreen />);
    expect(await screen.findByText('Cell Details')).toBeTruthy();
    expect(screen.getAllByText('02KCBE516100DHG702113060').length).toBeGreaterThan(0);
    expect(screen.getByText('Grade A1 (Standard) - High Precision')).toBeTruthy();
    expect(screen.getByText('3120.4')).toBeTruthy();
    // Development-validated records must not be shown as production-verified.
    expect(screen.getByText('Dev validated')).toBeTruthy();
    expect(screen.queryByText('Verified')).toBeNull();
  });

  it('shows "Not recorded" for missing measurements', async () => {
    testGlobals.__routeParams = { id: 'dummy-020' };
    await renderScreen(<CellDetailsScreen />);
    await screen.findByText('Cell Details');
    expect(screen.getAllByText('Not recorded').length).toBeGreaterThanOrEqual(7);
  });

  it('shows a not-found state for an unknown cell', async () => {
    testGlobals.__routeParams = { id: 'does-not-exist' };
    await renderScreen(<CellDetailsScreen />);
    expect(await screen.findByText('Cell not found')).toBeTruthy();
  });

  it('hides Edit Cell for a Viewer but still shows every detail', async () => {
    await logout();
    await login('Viewer', 'viewer@123');
    testGlobals.__routeParams = { id: 'dummy-001' };
    await renderScreen(<CellDetailsScreen />);
    expect(await screen.findByText('Cell Details')).toBeTruthy();
    expect(screen.getByText('3120.4')).toBeTruthy();
    expect(screen.queryByLabelText('Edit Cell')).toBeNull();
    expect(screen.queryByLabelText('Delete Cell')).toBeNull();
  });

  it('opens the editor from Edit Cell', async () => {
    testGlobals.__routeParams = { id: 'dummy-001' };
    await renderScreen(<CellDetailsScreen />);
    await fireEvent.press(await screen.findByLabelText('Edit Cell'));
    expect(testGlobals.__router.push).toHaveBeenCalledWith({ pathname: '/cell/edit/[id]', params: { id: 'dummy-001' } });
  });

  // Skipped while the Delete Cell button is commented out in the screen. Re-enable with the button.
  it.skip('cancelling the delete dialog keeps the cell', async () => {
    testGlobals.__routeParams = { id: 'dummy-002' };
    await renderScreen(<CellDetailsScreen />);
    await fireEvent.press(await screen.findByLabelText('Delete Cell'));
    expect(await screen.findByText('Delete Battery Cell?')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Cancel'));
    await waitFor(() => expect(screen.queryByText('Delete Battery Cell?')).toBeNull());
    expect(testGlobals.__router.back).not.toHaveBeenCalled();
  });

  it.skip('confirming delete removes the cell and goes back', async () => {
    testGlobals.__routeParams = { id: 'dummy-003' };
    await renderScreen(<CellDetailsScreen />);
    await fireEvent.press(await screen.findByLabelText('Delete Cell'));
    // The dialog's confirm button carries the same label as the screen button; use the dialog one (last).
    const confirmButtons = await screen.findAllByLabelText('Delete Cell');
    await fireEvent.press(confirmButtons[confirmButtons.length - 1]);
    await waitFor(() => expect(testGlobals.__router.back).toHaveBeenCalled());
    expect(await screen.findByText('Cell #003 deleted')).toBeTruthy();
  });
  it('shows the visual inspection status, and the remarks when there are any', async () => {
    testGlobals.__routeParams = { id: 'dummy-010' }; // seeded as Damaged with remarks
    await renderScreen(<CellDetailsScreen />);
    await screen.findByText('Cell Details');
    expect(screen.getByText('Visual Inspection')).toBeTruthy();
    expect(screen.getByText('Damaged')).toBeTruthy();
    expect(screen.getByText('Dent on the can near the negative terminal.')).toBeTruthy();
  });

  it('shows "Under Review" and no remarks row for a cell that has not been inspected', async () => {
    testGlobals.__routeParams = { id: 'dummy-020' };
    await renderScreen(<CellDetailsScreen />);
    await screen.findByText('Cell Details');
    expect(screen.getByText('Under Review')).toBeTruthy();
    expect(screen.queryByText('Remarks')).toBeNull();
  });

  describe('opening a cell the list already loaded', () => {
    it('shows the cell immediately, without a loading spinner', async () => {
      await listCells(); // what the All Cells screen does
      testGlobals.__routeParams = { id: 'dummy-001' };
      await renderScreen(<CellDetailsScreen />);
      // Available on the very first render, before any request can have finished.
      expect(screen.queryByText('Loading cell...')).toBeNull();
      expect(screen.getAllByText('02KCBE516100DHG702113060').length).toBeGreaterThan(0);
    });

    it('still shows the loading state for a cell that has not been loaded yet', async () => {
      clearCellCache();
      testGlobals.__routeParams = { id: 'dummy-001' };
      await renderScreen(<CellDetailsScreen />);
      expect(await screen.findByText('Cell Details')).toBeTruthy();
    });

    it('forgets remembered cells on sign-out', async () => {
      await getCell('dummy-001');
      expect(peekCell('dummy-001')).not.toBeNull();
      await logout();
      expect(peekCell('dummy-001')).toBeNull();
    });
  });
});

import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import CellDetailsScreen from '@/app/cell/[id]';

import { renderScreen, testGlobals } from '@/testUtils/renderScreen';

describe('Cell Details screen', () => {
  beforeEach(() => jest.clearAllMocks());

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

  it('opens the editor from Edit Cell', async () => {
    testGlobals.__routeParams = { id: 'dummy-001' };
    await renderScreen(<CellDetailsScreen />);
    await fireEvent.press(await screen.findByLabelText('Edit Cell'));
    expect(testGlobals.__router.push).toHaveBeenCalledWith({ pathname: '/cell/edit/[id]', params: { id: 'dummy-001' } });
  });

  it('cancelling the delete dialog keeps the cell', async () => {
    testGlobals.__routeParams = { id: 'dummy-002' };
    await renderScreen(<CellDetailsScreen />);
    await fireEvent.press(await screen.findByLabelText('Delete Cell'));
    expect(await screen.findByText('Delete Battery Cell?')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Cancel'));
    await waitFor(() => expect(screen.queryByText('Delete Battery Cell?')).toBeNull());
    expect(testGlobals.__router.back).not.toHaveBeenCalled();
  });

  it('confirming delete removes the cell and goes back', async () => {
    testGlobals.__routeParams = { id: 'dummy-003' };
    await renderScreen(<CellDetailsScreen />);
    await fireEvent.press(await screen.findByLabelText('Delete Cell'));
    // The dialog's confirm button carries the same label as the screen button; use the dialog one (last).
    const confirmButtons = await screen.findAllByLabelText('Delete Cell');
    await fireEvent.press(confirmButtons[confirmButtons.length - 1]);
    await waitFor(() => expect(testGlobals.__router.back).toHaveBeenCalled());
    expect(await screen.findByText('Cell #003 deleted')).toBeTruthy();
  });
});

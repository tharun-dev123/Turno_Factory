import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import SettingsScreen from '@/app/(tabs)/settings';
import { getSession, login } from '@/services/authService';
import { renderScreen, testGlobals } from '@/testUtils/renderScreen';

describe('Settings screen', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await login('Admin', 'admin@123');
  });

  it('shows the version, environment and signed-in user', async () => {
    await renderScreen(<SettingsScreen />);
    expect(await screen.findByText('Settings & Preferences')).toBeTruthy();
    expect(screen.getByText('Application Version')).toBeTruthy();
    expect(await screen.findByText('Admin')).toBeTruthy();
  });

  it('keeps the session when logout is cancelled', async () => {
    await renderScreen(<SettingsScreen />);
    await fireEvent.press(await screen.findByTestId('logout-button'));
    expect(await screen.findByText('Log Out?')).toBeTruthy();
    // The dialog no longer shows the station / buffer text or the operator pill.
    expect(screen.queryByText(/unsynced local buffer/)).toBeNull();
    expect(screen.queryByText(/Active Operator/)).toBeNull();
    expect(screen.queryByText(/Buffer lock/)).toBeNull();
    await fireEvent.press(screen.getByLabelText('Cancel'));
    await waitFor(() => expect(screen.queryByText('Log Out?')).toBeNull());
    expect(await getSession()).not.toBeNull();
    expect(testGlobals.__router.replace).not.toHaveBeenCalled();
  });

  it('logs out after confirmation and returns to Login', async () => {
    await renderScreen(<SettingsScreen />);
    await fireEvent.press(await screen.findByTestId('logout-button'));
    await screen.findByText('Log Out?');
    // Two "Log Out" buttons now exist (the screen's and the dialog's); confirm with the dialog's (last).
    const buttons = screen.getAllByLabelText('Log Out');
    await fireEvent.press(buttons[buttons.length - 1]);
    await waitFor(() => expect(testGlobals.__router.replace).toHaveBeenCalledWith('/login'));
    expect(await getSession()).toBeNull();
  });
});

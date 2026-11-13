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
    await fireEvent.press(await screen.findByLabelText('Log Out of Terminal'));
    expect(await screen.findByText('Log Out of Terminal?')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Cancel'));
    await waitFor(() => expect(screen.queryByText('Log Out of Terminal?')).toBeNull());
    expect(await getSession()).not.toBeNull();
    expect(testGlobals.__router.replace).not.toHaveBeenCalled();
  });

  it('logs out after confirmation and returns to Login', async () => {
    await renderScreen(<SettingsScreen />);
    await fireEvent.press(await screen.findByLabelText('Log Out of Terminal'));
    await fireEvent.press(await screen.findByLabelText('Log Out'));
    await waitFor(() => expect(testGlobals.__router.replace).toHaveBeenCalledWith('/login'));
    expect(await getSession()).toBeNull();
  });
});

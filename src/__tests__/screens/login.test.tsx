import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import LoginScreen from '@/app/login';
import { logout } from '@/services/authService';

import { renderScreen, testGlobals } from '@/testUtils/renderScreen';

describe('Login screen', () => {
  beforeEach(async () => {
    await logout();
    jest.clearAllMocks();
  });

  it('shows the welcome content and the configured storage status', async () => {
    await renderScreen(<LoginScreen />);
    expect(await screen.findByText('Welcome')).toBeTruthy();
    expect(screen.getByText('Sign in to manage factory battery cells')).toBeTruthy();
    expect(screen.getByText(/Local Mock Data: Ready/)).toBeTruthy();
  });

  it('requires both fields', async () => {
    await renderScreen(<LoginScreen />);
    await fireEvent.press(await screen.findByLabelText('Sign In to Terminal'));
    expect(await screen.findByText('Username is required.')).toBeTruthy();
    expect(screen.getByText('Password is required.')).toBeTruthy();
  });

  it('shows an error for wrong credentials and does not navigate', async () => {
    await renderScreen(<LoginScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Username'), 'Admin');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'wrong-password');
    await fireEvent.press(screen.getByLabelText('Sign In to Terminal'));
    expect(await screen.findByText('Invalid username or password.')).toBeTruthy();
    expect(testGlobals.__router.replace).not.toHaveBeenCalled();
  });

  it('signs in with valid credentials and opens All Cells', async () => {
    await renderScreen(<LoginScreen />);
    await fireEvent.changeText(await screen.findByLabelText('Username'), 'Admin');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'admin@123');
    await fireEvent.press(screen.getByLabelText('Sign In to Terminal'));
    await waitFor(() => expect(testGlobals.__router.replace).toHaveBeenCalledWith('/(tabs)/cells'));
  });

  it('toggles password visibility', async () => {
    await renderScreen(<LoginScreen />);
    const toggle = await screen.findByLabelText('Show password');
    await fireEvent.press(toggle);
    expect(await screen.findByLabelText('Hide password')).toBeTruthy();
  });
});

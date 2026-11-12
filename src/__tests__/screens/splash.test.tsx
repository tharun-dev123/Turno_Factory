import { act, screen } from '@testing-library/react-native';

import SplashRoute from '@/app/index';
import { login, logout } from '@/services/authService';
import { renderScreen, testGlobals } from '@/testUtils/renderScreen';

describe('Splash screen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });
  afterEach(() => jest.useRealTimers());

  it('shows the branding, then opens Login when signed out', async () => {
    await logout();
    await renderScreen(<SplashRoute />);
    expect(screen.getByText('Turno Battery Scanner')).toBeTruthy();
    expect(screen.getByText('INIT PROTOCOL BUS • READY')).toBeTruthy();
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(testGlobals.__router.replace).toHaveBeenCalledWith('/login');
  });

  it('opens All Cells when a valid session exists', async () => {
    jest.useRealTimers();
    await login('Admin', 'admin@123');
    jest.useFakeTimers();
    await renderScreen(<SplashRoute />);
    await act(async () => {
      jest.advanceTimersByTime(2000);
    });
    expect(testGlobals.__router.replace).toHaveBeenCalledWith('/(tabs)/cells');
  });
});

import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { login, logout } from '@/services/authService';
import { expireSession } from '@/services/sessionStore';

function Probe() {
  const { status, session } = useAuth();
  return <Text testID="status">{`${status}:${session?.username ?? '-'}`}</Text>;
}

describe('AuthContext session expiry', () => {
  beforeEach(async () => {
    await logout();
  });

  it('returns to the signed-out state when the backend rejects the token', async () => {
    await login('Admin', 'admin@123');
    await render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
    expect((await screen.findByTestId('status')).props.children).toBe('authenticated:Admin');

    await act(async () => {
      await expireSession();
    });
    expect(screen.getByTestId('status').props.children).toBe('unauthenticated:-');
  });
});

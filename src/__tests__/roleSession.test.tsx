import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AuthProvider, useAuth } from '@/context/AuthContext';
import { login, logout } from '@/services/authService';
import { readSession, writeSession } from '@/services/sessionStore';

function Probe() {
  const { status, role, canWrite } = useAuth();
  return <Text testID="probe">{`${status}:${role}:${canWrite}`}</Text>;
}

const renderProbe = () =>
  render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );

describe('role in the session', () => {
  beforeEach(async () => {
    await logout();
  });

  it('Admin can write', async () => {
    await login('Admin', 'admin@123');
    await renderProbe();
    expect((await screen.findByText('authenticated:admin:true')).props.children).toBe('authenticated:admin:true');
  });

  it('Viewer cannot write', async () => {
    const session = await login('Viewer', 'viewer@123');
    expect(session.role).toBe('viewer');
    await renderProbe();
    expect(await screen.findByText('authenticated:viewer:false')).toBeTruthy();
  });

  it('a session saved before roles existed is treated as a Viewer', async () => {
    await writeSession({ token: 't', username: 'Admin', expiresAt: new Date(Date.now() + 3_600_000).toISOString() } as never);
    expect((await readSession())?.role).toBe('viewer');
    await renderProbe();
    expect(await screen.findByText('authenticated:viewer:false')).toBeTruthy();
  });

  it('an unknown role value is treated as a Viewer', async () => {
    await writeSession({ token: 't', username: 'x', role: 'superuser', expiresAt: new Date(Date.now() + 3_600_000).toISOString() } as never);
    await renderProbe();
    expect(await screen.findByText('authenticated:viewer:false')).toBeTruthy();
  });

  it('signing out drops write access', async () => {
    await login('Admin', 'admin@123');
    await renderProbe();
    await screen.findByText('authenticated:admin:true');
    await act(async () => {
      await logout();
    });
  });
});

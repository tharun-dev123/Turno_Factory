import { AuthError, ValidationError } from '../errors';
import { getSession, isAuthenticated, login, logout } from '../authService';

const VALID = { username: 'Admin', password: 'admin@123' };

describe('authService', () => {
  beforeEach(async () => {
    await logout();
  });

  it('starts without a session', async () => {
    expect(await getSession()).toBeNull();
    expect(await isAuthenticated()).toBe(false);
  });

  it('logs in with valid credentials and persists the session', async () => {
    const session = await login(VALID.username, VALID.password);
    expect(session.username).toBe(VALID.username);
    expect(session.token).toBeTruthy();
    expect(await isAuthenticated()).toBe(true);
    expect((await getSession())?.token).toBe(session.token);
  });

  it('rejects wrong credentials with an AuthError and stores nothing', async () => {
    await expect(login(VALID.username, 'wrong')).rejects.toBeInstanceOf(AuthError);
    await expect(login('someone', VALID.password)).rejects.toBeInstanceOf(AuthError);
    expect(await isAuthenticated()).toBe(false);
  });

  it('requires both fields', async () => {
    await expect(login('', '')).rejects.toBeInstanceOf(ValidationError);
    await expect(login(VALID.username, '')).rejects.toMatchObject({ fieldErrors: { password: expect.any(String) } });
  });

  it('clears the session on logout', async () => {
    await login(VALID.username, VALID.password);
    await logout();
    expect(await getSession()).toBeNull();
  });

  it('drops an expired session', async () => {
    await login(VALID.username, VALID.password);
    const realNow = Date.now;
    Date.now = () => realNow() + 24 * 3_600_000;
    try {
      expect(await getSession()).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });
});

import { AuthError, ValidationError } from '../errors';
import { getSession, isAuthenticated, login, logout, normalizeCredential } from '../authService';
import { authBackend } from '../repository';

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

  describe('whitespace in the username and password fields', () => {
    it('accepts credentials pasted with leading/trailing spaces, tabs or line breaks', async () => {
      const session = await login('  Admin \n', '\n admin@123 \r\n\t');
      expect(session.username).toBe('Admin');
      expect(await isAuthenticated()).toBe(true);
    });

    it('sends the trimmed values to the backend, keeping spaces inside the password', async () => {
      const spy = jest.spyOn(authBackend, 'login').mockResolvedValue({ token: 't', username: 'Admin', expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
      try {
        await login(' Admin\n', '  pass word 12\n  ');
        expect(spy).toHaveBeenCalledWith('Admin', 'pass word 12');
      } finally {
        spy.mockRestore();
      }
    });

    it('treats whitespace-only fields as empty and does not contact the backend', async () => {
      const spy = jest.spyOn(authBackend, 'login');
      try {
        await expect(login(' \n ', '\t ')).rejects.toMatchObject({
          code: 'VALIDATION',
          fieldErrors: { username: 'Username is required.', password: 'Password is required.' },
        });
        expect(spy).not.toHaveBeenCalled();
      } finally {
        spy.mockRestore();
      }
    });

    it('normalizeCredential trims only the edges', () => {
      expect(normalizeCredential('\u00A0 a b \n')).toBe('a b');
      expect(normalizeCredential('abc')).toBe('abc');
      expect(normalizeCredential('   ')).toBe('');
    });
  });
});

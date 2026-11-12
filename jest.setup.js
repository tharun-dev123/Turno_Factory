// Jest setup: in-memory AsyncStorage and SecureStore, and instant mock latency.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-secure-store', () => {
  const store = new Map();
  return {
    isAvailableAsync: jest.fn(async () => true),
    getItemAsync: jest.fn(async (key) => (store.has(key) ? store.get(key) : null)),
    setItemAsync: jest.fn(async (key, value) => {
      store.set(key, value);
    }),
    deleteItemAsync: jest.fn(async (key) => {
      store.delete(key);
    }),
  };
});

jest.mock('./src/services/mock/mockConfig', () => ({
  ...jest.requireActual('./src/services/mock/mockConfig'),
  mockDelay: jest.fn(async () => undefined),
}));

// ---- UI test mocks (native modules and router) ----
jest.mock('react-native-safe-area-context', () => require('react-native-safe-area-context/jest/mock').default);

jest.mock('expo-haptics', () => ({
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  notificationAsync: jest.fn(async () => undefined),
}));

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn(async () => true) }));

jest.mock('expo-image', () => ({ Image: 'Image' }));

jest.mock('expo-camera', () => {
  const React = require('react');
  const { View } = require('react-native');
  const CameraView = (props) => {
    globalThis.__cameraProps = props;
    return React.createElement(View, { testID: 'camera' });
  };
  return {
    CameraView,
    useCameraPermissions: () => [{ granted: true, status: 'granted', canAskAgain: true }, jest.fn()],
  };
});

jest.mock('expo-router', () => {
  const React = require('react');
  const router = {
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    navigate: jest.fn(),
  };
  globalThis.__router = router;
  globalThis.__routeParams = {};
  return {
    useRouter: () => router,
    useLocalSearchParams: () => globalThis.__routeParams,
    useFocusEffect: (callback) => React.useEffect(callback, [callback]),
    usePreventRemove: () => jest.fn(),
    Redirect: () => null,
  };
});

jest.mock('expo-crypto', () => ({ randomUUID: () => require('node:crypto').randomUUID() }));

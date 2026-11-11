// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

const MOCK_MESSAGE =
  'Only src/services/repository.ts may import the temporary mock layer (src/services/mock). Use cellService / authService.';

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', '.expo/*', 'node_modules/*'],
  },
  {
    // Data-source isolation: nothing outside the service layer may touch mock data, the repository,
    // raw storage, or the barcode validators directly.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/services/**', 'src/validation/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['**/services/mock', '**/services/mock/**'], message: MOCK_MESSAGE },
            {
              group: ['**/services/repository', '**/services/contracts'],
              message: 'The data source is internal to the service layer. Use cellService / authService.',
            },
            {
              group: ['**/validation/*', '@/validation/*'],
              message: 'Barcode validation is internal to cellService. Call cellService.validateBarcode / registerScan.',
            },
          ],
          paths: [
            {
              name: '@react-native-async-storage/async-storage',
              message: 'Local storage belongs to the service layer. Use cellService / authService.',
            },
            {
              name: 'expo-secure-store',
              message: 'Session storage belongs to authService.',
            },
          ],
        },
      ],
    },
  },
  {
    // Inside the service layer, only the single selection point may import the mock folder.
    files: ['src/services/**/*.{ts,tsx}'],
    ignores: ['src/services/repository.ts', 'src/services/mock/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [{ group: ['**/mock', '**/mock/**'], message: MOCK_MESSAGE }],
        },
      ],
    },
  },
]);

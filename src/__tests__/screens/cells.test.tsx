import { fireEvent, screen } from '@testing-library/react-native';

import AllCellsScreen from '@/app/(tabs)/cells';

import { renderScreen, testGlobals } from '@/testUtils/renderScreen';

describe('All Cells screen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows stats and the list of seeded cells, newest first', async () => {
    await renderScreen(<AllCellsScreen />);
    expect(await screen.findByText('Battery Inventory')).toBeTruthy();
    expect(await screen.findByText('Serial #020')).toBeTruthy();
    expect(screen.getByText('20 Loaded')).toBeTruthy();
    expect(screen.getByText('Total Cells')).toBeTruthy();
    expect(screen.getByText('20')).toBeTruthy();
  });

  it('filters by barcode and shows the no-match state', async () => {
    await renderScreen(<AllCellsScreen />);
    await screen.findByText('Serial #020');
    const search = screen.getByLabelText('Search cells');

    await fireEvent.changeText(search, 'CHG702022741');
    expect(await screen.findByText('1 Found')).toBeTruthy();
    expect(screen.getByText('02KCBE516100CHG702022741')).toBeTruthy();

    await fireEvent.changeText(search, 'ZZZ-NOPE');
    expect(await screen.findByText('No matching cells')).toBeTruthy();
  });

  it('opens a cell when tapped', async () => {
    await renderScreen(<AllCellsScreen />);
    const row = await screen.findByLabelText('Serial #020, barcode 02KCBE516100CHG702023970');
    await fireEvent.press(row);
    expect(testGlobals.__router.push).toHaveBeenCalledWith({ pathname: '/cell/[id]', params: { id: 'dummy-020' } });
  });
});

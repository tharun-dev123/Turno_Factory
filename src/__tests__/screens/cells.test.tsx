import { fireEvent, screen } from '@testing-library/react-native';

import AllCellsScreen from '@/app/(tabs)/cells';

import * as cellService from '@/services/cellService';
import { renderScreen, testGlobals } from '@/testUtils/renderScreen';

describe('All Cells screen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('shows stats and the list of seeded cells, newest first', async () => {
    await renderScreen(<AllCellsScreen />);
    expect(await screen.findByText('Battery Inventory')).toBeTruthy();
    expect(await screen.findByText('02KCBE516100CHG702023970')).toBeTruthy();
    expect(screen.getByText('Total Cells')).toBeTruthy();
    expect(screen.getByText('20')).toBeTruthy();
  });

  it('filters by barcode and shows the no-match state', async () => {
    await renderScreen(<AllCellsScreen />);
    await screen.findByText('02KCBE516100CHG702023970');
    const search = screen.getByLabelText('Search cells');

    await fireEvent.changeText(search, 'CHG702022741');
    expect(await screen.findByText('02KCBE516100CHG702022741')).toBeTruthy();

    await fireEvent.changeText(search, 'ZZZ-NOPE');
    expect(await screen.findByText('No matching cells')).toBeTruthy();
  });

  it('opens a cell when tapped', async () => {
    await renderScreen(<AllCellsScreen />);
    const row = await screen.findByLabelText('Serial #020, barcode 02KCBE516100CHG702023970, Under Review');
    await fireEvent.press(row);
    expect(testGlobals.__router.push).toHaveBeenCalledWith({ pathname: '/cell/[id]', params: { id: 'dummy-020' } });
  });

  it('shows each cell\'s visual inspection status pill in the list', async () => {
    await renderScreen(<AllCellsScreen />);
    await screen.findByLabelText('Serial #020, barcode 02KCBE516100CHG702023970, Under Review');
    expect(screen.getAllByText('Under Review').length).toBeGreaterThan(0);
    // Older cells are outside the first rendered window, so find them by search.
    await fireEvent.changeText(screen.getByLabelText('Search cells'), 'CHG702023904');
    expect(await screen.findByLabelText('Serial #010, barcode 02KCBE516100CHG702023904, Damaged')).toBeTruthy();
    expect(screen.getByText('Damaged')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Search cells'), 'CHG702022741');
    expect(await screen.findByText('Good')).toBeTruthy();
  });

  it('searches the already loaded list: typing never reloads from the data source', async () => {
    const overview = jest.spyOn(cellService, 'getCellsOverview');
    await renderScreen(<AllCellsScreen />);
    await screen.findByText('02KCBE516100CHG702023970');
    const loadsBefore = overview.mock.calls.length;

    const search = screen.getByLabelText('Search cells');
    await fireEvent.changeText(search, 'CHG702022741');
    expect(await screen.findByText('02KCBE516100CHG702022741')).toBeTruthy();
    expect(screen.queryByText('02KCBE516100CHG702023970')).toBeNull();
    await fireEvent.changeText(search, '');
    expect(await screen.findByText('02KCBE516100CHG702023970')).toBeTruthy();

    expect(overview.mock.calls.length).toBe(loadsBefore);
    overview.mockRestore();
  });
});

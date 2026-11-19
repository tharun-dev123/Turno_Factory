import { fireEvent, screen, waitFor } from '@testing-library/react-native';

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

  describe('search bar with a filter button and a filter sheet', () => {
    // Seed data: dummy-001 is GREAT POWER 100 / Good, dummy-002 is EVE 230 / Good, dummy-010 is Damaged with no
    // manufacturer, dummy-020 has no manufacturer and is Under Review.
    const GP_GOOD = '02KCBE516100DHG702113060'; // dummy-001
    const EVE_GOOD = '02KCBE516100CHG702021596'; // dummy-002
    const DAMAGED = '02KCBE516100CHG702023904'; // dummy-010
    const NEWEST = '02KCBE516100CHG702023970'; // dummy-020

    async function openSheet() {
      await fireEvent.press(await screen.findByTestId('open-filters'));
      await screen.findByText('Filter Cells');
    }
    /** Choose a value inside the open sheet (the dropdown opens in place, then the option is tapped). */
    async function choose(filter: 'manufacturer' | 'status', option: string) {
      await fireEvent.press(await screen.findByTestId(`filter-${filter}`));
      await fireEvent.press(await screen.findByTestId(`filter-${filter}-${option}`));
    }
    async function apply() {
      await fireEvent.press(screen.getByTestId('filter-apply'));
      await waitFor(() => expect(screen.queryByText('Filter Cells')).toBeNull());
    }

    it('shows one search bar with a filter button beside it, and no permanent dropdowns', async () => {
      await renderScreen(<AllCellsScreen />);
      await screen.findByText(NEWEST);
      expect(screen.getByLabelText('Search cells')).toBeTruthy();
      expect(screen.getByLabelText('Filters')).toBeTruthy();
      expect(screen.queryByText('Filter Cells')).toBeNull();
      expect(screen.queryByTestId('filter-manufacturer')).toBeNull();
      expect(screen.queryByTestId('filter-status')).toBeNull();
    });

    it('opens a sheet with both dropdowns set to "all" and Reset / Apply Filters buttons', async () => {
      await renderScreen(<AllCellsScreen />);
      await screen.findByText(NEWEST);
      await openSheet();
      expect(screen.getByLabelText('Manufacturer: All manufacturers')).toBeTruthy();
      expect(screen.getByLabelText('Cell Status: All statuses')).toBeTruthy();
      expect(screen.getByText('Reset')).toBeTruthy();
      expect(screen.getByText('Apply Filters')).toBeTruthy();
    });

    it('offers the two manufacturers plus "Not set", and the four statuses', async () => {
      await renderScreen(<AllCellsScreen />);
      await openSheet();
      await fireEvent.press(screen.getByTestId('filter-manufacturer'));
      expect(screen.getByTestId('filter-manufacturer-GREAT POWER 100')).toBeTruthy();
      expect(screen.getByTestId('filter-manufacturer-EVE 230')).toBeTruthy();
      expect(screen.getByTestId('filter-manufacturer-none')).toBeTruthy();
      await fireEvent.press(screen.getByTestId('filter-status'));
      for (const name of ['Good', 'Damaged', 'Under Review', 'Rejected']) expect(screen.getByTestId(`filter-status-${name}`)).toBeTruthy();
    });

    it('does not change the list until Apply Filters is pressed', async () => {
      await renderScreen(<AllCellsScreen />);
      await screen.findByText(NEWEST);
      await openSheet();
      await choose('manufacturer', 'EVE 230');
      expect(screen.getByText(NEWEST)).toBeTruthy(); // still the full list behind the sheet
      await apply();
      expect(await screen.findByText(EVE_GOOD)).toBeTruthy();
      expect(screen.queryByText(NEWEST)).toBeNull();
    });

    it('filters by manufacturer, by "Not set", and by cell status', async () => {
      await renderScreen(<AllCellsScreen />);
      await screen.findByText(NEWEST);

      await openSheet();
      await choose('manufacturer', 'EVE 230');
      await apply();
      expect(await screen.findByText(EVE_GOOD)).toBeTruthy();
      expect(screen.queryByText(GP_GOOD)).toBeNull();

      await openSheet();
      await choose('manufacturer', 'none');
      await apply();
      expect(await screen.findByText(NEWEST)).toBeTruthy();
      expect(screen.queryByText(EVE_GOOD)).toBeNull();

      await openSheet();
      await choose('manufacturer', 'all');
      await choose('status', 'Damaged');
      await apply();
      expect(await screen.findByText(DAMAGED)).toBeTruthy();
      expect(screen.queryByText(NEWEST)).toBeNull();
    });

    it('keeps the filters active, shows how many are on, and remembers them when the sheet is reopened', async () => {
      await renderScreen(<AllCellsScreen />);
      await screen.findByText(NEWEST);
      await openSheet();
      await choose('status', 'Good');
      await choose('manufacturer', 'GREAT POWER 100');
      await apply();
      expect(await screen.findByText(GP_GOOD)).toBeTruthy();
      expect(screen.getByLabelText('Filters, 2 active')).toBeTruthy();

      await openSheet();
      expect(screen.getByLabelText('Manufacturer: GREAT POWER 100')).toBeTruthy();
      expect(screen.getByLabelText('Cell Status: Good')).toBeTruthy();
    });

    it('closing the sheet without applying keeps the filters that were already active', async () => {
      await renderScreen(<AllCellsScreen />);
      await screen.findByText(NEWEST);
      await openSheet();
      await choose('manufacturer', 'EVE 230');
      await apply();
      await screen.findByText(EVE_GOOD);

      await openSheet();
      await choose('manufacturer', 'GREAT POWER 100'); // a draft only
      await fireEvent.press(screen.getAllByLabelText('Close filters')[1]);
      await waitFor(() => expect(screen.queryByText('Filter Cells')).toBeNull());
      expect(screen.getByText(EVE_GOOD)).toBeTruthy();
      expect(screen.queryByText(GP_GOOD)).toBeNull();
      expect(screen.getByLabelText('Filters, 1 active')).toBeTruthy();
    });

    it('Reset clears both filters', async () => {
      await renderScreen(<AllCellsScreen />);
      await screen.findByText(NEWEST);
      await openSheet();
      await choose('manufacturer', 'EVE 230');
      await choose('status', 'Good');
      await apply();
      await screen.findByText(EVE_GOOD);

      await openSheet();
      await fireEvent.press(screen.getByTestId('filter-reset'));
      expect(await screen.findByText(NEWEST)).toBeTruthy();
      expect(screen.getByLabelText('Filters')).toBeTruthy();
      await openSheet();
      expect(screen.getByLabelText('Manufacturer: All manufacturers')).toBeTruthy();
      expect(screen.getByLabelText('Cell Status: All statuses')).toBeTruthy();
    });

    it('works together with the search text (all must match)', async () => {
      await renderScreen(<AllCellsScreen />);
      await screen.findByText(NEWEST);
      await openSheet();
      await choose('status', 'Good');
      await apply();
      await fireEvent.changeText(screen.getByLabelText('Search cells'), 'CHG702021596');
      expect(await screen.findByText(EVE_GOOD)).toBeTruthy();
      expect(screen.queryByText(GP_GOOD)).toBeNull();
      await fireEvent.changeText(screen.getByLabelText('Search cells'), 'ZZZ-NOPE');
      expect(await screen.findByText('No matching cells')).toBeTruthy();
    });

    it('shows a "no matching cells" state with a way to clear everything', async () => {
      await renderScreen(<AllCellsScreen />);
      await screen.findByText(NEWEST);
      await openSheet();
      await choose('status', 'Damaged');
      await choose('manufacturer', 'EVE 230'); // the Damaged cell has no manufacturer
      await apply();
      expect(await screen.findByText('No matching cells')).toBeTruthy();
      expect(screen.getByText('No cells match the selected filters.')).toBeTruthy();

      await fireEvent.press(screen.getByText('Clear search and filters'));
      expect(await screen.findByText(NEWEST)).toBeTruthy();
      expect(screen.getByLabelText('Filters')).toBeTruthy();
    });

    it('never reloads from the data source when filters are applied, and the stat cards keep counting all cells', async () => {
      const overview = jest.spyOn(cellService, 'getCellsOverview');
      await renderScreen(<AllCellsScreen />);
      await screen.findByText(NEWEST);
      const loadsBefore = overview.mock.calls.length;
      await openSheet();
      await choose('manufacturer', 'EVE 230');
      await apply();
      await screen.findByText(EVE_GOOD);
      expect(overview.mock.calls.length).toBe(loadsBefore);
      expect(screen.getByText('20')).toBeTruthy(); // Total Cells still counts every cell
      overview.mockRestore();
    });
  });
});

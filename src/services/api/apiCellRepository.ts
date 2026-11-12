import type { CellRecord, CreateCellInput, UpdateCellInput } from '@/models/cell';

import type { CellRepository } from '../contracts';
import { NotFoundError } from '../errors';
import { newRequestId } from '../requestId';
import type { ApiClient } from './httpClient';
import { toCellRecord, toCreatePayload, toUpdatePayload } from './mappers';
import type { ApiCell } from './types';

/** CellRepository backed by the Google Apps Script web app (Google Sheets storage). */
export function createApiCellRepository(client: ApiClient): CellRepository {
  return {
    async list(): Promise<CellRecord[]> {
      const data = await client.call<{ cells: ApiCell[] }>('cells.list', {}, { kind: 'read' });
      return data.cells.map(toCellRecord);
    },

    async getById(id: string): Promise<CellRecord | null> {
      try {
        const data = await client.call<{ cell: ApiCell }>('cells.get', { id }, { kind: 'read' });
        return toCellRecord(data.cell);
      } catch (error) {
        if (error instanceof NotFoundError) return null;
        throw error;
      }
    },

    async findByBarcode(barcode: string): Promise<CellRecord | null> {
      const data = await client.call<{ cell: ApiCell | null }>('cells.findByBarcode', { barcode }, { kind: 'read' });
      return data.cell ? toCellRecord(data.cell) : null;
    },

    async create(input: CreateCellInput): Promise<CellRecord> {
      const requestId = input.requestId ?? newRequestId();
      const data = await client.call<{ cell: ApiCell }>('cells.create', toCreatePayload(input), { kind: 'write', requestId });
      return toCellRecord(data.cell);
    },

    async update(id: string, input: UpdateCellInput): Promise<CellRecord> {
      const requestId = input.requestId ?? newRequestId();
      const data = await client.call<{ cell: ApiCell }>('cells.update', toUpdatePayload(id, input), { kind: 'write', requestId });
      return toCellRecord(data.cell);
    },

    async remove(id: string, requestId?: string): Promise<void> {
      await client.call<{ deleted: boolean }>('cells.delete', { id }, { kind: 'write', requestId: requestId ?? newRequestId() });
    },
  };
}

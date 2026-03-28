/**
 * Подключение к реальному Temporal (dev server / docker).
 * В обычном CI не запускается — только в workflow `ci-optional.yml` при TEMPORAL_E2E=1.
 */

import { describe, it, expect } from 'vitest';
import { Connection } from '@temporalio/client';

const run = process.env.TEMPORAL_E2E === '1';

describe.skipIf(!run)('Temporal server E2E (connection)', () => {
  it('accepts gRPC connection on TEMPORAL_ADDRESS', async () => {
    const address = process.env.TEMPORAL_ADDRESS || '127.0.0.1:7233';
    const connection = await Connection.connect({ address });
    expect(connection).toBeDefined();
    await connection.close();
  });
});

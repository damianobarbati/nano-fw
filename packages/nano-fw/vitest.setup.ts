import { it } from 'vitest';
import { createDatabase } from './src/database/index.ts';
import { trxContext } from './src/database/Repository.ts';

export const database = createDatabase({ connectionString: 'postgres://user:password@localhost:5432/nano-fw' });

it.aroundAll(async (runSuite) => {
  try {
    await runSuite();
  } finally {
    await database.destroy();
  }
});

it.aroundEach(async (runTest) => {
  const transaction = await database.transaction();

  try {
    await trxContext.run(transaction, runTest);
  } finally {
    await transaction.rollback();
  }
});

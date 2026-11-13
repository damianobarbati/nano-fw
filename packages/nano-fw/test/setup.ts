import { it } from 'vitest';
import { trxContext } from '../src/database/Repository.ts';
import { database } from './database.ts';

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

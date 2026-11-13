import { AsyncLocalStorage } from 'node:async_hooks';
import type { Knex } from 'knex';
import { AppError } from '../AppError.ts';

type RepositoryConfiguration = { database: Knex; tableName: string; viewName?: string; uniqueSortColumn?: string };

export const trxContext = new AsyncLocalStorage<Knex.Transaction>();

export type RawCondition = string | { sql: string; bindings: readonly Knex.RawBinding[] };

type ColumnName<Row> = Extract<keyof Row, string>;

type EqualityWhere<Row> = {
  [Key in ColumnName<Row> as `${Key}$${'eq' | 'neq'}`]?: Row[Key] | null;
};

type ComparisonWhere<Row> = {
  [Key in ColumnName<Row> as `${Key}$${'gte' | 'lte' | 'gt' | 'lt'}`]?: Row[Key];
};

type MembershipWhere<Row> = {
  [Key in ColumnName<Row> as `${Key}$${'in' | 'nin'}`]?: readonly Row[Key][];
};

type StringWhere<Row> = {
  [Key in ColumnName<Row> as NonNullable<Row[Key]> extends string ? `${Key}$${'like' | 'ilike'}` : never]?: string;
};

type ArrayWhere<Row> = {
  [Key in ColumnName<Row> as NonNullable<Row[Key]> extends readonly unknown[] ? `${Key}$has` : never]?: NonNullable<
    Row[Key]
  > extends readonly (infer Item)[]
    ? Item
    : never;
};

export type RepositoryWhere<Row> = Partial<Row> &
  EqualityWhere<Row> &
  ComparisonWhere<Row> &
  MembershipWhere<Row> &
  StringWhere<Row> &
  ArrayWhere<Row> & { [Key in `_raw$${string}`]?: RawCondition };

export type getemParamsDefault<Row = Record<string, unknown>> = RepositoryWhere<Row> & {
  sort?: [string, 'desc' | 'asc'][];
  limit?: number;
  offset?: number;
};

export type UpsertOptions<Row, Update = Partial<Row>> = {
  onConflict: [ColumnName<Row>, ...ColumnName<Row>[]];
  merge?: Update;
  where?: RepositoryWhere<Row>;
};

export type ID = number | string | { id: number | string };

const normalizeId = (id: ID): number | string => (typeof id === 'object' ? id.id : id);

type getemQueryResult<ResourceRow extends { id: ID }> =
  | { type: 'query'; query: Knex.QueryBuilder<ResourceRow, ResourceRow[]> }
  | { type: 'raw'; sql: string; bindings: Record<string, Knex.RawBinding> | Knex.RawBinding[] };

export default class Repository<
  ResourceRow extends { id: ID } = { id: ID } & Record<string, unknown>,
  Resource = ResourceRow,
  ResourceRowInsert = Omit<Partial<ResourceRow>, 'id' | 'created_at' | 'updated_at'>,
  ResourceRowUpdate = Partial<ResourceRowInsert>,
> {
  public configuration: RepositoryConfiguration;

  constructor(configuration: RepositoryConfiguration) {
    this.configuration = { uniqueSortColumn: 'id', ...configuration };
  }

  get db(): Knex | Knex.Transaction {
    const trx = trxContext.getStore();
    return trx ?? this.configuration.database;
  }

  async runInTransaction<T>(fn: (trx: Knex.Transaction) => Promise<T>): Promise<T> {
    const db = this.db;
    return db.transaction(async (trx) => {
      return trxContext.run(trx, () => fn(trx));
    });
  }

  get tableOrView(): string {
    return this.configuration.viewName || this.configuration.tableName;
  }

  async get(idlike: ID, plain?: false): Promise<Resource>;
  async get(idlike: ID, plain?: true): Promise<ResourceRow>;
  async get(idlike: ID, plain = false): Promise<Resource | ResourceRow> {
    const where = { id: normalizeId(idlike) } as RepositoryWhere<ResourceRow>;
    return plain ? this.getBy(where, true) : this.getBy(where, false);
  }

  async getBy(input: RepositoryWhere<ResourceRow>, plain?: false): Promise<Resource>;
  async getBy(input: RepositoryWhere<ResourceRow>, plain?: true): Promise<ResourceRow>;
  async getBy(input: RepositoryWhere<ResourceRow>, plain = false): Promise<Resource | ResourceRow> {
    const result = await this.findOne(input, plain);
    if (result === null) throw new AppError(404, 'RESOURCE_NOT_FOUND');
    return result;
  }

  async findBy(input: RepositoryWhere<ResourceRow>, plain?: false): Promise<Resource | null>;
  async findBy(input: RepositoryWhere<ResourceRow>, plain?: true): Promise<ResourceRow | null>;
  async findBy(input: RepositoryWhere<ResourceRow>, plain = false): Promise<Resource | ResourceRow | null> {
    return this.findOne(input, plain);
  }

  private async findOne(input: RepositoryWhere<ResourceRow>, plain: boolean): Promise<Resource | ResourceRow | null> {
    const query = this.db(this.tableOrView);

    Repository.applyWhereWithOperators(query, input);
    await this.police(query, 'select');

    const row = (await query.first()) as ResourceRow | undefined;
    if (!row) return null;

    const [result] = await this.applyHydration([row], plain);
    return result;
  }

  async exists(input: RepositoryWhere<ResourceRow>): Promise<boolean> {
    const query = this.db(this.tableOrView).select('id');

    Repository.applyWhereWithOperators(query, input);
    await this.police(query, 'select');

    const row = (await query.first()) as ResourceRow | undefined;
    return Boolean(row);
  }

  async create(input: ResourceRowInsert, plain?: false): Promise<Resource>;
  async create(input: ResourceRowInsert, plain?: true): Promise<ResourceRow>;
  async create(input: ResourceRowInsert[], plain?: false): Promise<Resource[]>;
  async create(input: ResourceRowInsert[], plain?: true): Promise<ResourceRow[]>;
  async create(
    input: ResourceRowInsert | ResourceRowInsert[],
    plain?: boolean,
  ): Promise<Resource | ResourceRow | Resource[] | ResourceRow[]>;
  async create(
    input: ResourceRowInsert | ResourceRowInsert[],
    plain = false,
  ): Promise<Resource | ResourceRow | Resource[] | ResourceRow[]> {
    const isArray = Array.isArray(input);
    if (isArray && input.length === 0) return [];

    let rows: ResourceRow[];

    if (!this.configuration.viewName) {
      rows = await this.insertRows(input);
    } else {
      const insertedRows = await this.insertRows(input, 'id');
      const ids = insertedRows.map((row) => normalizeId(row.id));
      const viewRows = (await this.db(this.configuration.viewName).select().whereIn('id', ids)) as ResourceRow[];
      const rowMap = new Map(viewRows.map((row) => [normalizeId(row.id), row]));

      rows = ids.map((id) => rowMap.get(id)).filter(Boolean) as ResourceRow[];

      if (rows.length !== insertedRows.length) throw new AppError(422, 'RESOURCE_NOT_FOUND_IN_VIEW'); // the view is probably dependent on a row that will be created after this one
    }

    const results = await this.applyHydration(rows, plain);
    return isArray ? results : results[0];
  }

  async createRaw(input: ResourceRowInsert): Promise<ResourceRow>;
  async createRaw(input: ResourceRowInsert[]): Promise<ResourceRow[]>;
  async createRaw(input: ResourceRowInsert | ResourceRowInsert[]): Promise<ResourceRow | ResourceRow[]> {
    const rows = await this.insertRows(input);
    return Array.isArray(input) ? rows : rows[0];
  }

  private async insertRows(
    input: ResourceRowInsert | ResourceRowInsert[],
    columns: '*' | 'id' = '*',
  ): Promise<ResourceRow[]> {
    if (Array.isArray(input) && input.length === 0) return [];
    return (await this.db(this.configuration.tableName).insert(input).returning(columns)) as ResourceRow[];
  }

  async update(idlike: ID, input: ResourceRowUpdate): Promise<Resource> {
    const id = normalizeId(idlike);
    const query = this.db(this.configuration.tableName).where({ id });

    await this.police(query, 'update');

    const [row] = await query.update(input).returning('*');
    if (!row) throw new AppError(404, 'RESOURCE_NOT_FOUND');
    return this.get(row.id, false);
  }

  async updateBy(input: ResourceRowUpdate, where: RepositoryWhere<ResourceRow>, plain?: false): Promise<Resource[]>;
  async updateBy(input: ResourceRowUpdate, where: RepositoryWhere<ResourceRow>, plain?: true): Promise<ResourceRow[]>;
  async updateBy(
    input: ResourceRowUpdate,
    where: RepositoryWhere<ResourceRow>,
    plain = false,
  ): Promise<Resource[] | ResourceRow[]> {
    const query = this.db(this.configuration.tableName);

    Repository.applyWhereWithOperators(query, where);
    await this.police(query, 'update');

    const rows = await query.update(input).returning('*');
    const result = await this.applyHydration(rows, plain);
    return result;
  }

  async remove(idlike: ID): Promise<boolean> {
    return this.removeBy({ id: normalizeId(idlike) } as RepositoryWhere<ResourceRow>);
  }

  async removeBy(where: RepositoryWhere<ResourceRow>): Promise<boolean> {
    const query = this.db(this.configuration.tableName);

    Repository.applyWhereWithOperators(query, where);
    await this.police(query, 'delete');

    const count = await query.delete();
    return count > 0;
  }

  async lockBy(where: RepositoryWhere<ResourceRow>): Promise<boolean> {
    if (!trxContext.getStore()) throw new AppError(500, 'TRANSACTION_REQUIRED');

    const query = this.db(this.configuration.tableName).select('id');

    Repository.applyWhereWithOperators(query, where);
    await this.police(query, 'select');

    const rows = await query.forUpdate();
    return rows.length > 0;
  }

  async insertIgnore(
    input: ResourceRowInsert,
    onConflict: [ColumnName<ResourceRow>, ...ColumnName<ResourceRow>[]],
  ): Promise<boolean> {
    this.validateConflictColumns(onConflict);

    const rows = await this.db(this.configuration.tableName)
      .insert(input)
      .onConflict(onConflict)
      .ignore()
      .returning('id');

    return rows.length > 0;
  }

  async upsert(
    input: ResourceRowInsert,
    options: UpsertOptions<ResourceRow, ResourceRowUpdate>,
  ): Promise<ResourceRow | null> {
    const { onConflict, where } = options;

    this.validateConflictColumns(onConflict);

    const merge =
      options.merge ??
      Object.fromEntries(
        Object.entries(input as object).filter(([key]) => !onConflict.includes(key as ColumnName<ResourceRow>)),
      );

    const conflict = this.db(this.configuration.tableName).insert(input).onConflict(onConflict);
    const hasUpdates = Object.keys(merge as object).length > 0;
    const query = hasUpdates ? conflict.merge(merge) : conflict.ignore();

    if (where) {
      // Validate filters even when there is no update to perform.
      const filterQuery = hasUpdates ? query : this.db.queryBuilder();

      Repository.applyWhereWithOperators(filterQuery, where, this.configuration.tableName);
    }

    const [row] = await query.returning('*');
    return (row as ResourceRow | undefined) ?? null;
  }

  private validateConflictColumns(columns: readonly string[]): void {
    if (
      !Array.isArray(columns) ||
      columns.length === 0 ||
      columns.some((column) => typeof column !== 'string' || column.length === 0)
    ) {
      throw new AppError(400, 'INVALID_CONFLICT_COLUMNS');
    }
  }

  static applyWhereWithOperators(query: Knex.QueryBuilder, wheres: Record<string, unknown>, tableName?: string): void {
    const operators: Record<string, (col: string, val: any) => void> = {
      eq: (c, v) => (v === null ? query.whereNull(c) : query.where(c, v)),
      neq: (c, v) => (v === null ? query.whereNotNull(c) : query.whereNot(c, v)),
      in: (c, v) => query.whereIn(c, v),
      nin: (c, v) => query.whereNotIn(c, v),
      gte: (c, v) => query.where(c, '>=', v),
      lte: (c, v) => query.where(c, '<=', v),
      gt: (c, v) => query.where(c, '>', v),
      lt: (c, v) => query.where(c, '<', v),
      like: (c, v) => query.where(c, 'like', `%${v}%`),
      ilike: (c, v) => query.where(c, 'ilike', `%${v}%`),
      has: (c, v) => query.whereRaw('? = ANY(??)', [v, c]),
    };

    for (const [key, value] of Object.entries(wheres)) {
      if (value === undefined) throw new AppError(400, 'INVALID_WHERE');

      if (key.startsWith('_raw$')) {
        const raw = typeof value === 'string' ? { sql: value, bindings: [] } : value;

        if (
          !raw ||
          typeof raw !== 'object' ||
          !('sql' in raw) ||
          typeof raw.sql !== 'string' ||
          !raw.sql.trim() ||
          !('bindings' in raw) ||
          !Array.isArray(raw.bindings)
        ) {
          throw new AppError(400, 'INVALID_WHERE');
        }

        const { sql, bindings } = raw;

        query.where(function () {
          this.whereRaw(sql, bindings);
        });

        continue;
      }

      const [column, op = 'eq', extra] = key.split('$');

      if (!column || extra !== undefined || !Object.hasOwn(operators, op))
        throw new AppError(400, 'INVALID_WHERE_OPERATOR');

      if ((op === 'in' || op === 'nin') && !Array.isArray(value)) throw new AppError(400, 'INVALID_WHERE');
      operators[op](tableName ? `${tableName}.${column}` : column, value);
    }
  }

  async getemQuery(params: getemParamsDefault<ResourceRow> = {}): Promise<getemQueryResult<ResourceRow>> {
    const query = this.db(this.tableOrView).select('*') as Knex.QueryBuilder<ResourceRow, ResourceRow[]>;
    const { sort: _sort, limit: _limit, offset: _offset, ...wheres } = params;

    Repository.applyWhereWithOperators(query, wheres);
    await this.police(query, 'select');
    return { type: 'query', query };
  }

  async getem(params?: getemParamsDefault<ResourceRow>, plain?: false): Promise<Resource[]>;
  async getem(params?: getemParamsDefault<ResourceRow>, plain?: true): Promise<ResourceRow[]>;
  async getem(params: getemParamsDefault<ResourceRow> = {}, plain = false): Promise<Resource[] | ResourceRow[]> {
    for (const value of [params.limit, params.offset]) {
      if (value !== undefined && (!Number.isSafeInteger(value) || value < 0))
        throw new AppError(400, 'INVALID_PAGINATION');
    }

    let rows: ResourceRow[];
    const result = await this.getemQuery(params);

    if (result.type === 'raw') {
      const rawResult = await this.db.raw<{ rows: ResourceRow[] }>(result.sql, result.bindings ?? {});

      rows = rawResult.rows;
    } else {
      const { query } = result;
      const { sort = [[this.configuration.uniqueSortColumn, 'asc']], limit, offset } = params;

      for (const [col, dir] of sort) query.orderBy(col as any, dir);

      if (limit !== undefined) query.limit(limit);

      if (offset !== undefined) query.offset(offset);
      rows = (await query) as ResourceRow[];
    }

    return this.applyHydration(rows, plain);
  }

  async count(params: getemParamsDefault<ResourceRow> = {}): Promise<number> {
    const result = await this.getemQuery(params);

    if (result.type === 'raw') {
      const { rows } = await this.db.raw(`select count(*) as count from (${result.sql}) as q`, result.bindings);
      return Number(rows[0]?.count ?? 0);
    }

    const res = await result.query.clearSelect().clearOrder().count({ count: '*' }).first();
    return Number(res?.count ?? 0);
  }

  private async applyHydration<T extends boolean>(
    rows: ResourceRow[],
    plain: T,
  ): Promise<T extends true ? ResourceRow[] : Resource[]> {
    if (plain) return rows as any;
    return (await this.hydrate(rows)) as any;
  }

  async hydrate(rows: ResourceRow[]): Promise<Resource[]> {
    return rows as unknown as Resource[];
  }

  async police(_query: Knex.QueryBuilder, _action: 'select' | 'update' | 'delete'): Promise<void> {}
}

import { AsyncLocalStorage } from 'node:async_hooks';
import type { Knex } from 'knex';
import { AppError } from '#framework/AppError.ts';

type RepositoryConfiguration = {
  database: Knex;
  tableName: string;
  viewName?: string;
  uniqueSortColumn?: string;
};

export const trxContext = new AsyncLocalStorage<Knex.Transaction>();

export type getemParamsDefault = Record<string, any> & {
  sort?: [string, 'desc' | 'asc'][];
  limit?: number;
  offset?: number;
};

export type ID = number | string | { id: number | string };

type getemQueryResult<ResourceRow extends { id: ID }> =
  | { type: 'query'; query: Knex.QueryBuilder<ResourceRow, ResourceRow[]> }
  | { type: 'raw'; sql: string; bindings: Record<string, any> | any[] };

export default class Repository<
  ResourceRow extends { id: ID } = { id: ID } & Record<string, any>,
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
    const id = typeof idlike === 'object' ? idlike.id : idlike;
    const query = this.db(this.tableOrView).where({ id }).first();
    await this.police(query, 'select');
    const row = (await query) as ResourceRow | undefined;
    if (!row) throw new AppError(404, 'RESOURCE_NOT_FOUND');
    const [result] = await this.applyHydration([row], plain);
    return result;
  }

  async getBy(input: Partial<ResourceRow>, plain?: false): Promise<Resource>;
  async getBy(input: Partial<ResourceRow>, plain?: true): Promise<ResourceRow>;
  async getBy(input: Partial<ResourceRow>, plain = false): Promise<Resource | ResourceRow> {
    const query = this.db<ResourceRow>(this.tableOrView).where(input);
    await this.police(query, 'select');
    const row = (await query.first()) as ResourceRow | undefined;
    if (!row) throw new AppError(404, 'RESOURCE_NOT_FOUND');
    const [result] = await this.applyHydration([row], plain);
    return result;
  }

  async findBy(input: Partial<ResourceRow>, plain?: false): Promise<Resource | null>;
  async findBy(input: Partial<ResourceRow>, plain?: true): Promise<ResourceRow | null>;
  async findBy(input: Partial<ResourceRow>, plain = false): Promise<Resource | ResourceRow | null> {
    const query = this.db(this.tableOrView).where(input);
    await this.police(query, 'select');
    const row = (await query.first()) as ResourceRow | undefined;
    if (!row) return null;
    const [result] = await this.applyHydration([row], plain);
    return result;
  }

  async exists(input: Partial<ResourceRow>): Promise<boolean> {
    const query = this.db(this.tableOrView).select('id').where(input);
    await this.police(query, 'select');
    const row = (await query.first()) as ResourceRow | undefined;
    return Boolean(row);
  }

  async create(input: ResourceRowInsert, plain?: false): Promise<Resource>;
  async create(input: ResourceRowInsert, plain?: true): Promise<ResourceRow>;
  async create(input: ResourceRowInsert[], plain?: false): Promise<Resource[]>;
  async create(input: ResourceRowInsert[], plain?: true): Promise<ResourceRow[]>;
  async create(input: ResourceRowInsert | ResourceRowInsert[], plain?: boolean): Promise<Resource | ResourceRow | Resource[] | ResourceRow[]>;
  async create(input: ResourceRowInsert | ResourceRowInsert[], plain = false): Promise<Resource | ResourceRow | Resource[] | ResourceRow[]> {
    const isArray = Array.isArray(input);
    if (isArray && input.length === 0) return [];

    let rows: ResourceRow[];

    if (!this.configuration.viewName) {
      rows = (await this.db(this.configuration.tableName).insert(input).returning('*')) as ResourceRow[];
    } else {
      const insertedRows = (await this.db(this.configuration.tableName).insert(input).returning(['id'])) as { id: ID }[];
      const ids = insertedRows.map((r) => (typeof r.id === 'object' ? r.id.id : r.id));
      const viewRows = (await this.db(this.configuration.viewName).select().whereIn('id', ids)) as ResourceRow[];
      const rowMap = new Map(viewRows.map((row) => [typeof row.id === 'object' ? row.id.id : row.id, row]));
      rows = ids.map((id) => rowMap.get(id)).filter(Boolean) as ResourceRow[];
      if (rows.length !== insertedRows.length) throw new AppError(422, 'RESOURCE_NOT_FOUND_IN_VIEW'); // the view is probably dependent on a row that will be created after this one
    }
    const results = await this.applyHydration(rows, plain);
    return isArray ? results : results[0];
  }

  async createRaw(input: ResourceRowInsert): Promise<ResourceRow>;
  async createRaw(input: ResourceRowInsert[]): Promise<ResourceRow[]>;
  async createRaw(input: ResourceRowInsert | ResourceRowInsert[]): Promise<ResourceRow | ResourceRow[]> {
    const rows = await this.db(this.configuration.tableName).insert(input).returning<ResourceRow[]>('*');
    const result = Array.isArray(input) ? (rows as ResourceRow[]) : (rows[0] as ResourceRow);
    return result;
  }

  async update(idlike: ID, input: ResourceRowUpdate): Promise<Resource> {
    const id = typeof idlike === 'object' ? idlike.id : idlike;
    const query = this.db(this.configuration.tableName).where({ id });
    await this.police(query, 'update');
    const [row] = await query.update(input).returning('*');
    if (!row) throw new AppError(404, 'RESOURCE_NOT_FOUND');
    return this.get(row.id, false);
  }

  async updateBy(input: Partial<ResourceRow>, where: Partial<ResourceRow>, plain?: false): Promise<Resource[] | null>;
  async updateBy(input: Partial<ResourceRow>, where: Partial<ResourceRow>, plain?: true): Promise<ResourceRow[] | null>;
  async updateBy(input: Partial<ResourceRow>, where: Partial<ResourceRow>, plain = false): Promise<Resource[] | ResourceRow[] | null> {
    const query = this.db(this.configuration.tableName).where(where);
    await this.police(query, 'update');
    const rows = await query.update(input).returning('*');
    const result = await this.applyHydration(rows, plain);
    return result;
  }

  async remove(idlike: ID): Promise<boolean> {
    const id = typeof idlike === 'object' ? idlike.id : idlike;
    const query = this.db(this.configuration.tableName).where({ id });
    await this.police(query, 'delete');
    const deletedRows = await query.delete().returning('id');
    return deletedRows.length > 0;
  }

  static applyWhereWithOperators(query: Knex.QueryBuilder, wheres: Record<string, any>) {
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
      if (value === undefined || (Array.isArray(value) && value.length === 0)) continue;
      const [column, op = 'eq'] = key.split('$');
      operators[op]?.(column, value);
    }
  }

  async getemQuery(params: getemParamsDefault = {}): Promise<getemQueryResult<ResourceRow>> {
    const query = this.db(this.tableOrView).select('*') as Knex.QueryBuilder<ResourceRow, ResourceRow[]>;
    const { sort: _sort, limit: _limit, offset: _offset, ...wheres } = params;
    Repository.applyWhereWithOperators(query, wheres);
    await this.police(query, 'select');
    return { type: 'query', query };
  }

  async getem(params?: getemParamsDefault, plain?: false): Promise<Resource[]>;
  async getem(params?: getemParamsDefault, plain?: true): Promise<ResourceRow[]>;
  async getem(params: getemParamsDefault = {}, plain = false): Promise<Resource[] | ResourceRow[]> {
    let rows: ResourceRow[];
    const result = await this.getemQuery(params);

    if (result.type === 'raw') {
      const rawResult = await this.db.raw<{ rows: ResourceRow[] }>(result.sql, result.bindings ?? {});
      rows = rawResult.rows;
    } else {
      const { query } = result;
      const { sort = [[this.configuration.uniqueSortColumn, 'asc']], limit, offset } = params;
      for (const [col, dir] of sort) query.orderBy(col as any, dir);
      if (limit) query.limit(limit);
      if (offset) query.offset(offset);
      rows = (await query) as ResourceRow[];
    }

    return this.applyHydration(rows, plain);
  }

  async count(params: getemParamsDefault = {}): Promise<number> {
    const result = await this.getemQuery(params);

    if (result.type === 'raw') {
      const { rows } = await this.db.raw(`select count(*) as count from (${result.sql}) as q`, result.bindings);
      return Number(rows[0]?.count ?? 0);
    }

    const res = await result.query.clearSelect().clearOrder().count({ count: '*' }).first();
    return Number(res?.count ?? 0);
  }

  async applyHydration<T extends boolean>(rows: ResourceRow[], plain: T): Promise<T extends true ? ResourceRow[] : Resource[]> {
    if (plain) return rows as any;
    return (await this.hydrate(rows)) as any;
  }

  async hydrate(rows: ResourceRow[]): Promise<Resource[]> {
    return rows as unknown as Resource[];
  }

  async police(query: Knex.QueryBuilder, _action: 'select' | 'update' | 'delete'): Promise<Knex.QueryBuilder> {
    return query;
  }
}

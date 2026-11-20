export const RepositoryDetails = () => (
  <>
    <h5 className="font-heading mt-6" id="methods">
      Methods
    </h5>
    <div className="overflow-x-auto">
      <table className="w-full">
        <tbody>
          <tr>
            <th>Method</th>
            <th>Result</th>
          </tr>
          <tr>
            <td>
              <code>get(id)</code>
            </td>
            <td>
              Resource by ID; throws <code>404</code> if absent.
            </td>
          </tr>
          <tr>
            <td>
              <code>getBy(where)</code>
            </td>
            <td>
              First match; throws <code>404</code> if absent.
            </td>
          </tr>
          <tr>
            <td>
              <code>findBy(where)</code>
            </td>
            <td>
              First match or <code>null</code>.
            </td>
          </tr>
          <tr>
            <td>
              <code>exists(where)</code>
            </td>
            <td>Whether a matching row exists.</td>
          </tr>
          <tr>
            <td>
              <code>getem(params?)</code>
            </td>
            <td>Resources with filters, sorting, and pagination.</td>
          </tr>
          <tr>
            <td>
              <code>count(params?)</code>
            </td>
            <td>Match count without sorting or pagination.</td>
          </tr>
          <tr>
            <td>
              <code>create(input)</code>
            </td>
            <td>Created resource, or an array when input is an array.</td>
          </tr>
          <tr>
            <td>
              <code>createRaw(input)</code>
            </td>
            <td>Inserted table rows without hydration or view lookup.</td>
          </tr>
          <tr>
            <td>
              <code>update(id, input)</code>
            </td>
            <td>
              Updated resource; throws <code>404</code> if absent.
            </td>
          </tr>
          <tr>
            <td>
              <code>updateBy(input, where)</code>
            </td>
            <td>Updated resources.</td>
          </tr>
          <tr>
            <td>
              <code>remove(id)</code> / <code>removeBy(where)</code>
            </td>
            <td>Whether rows were deleted.</td>
          </tr>
          <tr>
            <td>
              <code>insertIgnore(input, onConflict)</code>
            </td>
            <td>Whether a row was inserted; ignores conflicts.</td>
          </tr>
          <tr>
            <td>
              <code>upsert(input, options)</code>
            </td>
            <td>
              Inserted or updated raw row, or <code>null</code> when no row changes.
            </td>
          </tr>
          <tr>
            <td>
              <code>lockBy(where)</code>
            </td>
            <td>Lock matching rows inside a transaction; return whether rows match.</td>
          </tr>
          <tr>
            <td>
              <code>runInTransaction(fn)</code>
            </td>
            <td>Commit on success and roll back on error.</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p>
      Empty filters match all rows, including for <code>updateBy</code> and <code>removeBy</code>.
    </p>
    <h5 className="font-heading mt-6" id="hydrate-rows">
      Hydration
    </h5>
    <p>
      Override <code>hydrate(rows)</code> to enrich a batch of rows. Return one resource for each row in input order.
      Use <code>this.db</code> to load related rows in a single query. Calling <code>get</code> or <code>getem</code>
      inside the hook invokes hydration again. Filters and sorting apply to database columns before hydration. With a
      configured view, a plain read still returns a view row.
    </p>
    <h5 className="font-heading mt-6" id="transactions-and-custom-repositories">
      Transactions and custom repositories
    </h5>
    <p>
      Calls inside <code>runInTransaction</code> share the transaction across repository instances. Use{' '}
      <code>lockBy</code> in the callback to lock rows until the transaction finishes.
    </p>
    <div className="overflow-x-auto">
      <table className="w-full">
        <tbody>
          <tr>
            <th>Member</th>
            <th>Purpose</th>
          </tr>
          <tr>
            <td>
              <code>db</code>
            </td>
            <td>Current transaction or configured Knex client. Use it for custom queries.</td>
          </tr>
          <tr>
            <td>
              <code>tableOrView</code>
            </td>
            <td>Configured read table or view.</td>
          </tr>
          <tr>
            <td>
              <code>hydrate(rows)</code>
            </td>
            <td>Transform rows into resources.</td>
          </tr>
          <tr>
            <td>
              <code>police(query, action)</code>
            </td>
            <td>Restrict reads, updates, and deletes.</td>
          </tr>
          <tr>
            <td>
              <code>getemQuery(params)</code>
            </td>
            <td>
              Customize the query used by <code>getem</code> and <code>count</code>.
            </td>
          </tr>
          <tr>
            <td>
              <code>Repository.applyWhereWithOperators(query, where, tableName?)</code>
            </td>
            <td>Apply repository filters to a Knex query.</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p>
      <code>get</code>, <code>getBy</code>, <code>findBy</code>, <code>getem</code>, <code>create</code>, and{' '}
      <code>updateBy</code> accept <code>true</code> as their final argument to skip hydration. <code>createRaw</code>,{' '}
      <code>upsert</code>, and <code>insertIgnore</code> also bypass hydration.
    </p>
  </>
);

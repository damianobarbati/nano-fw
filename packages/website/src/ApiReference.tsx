import { Code } from 'nano-ux';
import { RepositoryDetails } from './RepositoryDetails.tsx';

const meta = `{
  section: 'Items',
  visibility: 'public',
  description: 'Return the requested item ID.',
  responseDescription: 'The validated item ID.',
  responses: {
    400: { description: 'Invalid item ID.', schema: ValidationErrorSchema },
  },
}`;

const routeOptions = `{
  method: 'get',
  path: '/items/:id',
  requestSchema: z.object({ id: z.coerce.number().int().positive().meta({ param: { in: 'path' } }) }),
  responseSchema: z.object({ id: z.number() }),
  meta: ${meta.replaceAll('\n', '\n  ')},
  middlewares: [logger()],
  handler: ({ id }: { id: number }, context: Context) => {
    context.header('Cache-Control', 'no-store');
    return { id };
  },
}`;

const routeImports = `import { type Context, Hono } from 'hono';
import { logger } from 'hono/logger';
import { z } from 'zod';`;

const scalarOptions = `{
  theme: 'moon',
  layout: 'modern',
  forceDarkModeState: 'dark',
  hideDarkModeToggle: true,
  hideClientButton: true,
  hideTestRequestButton: false,
  customCss: ':root { --scalar-font: system-ui; }',
}`;

const docsOptions = `{
  title: 'Items API',
  docsAssets: './docs-assets',
  errors: { ITEM_NOT_FOUND: new ApplicationError(404, 'ITEM_NOT_FOUND', 'Item not found.') },
  errorSchema: ApplicationErrorSchema,
  tagOrder: ['Items', 'Accounts'],
  logoUrl: '/logo.svg',
  faviconUrl: '/favicon.svg',
  scalarOptions: ${scalarOptions.replaceAll('\n', '\n  ')},
  transformOpenapiDocument: ({ document, request }) => ({
    ...document,
    servers: [{ url: new URL(request.url).origin }],
  }),
}`;

const exportPrefixes = {
  Function: 'fn',
  'Hono error handler': 'fn',
  Type: 'type',
  Class: 'class',
  'Zod schema': 'schema',
};

type ReferenceEntry = { name: string; kind: keyof typeof exportPrefixes; description: string; anchor?: string } & (
  | { example: string; fields?: never }
  | { fields: [property: string, type: string, required: string, description: string][]; example?: never }
);

const routing: ReferenceEntry[] = [
  {
    name: 'route',
    anchor: 'route-reference',
    kind: 'Function',
    description:
      'Register a Hono endpoint and its OpenAPI operation. Middleware runs before input validation. The response schema validates the handler result.',
    example: `${routeImports}
import { route, ValidationErrorSchema } from 'nano-fw';

const app = new Hono();
route(app, ${routeOptions});`,
  },
  {
    name: 'RouteOptions',
    kind: 'Type',
    description:
      'The generic arguments describe parsed input and handler output. Matching path fields become required OpenAPI parameters. Other fields default to query on GET and body on other methods. Use param metadata to select a source, such as a named header or cookie. Coerce numeric path and query strings in the schema.',
    fields: [
      ['method', 'HTTPMethod', 'Yes', 'HTTP method to register.'],
      ['path', 'string', 'Yes', 'Hono route path, such as /items/:id.'],
      [
        'requestSchema',
        '$ZodType<TReq>',
        'No',
        'Parses JSON body, query, then path fields. Later values take precedence. Middleware can supply auth_params to replace the collected input. Omit the schema for an empty object.',
      ],
      ['responseSchema', '$ZodType<TRes>', 'Yes', 'Validates the handler result before sending JSON.'],
      ['middlewares', 'MiddlewareHandler[]', 'No', 'Run in array order before validation.'],
      ['meta', 'RouteMeta', 'No', 'Describes the OpenAPI operation.'],
      [
        'handler',
        '(params, context: Context) => TRes | Promise<TRes>',
        'Yes',
        'Receives parsed parameters and the Hono context.',
      ],
    ],
  },
  {
    name: 'HTTPMethod',
    kind: 'Type',
    description: 'Select one of the five lowercase methods accepted by route.',
    example: `import type { HTTPMethod } from 'nano-fw';

const methods: HTTPMethod[] = ['get', 'post', 'put', 'patch', 'delete'];`,
  },
  {
    name: 'RouteMeta',
    kind: 'Type',
    description:
      'Describe an operation, its tags and its responses in OpenAPI. The visibility field adds a public or private tag. Access control belongs in your route or middleware.',
    fields: [
      ['section', 'string', 'No', 'Groups operations under an OpenAPI tag.'],
      ['visibility', "'public' | 'private'", 'No', 'Adds a visibility tag to the operation.'],
      ['description', 'string', 'No', 'Describes the operation.'],
      ['responseDescription', 'string', 'No', 'Describes the default 200 response.'],
      [
        'responses',
        'Record<string, { description: string; schema: $ZodType }>',
        'No',
        'Documents a response for each supplied HTTP status.',
      ],
    ],
  },
  {
    name: 'routeDocs',
    anchor: 'api-docs',
    kind: 'Function',
    description:
      'Register the Scalar reference and its OpenAPI JSON after registering routes and schemas. The specification captures routes registered at that point. In this example the UI is at /docs and the specification is at /docs/openapi.json.',
    example: `import { Hono } from 'hono';
import { ApplicationError, ApplicationErrorSchema, routeDocs } from 'nano-fw';

const app = new Hono();

routeDocs(app, '/docs', ${docsOptions});`,
  },
  {
    name: 'RouteDocsOptions',
    anchor: 'customize-openapi',
    kind: 'Type',
    description:
      'Configure the third argument of routeDocs. The transform receives the document and the incoming request each time a client requests the specification.',
    fields: [
      ['title', 'string', 'No', 'OpenAPI title. Defaults to API Reference.'],
      [
        'docsAssets',
        'string',
        'No',
        'Markdown files form the introduction in filename order. Static assets are served from root paths such as /logo.svg.',
      ],
      ['errors', 'ErrorCatalog', 'No', 'Lists error codes in the reference.'],
      ['errorSchema', '$ZodType', 'No', 'Schema supplied with the error catalog. Defaults to ApplicationErrorSchema.'],
      [
        'tagOrder',
        'readonly string[]',
        'No',
        'Lists the tags to show first. Remaining tags sort alphabetically with Errors last.',
      ],
      ['logoUrl', 'string', 'No', 'Sidebar logo. Defaults to /logo.png.'],
      ['faviconUrl', 'string', 'No', 'Browser icon. Defaults to the logo URL.'],
      ['scalarOptions', 'ScalarOptions', 'No', 'Overrides the Scalar UI settings.'],
      [
        'transformOpenapiDocument',
        '({ document, request }) => OpenAPIObject | Promise<OpenAPIObject>',
        'No',
        'Return a new document when customizing the specification for a request. The input document is shared.',
      ],
    ],
  },
  {
    name: 'ScalarOptions',
    anchor: 'scalar-options',
    kind: 'Type',
    description:
      'Pass JSON-compatible Scalar settings through RouteDocsOptions.scalarOptions to configure the reference UI. The table lists the settings used in the routeDocs example. Nested objects replace their defaults. Browser callbacks are unsupported.',
    fields: [
      ['theme', 'ApiReferenceConfiguration["theme"]', 'No', 'Selects a Scalar theme.'],
      ['layout', "'modern' | 'classic'", 'No', 'Selects the reference layout.'],
      ['forceDarkModeState', "'light' | 'dark'", 'No', 'Sets the color mode.'],
      ['hideDarkModeToggle', 'boolean', 'No', 'Hides the color mode control.'],
      ['hideClientButton', 'boolean', 'No', 'Hides the API client button.'],
      ['hideTestRequestButton', 'boolean', 'No', 'Hides the request testing button.'],
      ['customCss', 'string', 'No', 'Applies additional CSS to the reference.'],
    ],
  },
  {
    name: 'registerSchema',
    kind: 'Function',
    description:
      'Add a named schema to the OpenAPI components before calling routeDocs. For a schema used by a route, you can also give it a component name with .meta({ id: "Item" }).',
    example: `import { registerSchema } from 'nano-fw';
import { z } from 'zod';

registerSchema('Item', z.object({ id: z.uuid(), name: z.string() }));`,
  },
];

const errors: ReferenceEntry[] = [
  {
    name: 'ApplicationError',
    kind: 'Class',
    description:
      'Throw an HTTP error with a status, code, message and optional payload. A Zod error passed as the payload becomes a list of validation issues.',
    example: `import { ApplicationError } from 'nano-fw';

export const itemNotFound = (id: number) =>
  new ApplicationError(404, 'ITEM_NOT_FOUND', 'Item not found.', { id });`,
  },
  {
    name: 'errorHandler',
    kind: 'Hono error handler',
    description:
      'Send an ApplicationError as JSON with its HTTP status. Invalid request input returns 400. Invalid handler output and unexpected errors return 500.',
    example: `import { Hono } from 'hono';
import { ApplicationError, errorHandler } from 'nano-fw';

const app = new Hono();
app.onError(errorHandler);
app.get('/archived', () => {
  throw new ApplicationError(410, 'ARCHIVED', 'This resource was archived.');
});

const response = await app.request('/archived'); // HTTP 410`,
  },
  {
    name: 'ApplicationErrorSchema',
    kind: 'Zod schema',
    description:
      'Validate an error response body or use the schema in route metadata. The payload can contain application data.',
    example: `import { ApplicationErrorSchema } from 'nano-fw';

const error = ApplicationErrorSchema.parse({
  code: 'ITEM_NOT_FOUND',
  message: 'Item not found.',
  payload: { id: 42 },
});`,
  },
  {
    name: 'ValidationErrorSchema',
    kind: 'Zod schema',
    description:
      'Validate a response that describes invalid input. When a payload is present, it contains an array of field paths and messages.',
    example: `import { ValidationErrorSchema } from 'nano-fw';

const error = ValidationErrorSchema.parse({
  code: 'VALIDATION_ERROR',
  message: 'Validation error on request',
  payload: { issues: [{ path: 'items.0.id', message: 'Expected a positive integer.' }] },
});`,
  },
  {
    name: 'ValidationErrorPayload',
    kind: 'Type',
    description:
      'Type the optional issue list in a validation error payload. Each issue identifies a field by its path.',
    example: `import type { ValidationErrorPayload } from 'nano-fw';

const payload: ValidationErrorPayload = {
  issues: [{ path: 'items.0.id', message: 'Expected a positive integer.' }],
};`,
  },
  {
    name: 'ErrorCatalog',
    anchor: 'errors-and-response-documentation',
    kind: 'Type',
    description:
      'Map each documented error code to its HTTP status and message. The reference lists errors in registration order. Catalog registration is optional for runtime handling. Use RouteMeta.responses to document an error on a specific operation.',
    example: `import { ApplicationError, type ErrorCatalog } from 'nano-fw';

const ITEM_NOT_FOUND = new ApplicationError(404, 'ITEM_NOT_FOUND', 'Item not found.');
export const errors = {
  ITEM_NOT_FOUND,
  ITEM_ARCHIVED: { status: 410, message: 'Item was archived.' },
} satisfies ErrorCatalog;`,
  },
];

const data: ReferenceEntry[] = [
  {
    name: 'createDatabase',
    kind: 'Function',
    description:
      'Create a PostgreSQL client with value parsers and slow query logging. Pass a connectionString and optional maxConnections (default 20). Call destroy() at shutdown. This factory replaces the deprecated getConfig and getDatabase functions.',
    example: `import { createDatabase } from 'nano-fw/data';

const database = createDatabase({ connectionString: 'postgres://user:password@localhost:5432/nano-fw', maxConnections: 8 });
const result = await database.raw('select current_database() as name');
console.log(result.rows);
await database.destroy();`,
  },
  {
    name: 'Repository',
    anchor: 'repository',
    kind: 'Class',
    description:
      'Read rows from a table or view and write to the table. Supply the resource, row, insert and update types to check queries at compile time. The default insert type makes fields optional and excludes id, created_at and updated_at. This example reads from items_view and uses id as the default sort column.',
    example: `import { createDatabase, Repository } from 'nano-fw/data';

type ItemRow = { id: number; name: string };
type ItemInsert = Pick<ItemRow, 'name'>;
type ItemUpdate = Partial<ItemInsert>;

const database = createDatabase({ connectionString: 'postgres://user:password@localhost:5432/nano-fw', maxConnections: 8 });
const ItemRepository = new Repository<ItemRow, ItemRow, ItemInsert, ItemUpdate>({
  database,
  tableName: 'items',
  viewName: 'items_view',
  uniqueSortColumn: 'id',
});

const rows = await ItemRepository.getem({ name$ilike: 'pen', sort: [['id', 'asc']], limit: 10, offset: 0 }, true);
console.log(rows);
await database.destroy();`,
  },
  {
    name: 'ID',
    kind: 'Type',
    description:
      'Identify a row by number, string, or an object with an id field. Repository methods such as get accept each form.',
    example: `import type { ID } from 'nano-fw/data';

const ids: ID[] = [42, '550e8400-e29b-41d4-a716-446655440000', { id: 42 }];`,
  },
  {
    name: 'RepositoryWhere',
    kind: 'Type',
    description:
      'Combine column filters with AND. Use equality, comparisons, membership, text matching, array membership or a bound SQL condition. Omit unused keys. An undefined filter value is invalid.',
    fields: [
      ['column, column$eq, column$neq', 'Row[Key] | null', 'No', 'Compares a column for equality or inequality.'],
      [
        'column$gt, column$gte, column$lt, column$lte',
        'Row[Key]',
        'No',
        'Compares a value against a lower or upper bound.',
      ],
      ['column$in, column$nin', 'readonly Row[Key][]', 'No', 'Includes or excludes matching values.'],
      ['column$like, column$ilike', 'string', 'No', 'Matches a substring in a text column. ilike ignores case.'],
      ['column$has', 'Array element type', 'No', 'Checks whether an array column contains a value.'],
      ['_raw$name', 'RawCondition', 'No', 'Adds a SQL predicate under a distinct key.'],
    ],
  },
  {
    name: 'RawCondition',
    kind: 'Type',
    description: 'Supply a fixed SQL condition or bind column names and values separately in a repository filter.',
    example: `import type { RawCondition } from 'nano-fw/data';

const available: RawCondition = 'stock > 0';
const minimum: RawCondition = { sql: '?? >= ?', bindings: ['stock', 5] };`,
  },
  {
    name: 'GetemParams',
    anchor: 'filters-and-pagination',
    kind: 'Type',
    description: 'Combine row filters with sort order, page size and offset for a repository list query.',
    fields: [
      ['Filter fields', 'RepositoryWhere<Row>', 'No', 'Apply filters directly alongside sort, limit and offset.'],
      ['sort', "[string, 'desc' | 'asc'][]", 'No', 'Orders rows by the listed columns in sequence.'],
      ['limit', 'number', 'No', 'Nonnegative safe integer. Omit to return all matches.'],
      ['offset', 'number', 'No', 'Nonnegative safe integer giving the number of rows to skip.'],
    ],
  },
  {
    name: 'UpsertOptions',
    kind: 'Type',
    description:
      'Select the unique conflict columns, fields to update and conditions that an existing row must satisfy for the update.',
    fields: [
      [
        'onConflict',
        '[ColumnName<Row>, ...ColumnName<Row>[]]',
        'Yes',
        'Identifies the unique column or combination of columns to match.',
      ],
      ['merge', 'Update', 'No', 'Sets the fields to update on conflict.'],
      ['where', 'RepositoryWhere<Row>', 'No', 'Limits which conflicting rows can be updated.'],
    ],
  },
];

const groups = [
  { path: 'nano-fw', entries: [...routing, ...errors] },
  { path: 'nano-fw/data', entries: data },
];

const ApiReferenceContents = () => (
  <details className="reference-contents">
    <summary className="cursor-pointer py-1.5">Exports</summary>
    {[
      { title: 'Routing', entries: routing },
      { title: 'Error handling', entries: errors },
      { title: 'Database', entries: data },
    ].map(({ title, entries }) => (
      <div key={title}>
        <strong>{title}</strong>
        <ul aria-label={title}>
          {entries.map(({ name, kind }) => (
            <li key={name}>
              <a className="block py-1.5 text-sm wrap-anywhere" href={`#export-${name}`}>
                <span className="font-mono">{exportPrefixes[kind]}</span> {name}
              </a>
            </li>
          ))}
        </ul>
      </div>
    ))}
  </details>
);

export const ApiReference = () => (
  <>
    <h2 id="api-reference">API Reference</h2>
    <ApiReferenceContents />
    {groups.map(({ path, entries }) => (
      <div key={path} id={path === 'nano-fw' ? 'api-http' : 'api-data'}>
        <h3>{path}</h3>
        {entries.map(({ name, kind, description, example, fields, anchor }) => (
          <section key={name} id={anchor} aria-labelledby={`export-${name}`}>
            <h4 className="mt-8 font-mono" id={`export-${name}`}>
              {name} <small className="text-sm font-normal">{kind}</small>
            </h4>
            <p>{description}</p>
            {fields ? (
              <div className="overflow-x-auto">
                <table className="w-full" aria-label={`${name} properties`}>
                  <thead>
                    <tr>
                      <th>Property</th>
                      <th>Type</th>
                      <th>Required</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fields.map(([property, type, required, detail]) => (
                      <tr key={property}>
                        <th scope="row">
                          <code>{property}</code>
                        </th>
                        <td>
                          <code>{type}</code>
                        </td>
                        <td>{required}</td>
                        <td>{detail}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <Code language="typescript" text={example} />
            )}
            {name === 'Repository' && <RepositoryDetails />}
          </section>
        ))}
      </div>
    ))}
  </>
);

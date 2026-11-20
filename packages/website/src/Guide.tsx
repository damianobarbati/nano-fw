import { Code } from 'nano-ux';
import { ApiReference } from './ApiReference.tsx';

const openDocs = (
  <p>
    Open the API docs at <a href="http://localhost:8080/docs">localhost:8080/docs</a>.
  </p>
);

export const Guide = () => (
  <>
    <h1 id="nano-fw">nano-fw</h1>
    <p>
      <strong>nano-fw</strong> (nano-sized framework) is a micro-framework powered by Hono, Zod, Knex, Vitest.
      <br />
      It's pragmatic, ESM-first and TypeScript-first.
    </p>
    <p>It provides:</p>
    <ul>
      <li>type-safe request and response validation</li>
      <li>automatic API docs generation with OpenAPI and Scalar from your Zod schemas</li>
      <li>typed repositories</li>
    </ul>
    <h2 id="install">Install</h2>
    <Code language="bash" text={`pnpm add nano-fw hono zod @hono/node-server`} />
    <h2 id="routing">Routing</h2>
    <figure>
      <figcaption className="font-mono text-sm font-semibold">server.ts</figcaption>
      <Code
        language="typescript"
        text={`import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { errorHandler, route, routeDocs } from 'nano-fw';
import { z } from 'zod';

const app = new Hono();
app.onError(errorHandler);

route(app, {
  method: 'get',
  path: '/hello',
  requestSchema: z.object({ name: z.string().min(1) }),
  responseSchema: z.object({ message: z.string() }),
  handler: ({ name }) => ({ message: \`Hello, \${name}!\` }),
});

routeDocs(app, '/docs');
serve({ fetch: app.fetch, port: 8080 });`}
      />
    </figure>
    <Code language="bash" text="node server.ts" />
    {openDocs}
    <figure>
      <figcaption className="font-mono text-sm font-semibold">Try route validation</figcaption>
      <Code
        copyable={false}
        language="bash"
        text={`# 200 OK: the request and response both pass validation.
curl -i 'http://localhost:8080/hello?name=Ada'
# {"message":"Hello, Ada!"}

# 400 Bad Request: an empty name fails request validation.
curl -i 'http://localhost:8080/hello?name='
# The response contains VALIDATION_ERROR and identifies name in payload.issues.`}
      />
    </figure>
    <h2 id="error-handling">Error handling</h2>
    <figure>
      <figcaption className="font-mono text-sm font-semibold">errors.ts</figcaption>
      <Code
        language="typescript"
        text={`import { ApplicationError } from 'nano-fw';

const NAME_RESERVED = new ApplicationError(409, 'NAME_RESERVED', 'This name is reserved.');

const NAME_TOO_LONG = (name: string) =>
  new ApplicationError(422, 'NAME_TOO_LONG', \`Name "\${name}" exceeds 12 characters.\`);

const NAME_INVALID_INITIAL = ({ initial }: { initial: string }) =>
  new ApplicationError(422, 'NAME_INVALID_INITIAL', \`A name cannot start with "\${initial}".\`);

export const ERRORS = {
  NAME_RESERVED,
  NAME_TOO_LONG,
  NAME_INVALID_INITIAL,
};`}
      />
    </figure>
    <figure>
      <figcaption className="font-mono text-sm font-semibold">server.ts</figcaption>
      <Code
        language="typescript"
        text={`import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { errorHandler, route, routeDocs } from 'nano-fw';
import { z } from 'zod';
import { ERRORS } from './errors.ts';

const app = new Hono();
app.onError(errorHandler);

route(app, {
  method: 'get',
  path: '/hello',
  requestSchema: z.object({ name: z.string().min(1) }),
  responseSchema: z.object({ message: z.string() }),
  handler: ({ name }) => {
    if (name === 'admin') throw ERRORS.NAME_RESERVED;
    if (name.length > 12) throw ERRORS.NAME_TOO_LONG(name);
    if (/^[0-9]/.test(name)) throw ERRORS.NAME_INVALID_INITIAL({ initial: name.charAt(0) });
    return { message: \`Hello, \${name}!\` };
  },
});

routeDocs(app, '/docs', {
  errors: {
    NAME_RESERVED: ERRORS.NAME_RESERVED,
    NAME_TOO_LONG: ERRORS.NAME_TOO_LONG('<name>'),
    NAME_INVALID_INITIAL: ERRORS.NAME_INVALID_INITIAL({ initial: '<initial>' }),
  },
});
serve({ fetch: app.fetch, port: 8080 });`}
      />
    </figure>
    {openDocs}
    <figure>
      <figcaption className="font-mono text-sm font-semibold">Try application errors</figcaption>
      <Code
        copyable={false}
        language="bash"
        text={`# 409 NAME_RESERVED: This name is reserved.
curl -i 'http://localhost:8080/hello?name=admin'

# 422 NAME_TOO_LONG: Name "AlexandertheGreat" exceeds 12 characters.
curl -i 'http://localhost:8080/hello?name=AlexandertheGreat'

# 422 NAME_INVALID_INITIAL: A name cannot start with "1".
curl -i 'http://localhost:8080/hello?name=1Ada'`}
      />
    </figure>
    <h2 id="database">Database</h2>
    <figure>
      <figcaption className="font-mono text-sm font-semibold">database.ts</figcaption>
      <Code
        language="typescript"
        text={`import { getConfig, getDatabase, Repository } from 'nano-fw/data';

type UserRow = { id: number; email: string };
const database = getDatabase(getConfig('postgres://user:password@localhost:5432/nano-fw'));
const UserRepository = new Repository<UserRow>({ database, tableName: 'users' });

const created = await UserRepository.create({ email: 'ada@example.com' });
const user = await UserRepository.get(created.id);

console.log(user);

await database.destroy();`}
      />
    </figure>
    <p>
      See <a href="#export-Repository">Repository</a> for methods, hydration, and transactions.
    </p>
    <ApiReference />
  </>
);

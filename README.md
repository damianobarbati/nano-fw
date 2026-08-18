# fwxs

XS sized framework:
- core libraries are Hono, Knex, Zod
- utility to validate request and responses and auto-generate OpenAPI spec
- utility to perform queries

## Requirements

Dependencies:
- `fnm` (eg: `brew install fnm`)
- add `eval "$(fnm env --use-on-cd)"` into your `~/.zprofile` or `~/.profile`

## Development

Setup:
```sh
fnm install
npm install -g corepack
corepack enable
corepack install
pnpm install
export $(grep -v '^#' .env | xargs)
pnpm env:down
pnpm env:up
```

Linting:
```sh
pnpm lint # lint
pnpm tsc # typecheck
```

Testing:
```sh
pnpm test
```

## Usage

Install:
```sh
pnpm i fwxs
```

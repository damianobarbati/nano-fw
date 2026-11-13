# Instructions for AI agents

At the start of the agent session:

- read the instructions in [CONTRIBUTING.md](./CONTRIBUTING.md)

If backend code was actually changed, then verify the following all the following commands succeed:

```sh
npm run lint
npm -ws run test
```

Changes to the following files are prohibited unless explicitly consented:

```sh
**/package.json
./README.md
./AGENTS.md
./CONTRIBUTING.md
**/ci.yml
```

Changes are always allowed when applied by the `npm run lint` command.

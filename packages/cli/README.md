# turtlecode

AI-powered creative workspace. Launch it instantly:

```bash
npx turtlecode
```

## Options

```
--port, -p <number>   Port to serve on (default: 3333)
--no-open             Don't auto-open the browser
--help, -h            Show this help
--version, -v         Show version
```

## Examples

```bash
# Launch on default port
npx turtlecode

# Custom port
npx turtlecode --port 8080

# Without opening browser
npx turtlecode --no-open
```

## Development

From the monorepo root:

```bash
# Build the CLI (builds web app + copies assets)
bun run --cwd packages/cli build

# Test locally
node packages/cli/bin/cli.mjs

# Publish
cd packages/cli && npm publish
```

## License

MIT

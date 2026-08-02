---
name: code-preview
description: Manage code preview services in development. Use when user wants to preview web apps, APIs, or run dev servers alongside the coding session.
---

# Code Preview Skill

Configure and manage code preview services that run alongside the coding session.

## Configuration

Add to `opencode.jsonc`:

```jsonc
"preview": {
  "services": {
    "client": {
      "port": 3000,
      "type": "web",
      "command": "npm run dev"
    },
    "api": {
      "port": 4000,
      "type": "api",
      "command": "bun run src/index.ts"
    },
    "worker": {
      "type": "terminal",
      "command": "npm run worker"
    }
  }
}
```

## Service Types

| Type       | Purpose              | UI             |
| ---------- | -------------------- | -------------- |
| `web`      | Web app preview      | iframe         |
| `api`      | REST/GraphQL API     | Request client |
| `terminal` | Long-running process | Output view    |

## Workflow

### Start previews

Previews auto-start when session begins if configured.

### Manual control

```bash
# Restart a service
preview restart <name>

# Stop a service
preview stop <name>

# View logs
preview logs <name>
```

### Check status

Preview panel shows all services with status indicators:

- 🟢 running
- 🟡 starting
- 🔴 error
- ⚪ stopped

## Troubleshooting

- **Port in use**: Kill existing process or change port
- **Not starting**: Check command works in terminal first
- **iframe blocked**: Some browsers block cross-origin iframes

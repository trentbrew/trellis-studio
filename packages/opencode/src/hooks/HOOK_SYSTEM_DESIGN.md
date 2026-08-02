# TurtleCode Hook System Design

## Overview

TurtleCode will implement a Cursor-compatible hook system for lifecycle event interception and customization. The system will:

1. Support Cursor's hook event names for compatibility
2. Use stdio JSON protocol for hook scripts (like Cursor)
3. Integrate with existing Plugin system
4. Coexist with Trellis enforcement hooks
5. Support project-level and global configuration

## Hook Events

### Session Lifecycle
- `sessionStart` - When a session is created
- `sessionEnd` - When a session completes
- `workspaceOpen` - When a workspace opens

### Tool Lifecycle
- `preToolUse` - Before any tool execution
- `postToolUse` - After successful tool execution
- `postToolUseFailure` - After failed tool execution

### Subagent Lifecycle
- `subagentStart` - When a subagent session starts
- `subagentStop` - When a subagent session ends

### Shell Execution
- `beforeShellExecution` - Before shell command runs
- `afterShellExecution` - After shell command completes

### MCP Execution
- `beforeMCPExecution` - Before MCP tool call
- `afterMCPExecution` - After MCP tool call

### File Operations
- `beforeReadFile` - Before file content is read
- `afterFileEdit` - After file is modified

### Prompt & Response
- `beforeSubmitPrompt` - Before prompt is sent to LLM
- `afterAgentResponse` - After agent responds
- `afterAgentThought` - After agent reasoning

### Context Management
- `preCompact` - Before context window compaction
- `stop` - Agent session completion

## Configuration Format

### `.opencode/hooks.json`

```json
{
  "version": 1,
  "hooks": {
    "sessionStart": [
      {
        "command": "./hooks/session-start.sh",
        "timeout": 30
      }
    ],
    "beforeShellExecution": [
      {
        "command": "./hooks/security-check.sh",
        "timeout": 10
      }
    ],
    "afterFileEdit": [
      {
        "command": "bun run .opencode/hooks/format.ts",
        "timeout": 60
      }
    ],
    "stop": [
      {
        "command": "./hooks/cleanup.sh"
      }
    ]
  }
}
```

### Configuration Locations (priority order)
1. Project: `./.opencode/hooks.json`
2. User global: `~/.opencode/hooks.json`
3. Enterprise: `/etc/opencode/hooks.json`

All matching hooks from all sources execute; higher priority sources take precedence on conflicts.

## Hook Script Protocol

### Input (stdin)
```json
{
  "event": "beforeShellExecution",
  "sessionID": "sess_abc123",
  "agent": "build",
  "tool": "bash",
  "args": {
    "command": "rm -rf /tmp/test"
  },
  "directory": "/path/to/project"
}
```

### Output (stdout)
```json
{
  "continue": true,
  "message": "Command approved"
}
```

### Blocking Response
```json
{
  "continue": false,
  "message": "Dangerous command blocked: rm -rf"
}
```

### Exit Codes
- `0` - Continue (default)
- `1` - Error (log and continue)
- `2` - Block action

## Integration Points

### 1. Session Creation (`session/index.ts`)
```typescript
export const create = Effect.fn("Session.create")(function* (input) {
  // ... existing session creation logic ...
  
  yield* HookService.trigger("sessionStart", {
    sessionID: result.id,
    directory: Instance.directory,
  })
  
  return result
})
```

### 2. Tool Execution (`tool/tool.ts`)
```typescript
toolInfo.execute = async (args, ctx) => {
  const hookResult = await HookService.trigger("preToolUse", {
    sessionID: ctx.sessionID,
    tool: id,
    args,
  })
  
  if (hookResult?.blocked) {
    throw new Error(`Tool blocked by hook: ${hookResult.message}`)
  }
  
  try {
    const result = await execute(args, ctx)
    
    await HookService.trigger("postToolUse", {
      sessionID: ctx.sessionID,
      tool: id,
      args,
      output: result.output,
    })
    
    return result
  } catch (error) {
    await HookService.trigger("postToolUseFailure", {
      sessionID: ctx.sessionID,
      tool: id,
      args,
      error: error.message,
    })
    throw error
  }
}
```

### 3. Shell Tool (`tool/bash.ts`)
```typescript
// Add beforeShellExecution/afterShellExecution hooks
const beforeHook = await HookService.trigger("beforeShellExecution", {
  sessionID: ctx.sessionID,
  command: args.command,
})

if (beforeHook?.blocked) {
  return { title: "Command blocked", output: beforeHook.message }
}

const result = await executeCommand(args.command)

await HookService.trigger("afterShellExecution", {
  sessionID: ctx.sessionID,
  command: args.command,
  exitCode: result.exitCode,
  output: result.output,
})
```

### 4. File Operations (`tool/read.ts`, `tool/edit.ts`)
```typescript
// beforeReadFile hook
const beforeHook = await HookService.trigger("beforeReadFile", {
  sessionID: ctx.sessionID,
  filePath: args.filePath,
})

if (beforeHook?.blocked) {
  throw new Error(`File read blocked: ${beforeHook.message}`)
}

// afterFileEdit hook
await HookService.trigger("afterFileEdit", {
  sessionID: ctx.sessionID,
  filePath: args.filePath,
  oldContent: oldString,
  newContent: newString,
})
```

### 5. Prompt Submission (`session/prompt.ts`)
```typescript
// beforeSubmitPrompt hook
await HookService.trigger("beforeSubmitPrompt", {
  sessionID,
  prompt: userMessage.parts,
  agent: lastUser.agent,
})
```

### 6. Session Completion (`session/prompt.ts`)
```typescript
// stop hook
await HookService.trigger("stop", {
  sessionID,
  agent: lastUser.agent,
  summary: lastFinished.summary,
})
```

## Hook Service Architecture

```typescript
export namespace HookService {
  export interface HookConfig {
    version: number
    hooks: Record<string, HookDefinition[]>
  }
  
  export interface HookDefinition {
    command: string
    timeout?: number
    enabled?: boolean
  }
  
  export interface HookInput {
    event: string
    sessionID: string
    agent?: string
    tool?: string
    args?: Record<string, unknown>
    directory?: string
    // ... event-specific fields
  }
  
  export interface HookOutput {
    continue?: boolean
    message?: string
    data?: Record<string, unknown>
  }
  
  export interface Service {
    readonly trigger: (event: string, input: HookInput) => Promise<HookOutput | undefined>
    readonly loadConfig: () => Effect.Effect<HookConfig>
  }
}
```

## Integration with Existing Systems

### Plugin System Compatibility
The HookService will use the existing Plugin infrastructure:

```typescript
// Existing plugin triggers remain
await Plugin.trigger("tool.execute.before", { ... })

// New hook system runs alongside
await HookService.trigger("preToolUse", { ... })
```

### Trellis Enforcement Hooks
Trellis enforcement hooks (`hooks/trellis-enforcement.ts`) will remain as domain-specific internal hooks. The general hook system is for external user scripts.

```typescript
// Internal Trellis hooks (no stdio, direct function calls)
TrellisEnforcement.onToolAfter({ ... })

// External user hooks (stdio JSON protocol)
HookService.trigger("postToolUse", { ... })
```

## Implementation Phases

### Phase 1: Core Infrastructure
1. Create `src/hooks/hook-service.ts` - HookService implementation
2. Create `src/hooks/config.ts` - Config loading from hooks.json
3. Create `src/hooks/executor.ts` - Stdio JSON protocol executor
4. Add HookService layer to Effect system

### Phase 2: Session Lifecycle Hooks
1. Integrate `sessionStart` in `Session.create`
2. Integrate `sessionEnd` in session completion
3. Integrate `workspaceOpen` in project loading

### Phase 3: Tool Execution Hooks
1. Integrate `preToolUse`/`postToolUse` in `tool/tool.ts`
2. Integrate `postToolUseFailure` in error handling
3. Add tool-specific hooks (shell, MCP, file operations)

### Phase 4: Prompt & Response Hooks
1. Integrate `beforeSubmitPrompt` in `session/prompt.ts`
2. Integrate `afterAgentResponse`/`afterAgentThought`
3. Integrate `stop` hook

### Phase 5: Subagent & Compaction Hooks
1. Integrate `subagentStart`/`subagentStop` in task tool
2. Integrate `preCompact` in compaction logic

### Phase 6: Testing & Documentation
1. Add hook script examples
2. Add integration tests
3. Document hook API
4. Add Cursor compatibility notes

## Cursor Compatibility

### Hook Name Mapping
TurtleCode will use Cursor's exact hook names for compatibility:

| TurtleCode Hook | Cursor Hook | Status |
|----------------|-------------|--------|
| `sessionStart` | `sessionStart` | ✅ Planned |
| `sessionEnd` | `sessionEnd` | ✅ Planned |
| `preToolUse` | `preToolUse` | ✅ Planned |
| `postToolUse` | `postToolUse` | ✅ Planned |
| `postToolUseFailure` | `postToolUseFailure` | ✅ Planned |
| `subagentStart` | `subagentStart` | ✅ Planned |
| `subagentStop` | `subagentStop` | ✅ Planned |
| `beforeShellExecution` | `beforeShellExecution` | ✅ Planned |
| `afterShellExecution` | `afterShellExecution` | ✅ Planned |
| `beforeMCPExecution` | `beforeMCPExecution` | ✅ Planned |
| `afterMCPExecution` | `afterMCPExecution` | ✅ Planned |
| `beforeReadFile` | `beforeReadFile` | ✅ Planned |
| `afterFileEdit` | `afterFileEdit` | ✅ Planned |
| `beforeSubmitPrompt` | `beforeSubmitPrompt` | ✅ Planned |
| `preCompact` | `preCompact` | ✅ Planned |
| `stop` | `stop` | ✅ Planned |
| `afterAgentResponse` | `afterAgentResponse` | ✅ Planned |
| `afterAgentThought` | `afterAgentThought` | ✅ Planned |
| `workspaceOpen` | `workspaceOpen` | ✅ Planned |

### Third-Party Hook Support
TurtleCode can load Cursor-compatible hooks from `.cursor/hooks.json` when third-party skills are enabled.

## Security Considerations

1. **Sandboxing**: Hook scripts run in child processes with limited permissions
2. **Timeouts**: All hooks have configurable timeouts (default 30s)
3. **Path Validation**: Hook commands are validated against allowed paths
4. **User Consent**: Hooks can be disabled via config or environment variable
5. **Audit Logging**: All hook executions are logged for security auditing

## Performance Impact

1. **Async Execution**: Hooks run asynchronously where possible
2. **Caching**: Hook configs are cached per session
3. **Parallel Execution**: Multiple hooks for same event run in parallel
4. **Graceful Degradation**: Hook failures don't break core functionality

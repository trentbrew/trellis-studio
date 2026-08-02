const defaults: Record<string, string> = {
  ask: "var(--icon-agent-ask-base)",
  build: "var(--icon-agent-build-base)",
  docs: "var(--icon-agent-docs-base)",
  plan: "var(--icon-agent-plan-base)",
}

const icons: Record<string, string> = {
  ask: "message-circle-question",
  build: "hammer",
  docs: "book-open",
  plan: "clipboard-list",
  explore: "search",
  research: "globe",
  general: "bot",
  compaction: "minimize-2",
  title: "type",
  summary: "file-text",
}

export function agentColor(name: string, custom?: string) {
  if (custom) return custom
  return defaults[name] ?? defaults[name.toLowerCase()]
}

export function agentIcon(name?: string) {
  if (!name) return "message-square"
  return icons[name] ?? icons[name.toLowerCase()] ?? "message-square"
}

export function messageAgentName(list: readonly { role: string; agent?: string }[] | undefined) {
  if (!list) return undefined
  for (let i = list.length - 1; i >= 0; i--) {
    const item = list[i]
    if (item.role !== "user" || !item.agent) continue
    return item.agent
  }
}

export function messageAgentColor(
  list: readonly { role: string; agent?: string }[] | undefined,
  agents: readonly { name: string; color?: string }[],
) {
  if (!list) return undefined
  for (let i = list.length - 1; i >= 0; i--) {
    const item = list[i]
    if (item.role !== "user" || !item.agent) continue
    return agentColor(item.agent, agents.find((agent) => agent.name === item.agent)?.color)
  }
}

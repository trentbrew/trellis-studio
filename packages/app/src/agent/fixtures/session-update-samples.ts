/** Fixture ACP session/update envelopes for adapter unit tests (CC0). */
export const sessionUpdateSamples = [
  {
    sessionId: "sess_fixture",
    update: {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "Hello " },
    },
  },
  {
    sessionId: "sess_fixture",
    update: {
      sessionUpdate: "agent_message_chunk",
      content: { type: "text", text: "world" },
    },
  },
  {
    sessionId: "sess_fixture",
    update: {
      sessionUpdate: "agent_thought_chunk",
      content: { type: "text", text: "Planning…" },
    },
  },
  {
    sessionId: "sess_fixture",
    update: {
      sessionUpdate: "tool_call_update",
      toolCallId: "call_1",
      status: "in_progress",
      title: "Read",
      rawInput: { path: "README.md" },
    },
  },
  {
    sessionId: "sess_fixture",
    update: {
      sessionUpdate: "tool_call_update",
      toolCallId: "call_1",
      status: "completed",
      title: "Read",
    },
  },
] as const

# Agent-Testable Runtime

> Companion to [TELOS](../TELOS.md) and [visual-authoring-roadmap](./visual-authoring-roadmap.md).
> Milestone tracker: TRL-88.

## North Star

Trellis Studio is the place where work happens; the browser tab is for browsing. The agent does not drive the open web. It drives the things we author inside the studio — components, scenes, games, documents — through typed, declarative surfaces that the runtime itself exposes.

The goal of this spec is to make our own runtime first-class testable by the agent, without resorting to DOM scraping, screenshot diffing, or brittle cross-origin tricks.

## The OS Flip

Traditional stacks layer:

```
os -> web -> apps -> agents -> graph/memory/db
```

Agents sit at the top, scraping the web through whatever affordances browsers and OAuth let them have. The graph is an afterthought, the agent's working memory at best.

Trellis Studio inverts this:

```
os -> trellis graph -> agent -> affordances -> web
```

The graph is the substrate. The agent sits between the graph and a set of affordances that are themselves graph entities — typed, versioned, queryable. Apps are not destinations the agent visits; they are sets of affordances the agent invokes. The web is the read surface at the edge of the system, not the platform we build on top of.

Two corollaries follow:

1. We do not need interop with siloed, auth-walled services to be useful. The user should never need to log into ChatGPT or Google from inside the Trellis Studio browser, because the work that would otherwise happen there happens inside the studio.
2. Browser automation of arbitrary cross-origin sites is not on the roadmap. It is the wrong abstraction for our stack, and the same-origin policy makes it brittle anyway.

## Two Surfaces, Two Problems

| Surface             | Direction      | Problem                            | Solution                                            |
| ------------------- | -------------- | ---------------------------------- | --------------------------------------------------- |
| Browser / Preview   | Read           | Extract meaning from external web  | Server-side content extractor → bookmark entity     |
| Trellis Studio apps | Read + Write   | Agent tests its own creations      | Declarative affordance contract + engine probes     |

## I. Browser as Read Surface

The browser panel is a plain `<iframe sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals allow-downloads">` ([browser-panel.tsx:523](../packages/app/src/pages/session/browser-panel.tsx#L523)). Same-origin policy blocks any cross-origin DOM access from the parent window. This is fine.

Two affordances suffice:

- **Server-side content extractor.** Given a URL, return clean markdown + canonical metadata (title, author, published, lang, links, media). Powered by Readability/Defuddle-class libraries server-side. Works for any cross-origin page because the parent never touches the iframe DOM. Tracked in **TRL-94**.
- **Manual bookmark action.** A button per tab that pushes through the same bookmark-entity pipeline the auto-bookmarker uses, but user-initiated and synchronous so the entity surfaces in the active conversation immediately. Tracked in **TRL-93**.

Anything the agent needs to "do" with web content (cite, summarize, link to another entity, propose a revision) happens after extraction, against the resulting markdown — never against the live DOM.

## II. Agent-Testable Runtime

Because Trellis Studio authors the apps it runs, we control the runtime contract. The dev preview can run same-origin under a Trellis subdomain, but parent-window DOM driving is the brittle fallback, not the headline. The headline is that **affordances are declarative**, and the agent's tool surface is auto-derived from those declarations.

### 1. Component Affordance Meta (TRL-89)

Every Trellis UI component exports a small `meta` describing what it can do and what it shows:

```ts
// pseudo-shape, exact schema TBD in TRL-89
export const meta = {
  kind: "component",
  name: "Button",
  actions: {
    click: { args: [], returns: "void" },
    focus: { args: [], returns: "void" },
  },
  events: {
    click: { payload: { ts: "number" } },
  },
  state: {
    disabled: "boolean",
    label: "string",
  },
} satisfies AffordanceMeta;
```

At build/registry time we walk component instances in a preview and generate a typed tool per instance, keyed by instance id:

- `button:save-doc.click()`
- `slider:volume.set(0.4)`
- `select:theme.options() -> string[]`

The agent gets stable semantic handles, not `document.querySelector("[data-testid='save']")` selectors that rot. Defaults handle the obvious cases (`<Button>` auto-declares `click`); only weird surfaces need manual annotation. Cost is friction for component authors; payoff is every new component the agent can drive for free, forever.

This is the load-bearing piece. Without it, the OS-flip framing is a metaphor; with it, the agent has typed access to what's happening in the runtime.

### 2. Game Engine Deterministic Probes (TRL-90)

For games, physics, animations, and any time-based behavior, DOM-style automation is the wrong tool. The right tool is a headless mode in the Trellis game engine where the agent drives a fixed-timestep simulation and inspects state directly:

```ts
// pseudo-API, exact shape TBD in TRL-90
engine.step(16);                          // advance one frame
engine.input.press("space");              // dispatch through normal input path
engine.input.move(120, 80);
const player = engine.query("entity:player");
player.position;                          // { x, y }
player.velocity;
const snap = engine.snapshot();
// ... explore alternatives ...
engine.restore(snap);                     // deterministic replay
```

What this buys us:

- **Speed.** Tests run 100× faster than realtime because no render loop, no requestAnimationFrame, no waiting for animations.
- **Determinism.** Same inputs → same state. Failures are replayable, not flaky.
- **Semantic assertions.** "Does the ball land within tolerance" is a state query, not a screenshot. Assertions describe intent.
- **Time travel.** Snapshot/restore lets the agent explore counterfactuals: "what if the player had jumped one frame earlier."

This is also the surface the agent uses to test mechanics it generated itself — physics tuning, control feel, level layouts — without ever needing to "watch" the game play.

### 3. Frame Capture (TRL-91)

Some questions are unavoidably visual: does this animation look right, is the layout broken, did the particle effect read clearly. Those need pixels, but they are an *orthogonal* primitive, not part of the action layer:

```ts
const frame = await frame.capture({ target: "preview:tab-1" });
const frame = await frame.capture({ target: "engine", at: tick });
const judgment = await agent.eval(frame, "is the menu legible?");
```

The capture pipeline uses canvas `captureStream` or a `postMessage` + `toBlob` handshake for iframe DOM, and direct framebuffer reads for the engine. Captured frames are addressable by Trellis op id so any visual judgment cites its source. Kept separate from the action layer so we don't conflate "agent drove the UI" with "agent judged the output."

### 4. Test Sessions as Trellis Ops (TRL-92)

Every agent-driven test interaction — input dispatched, state observed, frame captured, assertion result, multimodal judgment — is recorded as a Trellis op. A test session is itself an entity that aggregates the op range and ties back to the issue under test.

Why this matters: causal lineage falls out for free. "Agent tried X on component Y → got state Z → assertion failed → fix landed at op W → assertion passed at op V" is a graph path, not a CI log to grep. This is what we have that Playwright and Storybook don't: graph-native provenance. The replay isn't the feature — the *queryable history* is.

## III. What We Are Not Building

- **Cross-origin DOM driving.** The same-origin policy is correct here; we accept it. The browser iframe is a read surface, full stop.
- **OAuth-silo interop.** No "agent logs into your Google account to do X." The agent does X inside Trellis Studio because we built an affordance for X.
- **Pixel-diff regression testing.** Visual QA exists, but as a multimodal judgment primitive, not a brittle pixel comparison.
- **A general-purpose Playwright replacement.** This runtime is testable because we own the affordance contract. It is not a tool for testing arbitrary third-party software.

## IV. Sequencing

| # | Issue   | Why                                                                 |
| - | ------- | ------------------------------------------------------------------- |
| 1 | TRL-89  | Affordance meta. Everything downstream rides on this contract.      |
| 2 | TRL-90  | Engine probes. Independent track; can land in parallel with TRL-89. |
| 3 | TRL-92  | Op recording for test sessions. Lands after TRL-89/90 have surfaces to record from. |
| 4 | TRL-91  | Frame capture. Lower priority; needed once we want visual judgments to be first-class. |
| - | TRL-93  | Manual bookmark. Independent, small.                                |
| - | TRL-94  | Content extractor. Independent, underpins both bookmark flows.      |

## V. Open Questions

- **Meta authoring ergonomics.** How verbose can the `meta` declaration be before component authors resist? Decorators? Schema inference from prop types? Decide in TRL-89.
- **Engine state snapshot format.** Plain JSON is portable but heavy; CBOR or a custom binary layout might matter for large scenes. Defer until TRL-90 has a working prototype.
- **Op tier for test events.** Tier 0 (file) and Tier 1 (structural) are taken. Test ops are probably Tier 2 (semantic) or a new tier. Decide in TRL-92.
- **Cross-origin dev preview policy.** If we serve all dev previews under `*.trellis.local`, do we want strict origin isolation per project or a shared origin for convenience? Security review needed before defaults are set.

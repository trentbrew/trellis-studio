# {{name}}

Threlte 3D game starter with Svelte 5, Three.js, keyboard/gamepad action mapping, an animated character controller, and a compact input debug panel.

## Commands

```bash
bun install
bun run dev
bun run build
bun run typecheck
```

The dev server runs on port `5175`.

## Controls

- Move: `WASD`, arrow keys, D-pad, or left stick
- Sprint: `Shift`, remappable in the input panel, plus gamepad bumpers/left trigger
- Jump: `Space` or gamepad south face button

## Structure

- `src/App.svelte` owns the canvas shell and input debug panel.
- `src/Scene.svelte` maps named actions with `useInputMap` and updates movement each frame.
- `src/Character.svelte` loads the demo GLTF actor and blends idle/walk/run animations.

References:

- Threlte `useInputMap`: https://threlte.xyz/docs/reference/extras/use-input-map/
- Threlte Studio scene tools: https://threlte.xyz/docs/reference/studio/getting-started/

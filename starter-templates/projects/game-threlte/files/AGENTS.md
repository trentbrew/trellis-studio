# {{name}} Agent Notes

This is a Threlte 3D game project. Keep the live play loop in `src/Scene.svelte`, reusable actors in `src/Character.svelte` or `src/actors/`, and level/game data in Trellis projections.

Project expectations:

- Use `useInputMap` for player actions instead of reading raw keyboard/gamepad state in gameplay code.
- Keep Threlte scene objects small and composable; extract actors, cameras, effects, and level props as Svelte components.
- Prefer data-driven level/entity definitions when adding new gameplay systems.
- Do not block the render loop with async asset loading; use Threlte suspense/load helpers for larger assets.

Useful commands:

```bash
bun install
bun run dev
bun run build
bun run typecheck
```

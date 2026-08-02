<script lang="ts">
  import { Canvas } from "@threlte/core"
  import type { StandardGamepad } from "@threlte/extras"
  import { Folder, List, Pane, Slider, Text } from "svelte-tweakpane-ui"
  import Scene from "./Scene.svelte"

  const sprintKeyOptions = {
    Shift: "Shift",
    Space: "Space",
    e: "E",
  }

  let sprintKey: keyof typeof sprintKeyOptions = $state("Shift")
  let activeDevice = $state("keyboard")
  let gamepadRef = $state<StandardGamepad>()

  const gamepadConnected = $derived(gamepadRef ? gamepadRef.connected.current : false)
  const leftStick = $derived(gamepadRef?.stick("leftStick"))
  const leftTrigger = $derived(gamepadRef?.button("leftTrigger"))
</script>

<Pane title="{{name}} Input" position="fixed">
  <List bind:value={sprintKey} options={sprintKeyOptions} label="sprint key" />
  <Text value={activeDevice} label="device" disabled />

  <Folder title="Gamepad">
    <Text value={gamepadConnected ? "connected" : "not connected"} label="status" disabled />

    {#if gamepadRef && gamepadConnected && leftStick}
      <Slider value={leftStick.x} label="left stick X" min={-1} max={1} disabled />
      <Slider value={leftStick.y} label="left stick Y" min={-1} max={1} disabled />

      {#if leftTrigger}
        <Slider value={leftTrigger.value} label="left trigger" min={0} max={1} disabled />
      {/if}
    {:else}
      <Text value="Press any gamepad button" label="activate" disabled />
    {/if}
  </Folder>
</Pane>

<main class="game-shell">
  <Canvas>
    <Scene {sprintKey} bind:activeDevice bind:gamepadRef />
  </Canvas>
</main>

<style>
  .game-shell {
    width: 100%;
    height: 100%;
  }
</style>

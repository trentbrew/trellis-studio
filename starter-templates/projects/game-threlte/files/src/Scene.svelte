<script lang="ts">
  import { MathUtils } from "three"
  import { T, useTask } from "@threlte/core"
  import {
    Grid,
    HTML,
    useGamepad,
    useInputMap,
    useKeyboard,
    type StandardGamepad,
  } from "@threlte/extras"
  import Character from "./Character.svelte"

  let {
    sprintKey = "Shift",
    activeDevice = $bindable("keyboard"),
    gamepadRef = $bindable<StandardGamepad>(),
  }: {
    sprintKey?: string
    activeDevice?: string
    gamepadRef?: StandardGamepad
  } = $props()

  const keyboard = useKeyboard(() => ({ capture: true }))
  const gamepad = useGamepad({ axisDeadzone: 0.12 })
  gamepadRef = gamepad

  const { connected } = gamepad
  const leftStick = gamepad.stick("leftStick")

  const input = useInputMap(
    ({ key, gamepadAxis, gamepadButton }) => ({
      moveLeft: [
        key("a"),
        key("ArrowLeft"),
        gamepadButton("directionalLeft"),
        gamepadAxis("leftStick", "x", -1),
      ],
      moveRight: [
        key("d"),
        key("ArrowRight"),
        gamepadButton("directionalRight"),
        gamepadAxis("leftStick", "x", 1),
      ],
      moveForward: [
        key("w"),
        key("ArrowUp"),
        gamepadButton("directionalTop"),
        gamepadAxis("leftStick", "y", -1),
      ],
      moveBack: [
        key("s"),
        key("ArrowDown"),
        gamepadButton("directionalBottom"),
        gamepadAxis("leftStick", "y", 1),
      ],
      sprint: [key(sprintKey), gamepadButton("leftBumper"), gamepadButton("rightBumper"), gamepadButton("leftTrigger")],
      jump: [key("Space"), gamepadButton("clusterBottom")],
    }),
    { keyboard, gamepad },
  )

  keyboard.on("keydown", (event) => {
    if (event.key.startsWith("Arrow")) event.preventDefault()
  })

  let x = $state(0)
  let y = $state(0)
  let z = $state(0)
  let rotation = $state(0)
  let targetRotation = 0
  let velocityY = 0

  const walkSpeed = 2
  const sprintSpeed = 4
  const rotationSpeed = 10
  const gravity = -9.8
  const jumpStrength = 5

  const sprinting = $derived(input.action("sprint").pressed)
  const moveX = $derived(input.axis("moveLeft", "moveRight"))
  const moveY = $derived(input.axis("moveForward", "moveBack"))
  const moving = $derived(moveX !== 0 || moveY !== 0)
  const action = $derived<"idle" | "run" | "walk" | "jump">(
    y > 0 ? "jump" : moving ? (sprinting ? "run" : "walk") : "idle",
  )
  const moveMagnitude = $derived(Math.hypot(moveX, moveY))
  const locomotionSpeed = $derived(moving ? moveMagnitude * (sprinting ? sprintSpeed : walkSpeed) : 0)

  $effect(() => {
    activeDevice = input.activeDevice.current
  })

  useTask(
    (delta) => {
      const move = input.vector("moveLeft", "moveRight", "moveForward", "moveBack")
      const speed = sprinting ? sprintSpeed : walkSpeed

      x += move.x * speed * delta
      z += move.y * speed * delta

      if (input.action("jump").justPressed && y === 0) {
        velocityY = jumpStrength
      }

      velocityY += gravity * delta
      y += velocityY * delta

      if (y < 0) {
        y = 0
        velocityY = 0
      }

      if (moving) targetRotation = Math.atan2(move.x, move.y)

      let diff = targetRotation - rotation
      diff = MathUtils.euclideanModulo(diff + Math.PI, Math.PI * 2) - Math.PI
      rotation += diff * Math.min(1, rotationSpeed * delta)
    },
    { after: input.task },
  )
</script>

<T.PerspectiveCamera position={[0, 4, 5]} oncreate={(ref) => ref.lookAt(0, 1, 0)} makeDefault fov={50} />

<T.DirectionalLight position={[5, 10, 5]} intensity={1.5} castShadow />
<T.AmbientLight intensity={0.4} />

<Grid
  cellColor="#444444"
  sectionColor="#ff3e00"
  sectionSize={5}
  cellSize={1}
  gridSize={[20, 20]}
  fadeDistance={10}
  fadeOrigin={[0, 0, 0]}
  infiniteGrid
/>

<T.Mesh rotation.x={-Math.PI / 2} position.y={-0.01} receiveShadow>
  <T.CircleGeometry args={[15, 72]} />
  <T.MeshStandardMaterial color="white" />
</T.Mesh>

<T.Group position.x={x} position.y={y} position.z={z} rotation.y={rotation}>
  <Character {action} speed={locomotionSpeed} {walkSpeed} runSpeed={sprintSpeed} />
</T.Group>

<T.Group position.x={x} position.y={2.5} position.z={z}>
  <HTML center transform={false}>
    <div class="overlay">
      {#if !$connected}
        <p class="hint connect">Plug in a gamepad, then press any button to activate it</p>
      {:else if input.activeDevice.current === "keyboard"}
        <p class="hint">WASD / Arrows to move, {sprintKey} to sprint, Space to jump</p>
      {:else}
        <p class="hint">Left stick / D-pad to move, LB/RB/LT to sprint, A/Cross to jump</p>
      {/if}

      <div class="info">
        <span class="label">vector</span>
        <span class="value">({moveX.toFixed(2)}, {moveY.toFixed(2)})</span>
      </div>

      {#if $connected}
        <div class="info">
          <span class="label">stick</span>
          <span class="value">({leftStick.x.toFixed(2)}, {leftStick.y.toFixed(2)})</span>
        </div>
      {/if}

      <div class="badge" class:sprint={sprinting} class:walk={moving && !sprinting}>
        {action}
      </div>
    </div>
  </HTML>
</T.Group>

<style>
  .overlay {
    width: 280px;
    color: white;
    font-family: Inter, system-ui, sans-serif;
    pointer-events: none;
    text-align: center;
    user-select: none;
  }

  .hint {
    margin: 0 0 8px;
    font-size: 12px;
    opacity: 0.65;
  }

  .connect {
    color: #ffb199;
    opacity: 0.9;
  }

  .info {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-size: 13px;
  }

  .label {
    font-weight: 700;
    opacity: 0.55;
  }

  .value {
    font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
  }

  .badge {
    display: inline-block;
    margin-top: 6px;
    padding: 2px 10px;
    border-radius: 4px;
    background: rgba(255, 255, 255, 0.16);
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0;
  }

  .sprint {
    background: rgba(255, 62, 0, 0.85);
  }

  .walk {
    background: rgba(74, 144, 217, 0.85);
  }
</style>

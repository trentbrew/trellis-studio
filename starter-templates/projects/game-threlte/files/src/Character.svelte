<script lang="ts">
  import { MathUtils } from "three"
  import { useTask } from "@threlte/core"
  import { GLTF, type ThrelteGltf, useGltfAnimations } from "@threlte/extras"

  type CharacterAction = "idle" | "run" | "walk" | "jump"

  interface Props {
    action: CharacterAction
    speed?: number
    walkSpeed?: number
    runSpeed?: number
  }

  let { action = "idle", speed = 0, walkSpeed = 2, runSpeed = 4 }: Props = $props()

  let gltf = $state<ThrelteGltf>()
  let { actions } = useGltfAnimations(() => gltf)
  let currentAction = "idle"
  let timeScale = 1

  const minTimeScale = 0.35
  const maxTimeScale = 2

  $effect(() => {
    $actions.idle?.play()
  })

  $effect(() => {
    transitionTo(action, 0.2)
  })

  function transitionTo(next: CharacterAction, duration = 0.2) {
    const current = $actions[currentAction]
    const nextAnim = $actions[next]
    if (!nextAnim || current === nextAnim) return

    nextAnim.enabled = true
    if (current) current.crossFadeTo(nextAnim, duration, true)
    nextAnim.play()
    currentAction = next
    applyTimeScale(next, targetTimeScale(next))
  }

  function targetTimeScale(anim: string) {
    if (anim === "idle" || anim === "jump") return 1
    const referenceSpeed = anim === "run" ? runSpeed : walkSpeed
    if (referenceSpeed <= 0) return 1
    return MathUtils.clamp(speed / referenceSpeed, minTimeScale, maxTimeScale)
  }

  function applyTimeScale(anim: string, scale: number) {
    $actions[anim]?.setEffectiveTimeScale(scale)
  }

  useTask(
    (delta) => {
      if (currentAction === "idle" || currentAction === "jump") {
        timeScale = 1
        return
      }

      const target = targetTimeScale(currentAction)
      timeScale = MathUtils.lerp(timeScale, target, 1 - Math.exp(-14 * delta))
      applyTimeScale(currentAction, timeScale)
    },
    { autoInvalidate: false },
  )
</script>

<GLTF
  bind:gltf
  url="https://threejs.org/examples/models/gltf/Xbot.glb"
  oncreate={(scene) => {
    scene.traverse((child) => {
      child.castShadow = true
    })
  }}
/>

import Phaser from "phaser"
import "./styles.css"

class MainScene extends Phaser.Scene {
  private player?: Phaser.GameObjects.Rectangle

  constructor() {
    super("main")
  }

  create() {
    const { width, height } = this.scale
    this.add.rectangle(width / 2, height / 2, width, height, 0x101820)
    this.add.text(32, 28, "{{name}}", {
      color: "#ffffff",
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: "32px",
      fontStyle: "700",
    })
    this.add.text(34, 72, "Level and entity data belongs in Trellis projections.", {
      color: "#c7d6d9",
      fontFamily: "Inter, system-ui, sans-serif",
      fontSize: "16px",
    })

    this.player = this.add.rectangle(width / 2, height / 2, 54, 54, 0xf4b860)
    this.tweens.add({
      targets: this.player,
      angle: 360,
      duration: 2600,
      repeat: -1,
    })
  }

  update(_time: number, delta: number) {
    if (!this.player) return
    const speed = delta * 0.08
    const keys = this.input.keyboard?.createCursorKeys()
    if (keys?.left.isDown) this.player.x -= speed
    if (keys?.right.isDown) this.player.x += speed
    if (keys?.up.isDown) this.player.y -= speed
    if (keys?.down.isDown) this.player.y += speed
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  width: 960,
  height: 540,
  backgroundColor: "#101820",
  scene: MainScene,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
})

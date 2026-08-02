import { describe, expect, test } from "bun:test"
import { chooseIconName } from "./file-icon"

describe("file icons", () => {
  test("uses distinct icons for 3d and texture formats", () => {
    expect(chooseIconName("model.obj", "file", false)).toBe("Unity")
    expect(chooseIconName("material.mtl", "file", false)).toBe("Shader")
    expect(chooseIconName("scene.gltf", "file", false)).toBe("GodotAssets")
    expect(chooseIconName("scene.glb", "file", false)).toBe("Godot")
    expect(chooseIconName("buffer.bin", "file", false)).toBe("Database")
    expect(chooseIconName("texture.dds", "file", false)).toBe("GodotAssets")
    expect(chooseIconName("project.blend", "file", false)).toBe("Blender")
    expect(chooseIconName("image.psd", "file", false)).toBe("Sketch")
    expect(chooseIconName("lighting.hdr", "file", false)).toBe("Palette")
    expect(chooseIconName("lighting.exr", "file", false)).toBe("Shader")
    expect(chooseIconName("payload.blob", "file", false)).toBe("Virtual")
  })
})

import { createStore, reconcile } from "solid-js/store"
import { createEffect, createMemo } from "solid-js"
import { createSimpleContext } from "@opencode-ai/ui/context"
import { persisted } from "@/utils/persist"

export interface NotificationSettings {
  agent: boolean
  permissions: boolean
  errors: boolean
}

export interface SoundSettings {
  agentEnabled: boolean
  agent: string
  permissionsEnabled: boolean
  permissions: string
  errorsEnabled: boolean
  errors: string
}

export interface Settings {
  general: {
    autoSave: boolean
    autoSaveLinks: boolean
    releaseNotes: boolean
    followup: "queue" | "steer"
    showReasoningSummaries: boolean
    shellToolPartsExpanded: boolean
    editToolPartsExpanded: boolean
  }
  updates: {
    startup: boolean
  }
  appearance: {
    fontSize: number
    mono: string
    sans: string
  }
  keybinds: Record<string, string>
  permissions: {
    autoApprove: boolean
  }
  notifications: NotificationSettings
  sounds: SoundSettings
}

export const monoDefault = "System Mono"
export const sansDefault = "System Sans"

const monoFallback =
  '"JetBrainsMono Nerd Font Mono", "JetBrains Mono Nerd Font", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace'
const sansFallback = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'

const monoBase = monoFallback
const sansBase = sansFallback

function input(font: string | undefined) {
  return font ?? ""
}

function family(font: string) {
  if (/^[\w-]+$/.test(font)) return font
  return `"${font.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`
}

function stack(font: string | undefined, base: string) {
  const value = font?.trim() ?? ""
  if (!value) return base
  return `${family(value)}, ${base}`
}

export function monoInput(font: string | undefined) {
  return input(font)
}

export function sansInput(font: string | undefined) {
  return input(font)
}

export function monoFontFamily(font: string | undefined) {
  return stack(font, monoBase)
}

export function sansFontFamily(font: string | undefined) {
  return stack(font, sansBase)
}

const defaultSettings: Settings = {
  general: {
    autoSave: true,
    autoSaveLinks: true,
    releaseNotes: true,
    followup: "steer",
    showReasoningSummaries: true,
    shellToolPartsExpanded: true,
    editToolPartsExpanded: true,
  },
  updates: {
    startup: true,
  },
  appearance: {
    fontSize: 14,
    mono: "",
    sans: "",
  },
  keybinds: {
    "settings.open": "mod+shift+,",
    "settings.shortcuts": "mod+shift+k",
    "session.previous": "mod+,",
    "session.next": "mod+.",
    "file.open": "alt+space,mod+p",
    "tab.close": "mod+w,alt+x,ctrl+x",
    "file.save": "mod+s",
    "file.saveAll": "mod+shift+s",
    "file.new": "mod+n",
    "folder.new": "mod+alt+n",
    "file.findInFiles": "mod+shift+f",
    "tab.moveLeft": "mod+alt+arrowleft,alt+,",
    "tab.moveRight": "mod+alt+arrowright,alt+.",
    "editor.format": "alt+f",
    "editor.quickFix": "alt+q",
    "editor.find": "mod+f",
    "editor.replace": "mod+alt+f",
    "editor.gotoLine": "mod+g",
    "editor.foldAll": "mod+shift+j",
    "editor.unfoldAll": "mod+shift+h",
    "editor.selectToBracket": "alt+shift+]",
    "editor.smartSelect.expand": "mod+shift+arrowright",
    "editor.smartSelect.shrink": "mod+shift+arrowleft",
    "editor.commentLine": "mod+/",
    "editor.deleteLines": "mod+shift+k",
    "editor.copyFilePath": "mod+shift+c",
    "editor.fontZoomIn": "mod+alt+=",
    "editor.fontZoomOut": "mod+alt+-",
    "editor.fontZoomReset": "alt+0",
    "terminal.fontZoomIn": "mod+ctrl+alt+=",
    "terminal.fontZoomOut": "mod+ctrl+alt+-",
    "view.toggleMinimap": "mod+shift+m,mod+alt+m",
    "view.toggleMaximizedPanel": "ctrl+tab",
    "view.toggleActivityBar": "mod+shift+b",
    "view.toggleStatusBar": "ctrl+mod+s",
    "app.quit": "mod+alt+q",
    "app.reload": "mod+shift+alt+r",
    "app.restart": "mod+shift+r",
    "theme.toggleLightDark": "mod+shift+alt+t",
  },
  permissions: {
    autoApprove: false,
  },
  notifications: {
    agent: true,
    permissions: true,
    errors: false,
  },
  sounds: {
    agentEnabled: true,
    agent: "staplebops-01",
    permissionsEnabled: true,
    permissions: "staplebops-02",
    errorsEnabled: true,
    errors: "nope-03",
  },
}

function withFallback<T>(read: () => T | undefined, fallback: T) {
  return createMemo(() => read() ?? fallback)
}

const legacyTabCloseKeybind = "mod+w,alt+x"
const currentTabCloseKeybind = defaultSettings.keybinds["tab.close"]

export const { use: useSettings, provider: SettingsProvider } = createSimpleContext({
  name: "Settings",
  init: () => {
    const [store, setStore, _, ready] = persisted("settings.v3", createStore<Settings>(defaultSettings))

    createEffect(() => {
      if (store.keybinds?.["tab.close"] !== legacyTabCloseKeybind) return
      if (currentTabCloseKeybind === legacyTabCloseKeybind) return
      setStore("keybinds", "tab.close", currentTabCloseKeybind)
    })

    createEffect(() => {
      if (typeof document === "undefined") return
      const root = document.documentElement
      root.style.setProperty("--font-family-mono", monoFontFamily(store.appearance?.mono))
      root.style.setProperty("--font-family-sans", sansFontFamily(store.appearance?.sans))
    })

    return {
      ready,
      get current() {
        return store
      },
      general: {
        autoSave: withFallback(() => store.general?.autoSave, defaultSettings.general.autoSave),
        setAutoSave(value: boolean) {
          setStore("general", "autoSave", value)
        },
        autoSaveLinks: withFallback(() => store.general?.autoSaveLinks, defaultSettings.general.autoSaveLinks),
        setAutoSaveLinks(value: boolean) {
          setStore("general", "autoSaveLinks", value)
        },
        releaseNotes: withFallback(() => store.general?.releaseNotes, defaultSettings.general.releaseNotes),
        setReleaseNotes(value: boolean) {
          setStore("general", "releaseNotes", value)
        },
        followup: withFallback(() => store.general?.followup, defaultSettings.general.followup),
        setFollowup(value: "queue" | "steer") {
          setStore("general", "followup", value)
        },
        showReasoningSummaries: withFallback(
          () => store.general?.showReasoningSummaries,
          defaultSettings.general.showReasoningSummaries,
        ),
        setShowReasoningSummaries(value: boolean) {
          setStore("general", "showReasoningSummaries", value)
        },
        shellToolPartsExpanded: withFallback(
          () => store.general?.shellToolPartsExpanded,
          defaultSettings.general.shellToolPartsExpanded,
        ),
        setShellToolPartsExpanded(value: boolean) {
          setStore("general", "shellToolPartsExpanded", value)
        },
        editToolPartsExpanded: withFallback(
          () => store.general?.editToolPartsExpanded,
          defaultSettings.general.editToolPartsExpanded,
        ),
        setEditToolPartsExpanded(value: boolean) {
          setStore("general", "editToolPartsExpanded", value)
        },
      },
      updates: {
        startup: withFallback(() => store.updates?.startup, defaultSettings.updates.startup),
        setStartup(value: boolean) {
          setStore("updates", "startup", value)
        },
      },
      appearance: {
        fontSize: withFallback(() => store.appearance?.fontSize, defaultSettings.appearance.fontSize),
        setFontSize(value: number) {
          setStore("appearance", "fontSize", value)
        },
        font: withFallback(() => store.appearance?.mono, defaultSettings.appearance.mono),
        setFont(value: string) {
          setStore("appearance", "mono", value.trim() ? value : "")
        },
        uiFont: withFallback(() => store.appearance?.sans, defaultSettings.appearance.sans),
        setUIFont(value: string) {
          setStore("appearance", "sans", value.trim() ? value : "")
        },
      },
      keybinds: {
        get: (action: string) => store.keybinds?.[action],
        set(action: string, keybind: string) {
          setStore("keybinds", action, keybind)
        },
        reset(action: string) {
          setStore("keybinds", (current) => {
            if (!Object.prototype.hasOwnProperty.call(current, action)) return current
            const next = { ...current }
            delete next[action]
            return next
          })
        },
        resetAll() {
          setStore("keybinds", reconcile({}))
        },
      },
      permissions: {
        autoApprove: withFallback(() => store.permissions?.autoApprove, defaultSettings.permissions.autoApprove),
        setAutoApprove(value: boolean) {
          setStore("permissions", "autoApprove", value)
        },
      },
      notifications: {
        agent: withFallback(() => store.notifications?.agent, defaultSettings.notifications.agent),
        setAgent(value: boolean) {
          setStore("notifications", "agent", value)
        },
        permissions: withFallback(() => store.notifications?.permissions, defaultSettings.notifications.permissions),
        setPermissions(value: boolean) {
          setStore("notifications", "permissions", value)
        },
        errors: withFallback(() => store.notifications?.errors, defaultSettings.notifications.errors),
        setErrors(value: boolean) {
          setStore("notifications", "errors", value)
        },
      },
      sounds: {
        agentEnabled: withFallback(() => store.sounds?.agentEnabled, defaultSettings.sounds.agentEnabled),
        setAgentEnabled(value: boolean) {
          setStore("sounds", "agentEnabled", value)
        },
        agent: withFallback(() => store.sounds?.agent, defaultSettings.sounds.agent),
        setAgent(value: string) {
          setStore("sounds", "agent", value)
        },
        permissionsEnabled: withFallback(
          () => store.sounds?.permissionsEnabled,
          defaultSettings.sounds.permissionsEnabled,
        ),
        setPermissionsEnabled(value: boolean) {
          setStore("sounds", "permissionsEnabled", value)
        },
        permissions: withFallback(() => store.sounds?.permissions, defaultSettings.sounds.permissions),
        setPermissions(value: string) {
          setStore("sounds", "permissions", value)
        },
        errorsEnabled: withFallback(() => store.sounds?.errorsEnabled, defaultSettings.sounds.errorsEnabled),
        setErrorsEnabled(value: boolean) {
          setStore("sounds", "errorsEnabled", value)
        },
        errors: withFallback(() => store.sounds?.errors, defaultSettings.sounds.errors),
        setErrors(value: string) {
          setStore("sounds", "errors", value)
        },
      },
    }
  },
})

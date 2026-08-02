import { Button as Kobalte } from "@kobalte/core/button"
import { Show, type ComponentProps, splitProps } from "solid-js"
import { Icon, IconProps } from "./icon"
import { Spinner } from "./spinner"

export interface IconButtonProps extends ComponentProps<typeof Kobalte> {
  icon: IconProps["name"]
  size?: "small" | "normal" | "large"
  iconSize?: IconProps["size"]
  variant?: "primary" | "secondary" | "ghost"
  loading?: boolean
}

export function IconButton(props: ComponentProps<"button"> & IconButtonProps) {
  const [split, rest] = splitProps(props, ["variant", "size", "iconSize", "class", "classList", "loading"])
  return (
    <Kobalte
      {...rest}
      data-component="icon-button"
      data-icon={props.icon}
      data-size={split.size || "normal"}
      data-variant={split.variant || "secondary"}
      data-loading={split.loading ? "" : undefined}
      classList={{
        ...(split.classList ?? {}),
        [split.class ?? ""]: !!split.class,
      }}
    >
      <Show
        when={!split.loading}
        fallback={<Spinner style={{ width: split.size === "large" ? "16px" : "14px", height: split.size === "large" ? "16px" : "14px" }} />}
      >
        <Icon name={props.icon} size={split.iconSize ?? (split.size === "large" ? "normal" : "small")} />
      </Show>
    </Kobalte>
  )
}

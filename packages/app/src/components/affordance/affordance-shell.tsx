import { For, Show, createMemo, type JSX } from "solid-js"
import { Button } from "@opencode-ai/ui/button"
import { Icon } from "@opencode-ai/ui/icon"
import { IconButton } from "@opencode-ai/ui/icon-button"
import { InlineInput } from "@opencode-ai/ui/inline-input"
import { Select } from "@opencode-ai/ui/select"
import { RouteContent, RouteHeader, RouteNav, RoutePanel, RouteView } from "@/components/route"
import "./affordance.css"

export type AffordanceTab = {
  id: string
  label: string
}

export type AffordanceOption = {
  id: string
  label: string
}

function cx(...vals: Array<string | false | undefined>) {
  return vals.filter(Boolean).join(" ")
}

export function AffordanceShell(props: {
  id: string
  title?: JSX.Element
  tabs?: AffordanceTab[]
  tab?: string
  onTab?: (id: string) => void
  meta?: JSX.Element
  /** Free-form search slot. Use this OR the controlled `query` / `onQueryChange` pair. */
  search?: JSX.Element
  /** Controlled search query. When set, AffordanceShell renders a standard borderless search input. */
  query?: string
  onQueryChange?: (value: string) => void
  searchPlaceholder?: string
  /** Inline refresh icon button — rendered to the right of the search input in the toolbar row. */
  onRefresh?: () => void
  refreshTitle?: string
  /** Sort dropdown for the toolbar (right side, beside filters/refresh). */
  sortOptions?: AffordanceOption[]
  sortValue?: string
  onSortChange?: (id: string) => void
  /** Filter dropdown for the toolbar. */
  filterOptions?: AffordanceOption[]
  filterValue?: string
  onFilterChange?: (id: string) => void
  /** Free-form filter slot (used when sort/filter built-ins don't fit). */
  filters?: JSX.Element
  /** Built-in primary "+ add" action. Renders as a white primary button at the right end of the header row. */
  addLabel?: string
  onAdd?: () => void
  /** Free-form actions slot — rendered after the built-in add button. */
  actions?: JSX.Element
  sidebarToggle?: boolean
  sidebar?: JSX.Element
  detail?: JSX.Element
  /** When set with an open detail pane, constrains the main column width (master-detail split). */
  mainWidth?: string
  mainClass?: string
  splitHandle?: JSX.Element
  compact?: boolean
  padded?: boolean
  scroll?: boolean
  class?: string
  viewClass?: string
  contentClass?: string
  children: JSX.Element
}) {
  const split = () => !!props.detail && !!props.mainWidth
  const compact = () => props.compact ?? (!props.sidebar && !split())

  const hasSearch = () => props.search !== undefined || props.query !== undefined
  const hasTabs = () => (props.tabs?.length ?? 0) > 0
  const hasAdd = () => props.addLabel !== undefined && !!props.onAdd
  // Header is shown only when the page offers a first-class interaction: search,
  // tabs, or a primary "+ Add" action. Secondary one-off actions are not enough —
  // pages without any of these get a clean content area, and any contextual
  // controls should live inline in the body.
  const header = () => hasSearch() || hasTabs() || hasAdd() || !!props.meta

  // Track only whether a controlled query is defined (not its value).
  // This breaks the reactive dependency on the query string so that builtSearch
  // is NOT re-evaluated on every keystroke — only when the search slot appears
  // or disappears. The InlineInput / Show inside still update reactively because
  // SolidJS component boundaries (createComponent uses untrack) isolate their
  // reactive reads from this memo's tracking scope.
  const searchDefined = createMemo(() => props.query !== undefined)

  const builtSearch = createMemo<JSX.Element | undefined>(() => {
    if (props.search !== undefined) return props.search
    if (!searchDefined()) return undefined
    return (
      <div class="affordance-search">
        <Icon name="search" size="small" class="affordance-search__icon" />
        <InlineInput
          placeholder={props.searchPlaceholder ?? "Search…"}
          value={props.query!}
          onInput={(e: InputEvent) => props.onQueryChange?.((e.target as HTMLInputElement).value)}
          class="affordance-search__input"
        />
        <Show when={props.query?.trim()}>
          <button
            type="button"
            class="affordance-search__clear"
            title="Clear search"
            aria-label="Clear search"
            onClick={() => props.onQueryChange?.("")}
          >
            <Icon name="close-small" size="small" />
          </button>
        </Show>
      </div>
    )
  })

  const sortNode = () => {
    if (!props.sortOptions?.length) return undefined
    return (
      <div class="affordance-control">
        <Icon name="sliders" size="small" class="affordance-control__icon" />
        <Select
          current={props.sortOptions.find((opt) => opt.id === props.sortValue)}
          onSelect={(opt) => opt && props.onSortChange?.(opt.id)}
          options={props.sortOptions}
          value={(opt) => opt.id}
          label={(opt) => opt.label}
          size="small"
          variant="ghost"
          class="!h-7 !px-1"
          valueClass="min-w-20 text-12-medium"
        />
      </div>
    )
  }

  const filterNode = () => {
    if (!props.filterOptions?.length) return undefined
    return (
      <div class="affordance-control">
        <Icon name="sliders" size="small" class="affordance-control__icon" />
        <Select
          current={props.filterOptions.find((opt) => opt.id === props.filterValue)}
          onSelect={(opt) => opt && props.onFilterChange?.(opt.id)}
          options={props.filterOptions}
          value={(opt) => opt.id}
          label={(opt) => opt.label}
          size="small"
          variant="ghost"
          class="!h-7 !px-1"
          valueClass="min-w-20 text-12-medium"
        />
      </div>
    )
  }

  const refreshNode = () => {
    if (!props.onRefresh) return undefined
    return (
      <IconButton
        icon="refresh-cw"
        variant="ghost"
        size="small"
        title={props.refreshTitle ?? "Refresh"}
        aria-label={props.refreshTitle ?? "Refresh"}
        onClick={props.onRefresh}
      />
    )
  }

  const builtFilters = () => {
    const nodes: JSX.Element[] = []
    const filter = filterNode()
    if (filter) nodes.push(filter)
    const sort = sortNode()
    if (sort) nodes.push(sort)
    const refresh = refreshNode()
    if (refresh) nodes.push(refresh)
    if (props.filters) nodes.push(props.filters)
    if (nodes.length === 0) return undefined
    return <>{nodes}</>
  }

  const builtActions = () => {
    const hasAdd = props.addLabel !== undefined && props.onAdd
    const hasTabs = props.tabs?.length && props.tab && props.onTab
    if (!hasAdd && !hasTabs && !props.actions) return undefined
    return (
      <div class="flex items-center gap-2">
        <Show when={hasTabs}>
          <RouteNav variant="tabs" items={props.tabs!} active={props.tab!} onSelect={props.onTab!} />
        </Show>
        <Show when={hasAdd}>
          <Button size="small" variant="primary" onClick={props.onAdd!}>
            <Icon name="plus-small" size="small" class="-ml-0.5 mr-1" />
            {props.addLabel}
          </Button>
        </Show>
        {props.actions}
      </div>
    )
  }

  return (
    <RouteView class={cx("h-full", props.viewClass, props.class)}>
      <RoutePanel compact={compact()} affordance={props.id} class="h-full min-h-0">
        <Show when={props.sidebar}>{props.sidebar}</Show>
        <div
          class={cx(
            "route-main relative flex min-h-0 min-w-0 flex-col",
            !split() && "flex-1",
            split() && "shrink-0 border-r border-border-weaker-base",
            props.mainClass,
          )}
          style={split() && props.mainWidth ? { width: props.mainWidth, flex: "0 0 auto" } : undefined}
        >
          <Show when={header()}>
            <RouteHeader
              sidebarToggle={props.sidebarToggle}
              title={props.title ?? ""}
              meta={props.meta}
              search={builtSearch()}
              filters={builtFilters()}
              actions={builtActions()}
            />
          </Show>
          <RouteContent
            padded={props.padded ?? true}
            scroll={props.scroll ?? true}
            class={cx(props.scroll === false && "flex min-h-0 flex-col", props.contentClass)}
          >
            {props.children}
          </RouteContent>
          <Show when={props.splitHandle}>{props.splitHandle}</Show>
        </div>
        <Show when={props.detail}>{props.detail}</Show>
      </RoutePanel>
    </RouteView>
  )
}

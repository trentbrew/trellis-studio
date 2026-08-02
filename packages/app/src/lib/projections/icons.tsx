import type { JSX } from "solid-js"
import {
  AudioLines,
  BarChart3,
  BookOpen,
  Bookmark,
  Boxes,
  CalendarDays,
  Camera,
  Clapperboard,
  Clock,
  Contact,
  FileText,
  Gamepad2,
  ImageIcon,
  Images,
  Layers,
  Library,
  Link2,
  ListChecks,
  Mail,
  Map,
  MapPin,
  MessagesSquare,
  Mic,
  Music,
  Newspaper,
  NotebookPen,
  PenLine,
  Package,
  Palette,
  Presentation,
  Rss,
  ShoppingBag,
  StickyNote,
  Table2,
  Timer,
  UsersRound,
} from "lucide-solid"
import type { ProjectionIcon } from "./types"

export function projectionIcon(icon: ProjectionIcon): () => JSX.Element {
  switch (icon) {
    case "whiteboards":
      return () => <PenLine class="size-[18px]" />
    case "calendar":
      return () => <CalendarDays class="size-[18px]" />
    case "notes":
      return () => <StickyNote class="size-[18px]" />
    case "content":
      return () => <FileText class="size-[18px]" />
    case "posts":
      return () => <Newspaper class="size-[18px]" />
    case "media":
      return () => <ImageIcon class="size-[18px]" />
    case "records":
      return () => <Table2 class="size-[18px]" />
    case "catalog":
      return () => <ShoppingBag class="size-[18px]" />
    case "products":
      return () => <Package class="size-[18px]" />
    case "metrics":
      return () => <BarChart3 class="size-[18px]" />
    case "levels":
      return () => <Map class="size-[18px]" />
    case "entities":
      return () => <UsersRound class="size-[18px]" />
    case "decks":
      return () => <Presentation class="size-[18px]" />
    case "slides":
      return () => <Layers class="size-[18px]" />
    case "scenes":
      return () => <Clapperboard class="size-[18px]" />
    case "scripts":
      return () => <FileText class="size-[18px]" />
    case "articles":
      return () => <BookOpen class="size-[18px]" />
    case "links":
      return () => <Link2 class="size-[18px]" />
    case "shotlist":
      return () => <ListChecks class="size-[18px]" />
    case "orders":
      return () => <Boxes class="size-[18px]" />
    case "themes":
      return () => <Palette class="size-[18px]" />
    case "audio":
      return () => <AudioLines class="size-[18px]" />
    case "sprites":
      return () => <Gamepad2 class="size-[18px]" />
    case "bookmarks":
      return () => <Bookmark class="size-[18px]" />
    case "contacts":
      return () => <Contact class="size-[18px]" />
    case "moodboards":
      return () => <Images class="size-[18px]" />
    case "voicememos":
      return () => <Mic class="size-[18px]" />
    case "places":
      return () => <MapPin class="size-[18px]" />
    case "clock":
      return () => <Clock class="size-[18px]" />
    case "journal":
      return () => <NotebookPen class="size-[18px]" />
    case "cron":
      return () => <Timer class="size-[18px]" />
    case "music":
      return () => <Music class="size-[18px]" />
    case "mail":
      return () => <Mail class="size-[18px]" />
    case "messages":
      return () => <MessagesSquare class="size-[18px]" />
    case "feeds":
      return () => <Rss class="size-[18px]" />
    case "books":
      return () => <Library class="size-[18px]" />
    case "camera":
      return () => <Camera class="size-[18px]" />
  }
}

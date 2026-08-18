import type { CSSProperties } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  CircleAlert,
  CircleCheckBig,
  Clock,
  Command,
  Copy,
  CornerDownLeft,
  Database,
  Download,
  Ellipsis,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Funnel,
  Globe,
  GripVertical,
  History,
  Inbox,
  Info,
  Layers,
  LayoutDashboard,
  Link,
  LoaderCircle,
  LogOut,
  MessageSquare,
  Minimize2,
  Minus,
  Network,
  NotebookPen,
  PanelLeft,
  Paperclip,
  Palette,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SendHorizontal,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Sprout,
  Square,
  StickyNote,
  Sun,
  Tag,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  TriangleAlert,
  Upload,
  User,
  Users,
  Workflow,
  X,
  Zap,
  type LucideIcon,
} from 'lucide-react';

/* Gaston Icon atom — wraps lucide-react with a kebab-case `name` string API so
   consumers stay decoupled from the underlying icon library. The mapped names
   below mirror the ICONS keys used by the Gaston prototype (Icon.jsx). */

const ICONS: Record<string, LucideIcon> = {
  'arrow-right': ArrowRight,
  'arrow-up-right': ArrowUpRight,
  'book-open': BookOpen,
  check: Check,
  'chevron-down': ChevronDown,
  'chevron-left': ChevronLeft,
  'chevron-right': ChevronRight,
  'chevron-up': ChevronUp,
  'chevrons-down': ChevronsDown,
  'chevrons-up': ChevronsUp,
  'circle-alert': CircleAlert,
  'circle-check-big': CircleCheckBig,
  clock: Clock,
  command: Command,
  copy: Copy,
  'corner-down-left': CornerDownLeft,
  database: Database,
  download: Download,
  ellipsis: Ellipsis,
  'external-link': ExternalLink,
  eye: Eye,
  'eye-off': EyeOff,
  'file-text': FileText,
  folder: Folder,
  'folder-open': FolderOpen,
  'folder-plus': FolderPlus,
  funnel: Funnel,
  globe: Globe,
  'grip-vertical': GripVertical,
  history: History,
  inbox: Inbox,
  info: Info,
  layers: Layers,
  'layout-dashboard': LayoutDashboard,
  link: Link,
  'loader-circle': LoaderCircle,
  'log-out': LogOut,
  'message-square': MessageSquare,
  'minimize-2': Minimize2,
  minus: Minus,
  network: Network,
  'notebook-pen': NotebookPen,
  'panel-left': PanelLeft,
  paperclip: Paperclip,
  palette: Palette,
  pencil: Pencil,
  plus: Plus,
  'refresh-cw': RefreshCw,
  search: Search,
  'send-horizontal': SendHorizontal,
  settings: Settings,
  'sliders-horizontal': SlidersHorizontal,
  sparkles: Sparkles,
  sprout: Sprout,
  square: Square,
  'sticky-note': StickyNote,
  sun: Sun,
  tag: Tag,
  'thumbs-down': ThumbsDown,
  'thumbs-up': ThumbsUp,
  'trash-2': Trash2,
  'triangle-alert': TriangleAlert,
  upload: Upload,
  user: User,
  users: Users,
  workflow: Workflow,
  x: X,
  zap: Zap,
};

export interface IconProps {
  /** Kebab-case Lucide name, e.g. "search", "sparkles", "file-text" */
  name: string;
  /** Rendered square size in px @default 16 */
  size?: number;
  /** Stroke width @default 2 */
  strokeWidth?: number;
  /** Stroke color @default "currentColor" */
  color?: string;
  /** Accessible label; omit for decorative icons */
  label?: string;
  className?: string;
  style?: CSSProperties;
}

export function Icon({
  name,
  size = 16,
  strokeWidth = 2,
  color = 'currentColor',
  label,
  className,
  style,
}: IconProps) {
  const LucideComponent = ICONS[name];
  if (!LucideComponent) {
    console.warn('[Gaston] Unknown icon: ' + name);
    return null;
  }
  return (
    <LucideComponent
      size={size}
      strokeWidth={strokeWidth}
      color={color}
      className={className}
      style={{ flexShrink: 0, ...style }}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

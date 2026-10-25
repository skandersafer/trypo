type IconProps = {
  size?: number
  className?: string
  filled?: boolean
}

function Svg({
  size = 20,
  className,
  filled,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export function PlaneIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z" />
    </Svg>
  )
}

export function TrainIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="3" width="16" height="14" rx="2" />
      <path d="M4 10h16" />
      <path d="M8 13.5h.01M16 13.5h.01" />
      <path d="M8 17l-2 4M16 17l2 4" />
    </Svg>
  )
}

export function BusIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="4" y="3" width="16" height="13" rx="2" />
      <path d="M4 10h16" />
      <circle cx="7.5" cy="18.5" r="1.5" />
      <circle cx="16.5" cy="18.5" r="1.5" />
    </Svg>
  )
}

export function FerryIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 16h18l-1.5 4.5h-15L3 16z" />
      <path d="M6 16V9h12v7" />
      <path d="M9 9V6h6v3" />
    </Svg>
  )
}

export function CarIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11" />
      <rect x="3" y="11" width="18" height="6" rx="1.5" />
      <path d="M7.5 17.5h.01M16.5 17.5h.01" />
    </Svg>
  )
}

export function BikeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="5.5" cy="17.5" r="3.5" />
      <circle cx="18.5" cy="17.5" r="3.5" />
      <path d="M5.5 17.5 9 9h4l4 8.5" />
      <path d="M9 9 7.5 5.5H5" />
    </Svg>
  )
}

export function PinIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </Svg>
  )
}

export function MapIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
      <path d="M9 4v14M15 6v14" />
    </Svg>
  )
}

export function BedIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 18v-8" />
      <path d="M3 14h18v4" />
      <path d="M21 14v-2a3 3 0 0 0-3-3h-7v5" />
      <circle cx="7" cy="10.5" r="1" />
    </Svg>
  )
}

export function WalletIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" />
      <path d="M3 5v14a2 2 0 0 0 2 2h16V7" />
      <path d="M18 12a1 1 0 0 0 0 4h-1a1 1 0 0 1-1-1v-2a1 1 0 0 1 1-1h1z" />
    </Svg>
  )
}

export function UsersIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6" />
      <path d="M16 5a3.5 3.5 0 0 1 0 7" />
      <path d="M17.5 14.5c2 .8 3.5 2.7 3.5 5.5" />
    </Svg>
  )
}

export function SparklesIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z" />
      <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" />
    </Svg>
  )
}

export function BoxIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M21 8l-9-5-9 5v8l9 5 9-5V8z" />
      <path d="M3 8l9 5 9-5" />
      <path d="M12 13v8" />
    </Svg>
  )
}

export function CompassIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" />
    </Svg>
  )
}

export function CalendarIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M8 3v4M16 3v4M3 10h18" />
    </Svg>
  )
}

export function HeartIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7 7-7z" />
    </Svg>
  )
}

export function GearIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Svg>
  )
}

export function DoorIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h8" />
      <path d="M10 12h11" />
      <path d="M18 9l3 3-3 3" />
    </Svg>
  )
}

export function TrashIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3 6h18" />
      <path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </Svg>
  )
}

export function NoteIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h6" />
    </Svg>
  )
}

export function CameraIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 8h3l2-2h6l2 2h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="14" r="3.5" />
    </Svg>
  )
}

export function SunIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Svg>
  )
}

export function CoinsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <ellipse cx="12" cy="6" rx="8" ry="3" />
      <path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6" />
      <path d="M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </Svg>
  )
}

export function GlobeIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3c2.5 2.6 3.8 5.7 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.7-3.8-9S9.5 5.6 12 3z" />
    </Svg>
  )
}

export function PencilIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M17 3l4 4L8 20l-5 1 1-5L17 3z" />
      <path d="M15 5l4 4" />
    </Svg>
  )
}

export function CheckIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4 12.5l5 5L20 6.5" />
    </Svg>
  )
}

export function DotsIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="5" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function LockIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <rect x="5" y="10" width="14" height="10" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </Svg>
  )
}

export function QuestionIcon(props: IconProps) {
  return (
    <Svg {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.4a2.5 2.5 0 1 1 3.5 2.3c-.8.4-1.1.8-1.1 1.8" />
      <path d="M12 17h.01" />
    </Svg>
  )
}

export function ChevronIcon(props: IconProps) {  return (
    <Svg {...props}>
      <path d="M9 5l7 7-7 7" />
    </Svg>
  )
}

export function TransportIcon({ type, size = 20 }: { type: string; size?: number }) {
  const t = (type || "").toLowerCase()
  if (t.includes("flight") || t.includes("plane")) return <PlaneIcon size={size} />
  if (t.includes("train") || t.includes("rail")) return <TrainIcon size={size} />
  if (t.includes("bus") || t.includes("coach") || t.includes("shuttle")) return <BusIcon size={size} />
  if (t.includes("ferry") || t.includes("boat") || t.includes("ship")) return <FerryIcon size={size} />
  if (t.includes("taxi") || t.includes("grab") || t.includes("car") || t.includes("cab") || t.includes("ride")) return <CarIcon size={size} />
  if (t.includes("motor") || t.includes("bike") || t.includes("scooter")) return <BikeIcon size={size} />
  return <BusIcon size={size} />
}

export function ToolIcon({ name, size = 20 }: { name: string; size?: number }) {
  const n = (name || "").toLowerCase()
  if (n.includes("pack")) return <BoxIcon size={size} />
  if (n.includes("crew tracker") || n.includes("find crew")) return <PinIcon size={size} />
  if (n.includes("crew") || n.includes("sharing") || n.includes("collaborat") || n.includes("trip crew")) return <UsersIcon size={size} />
  if (n.includes("memor") || n.includes("photo") || n.includes("journal")) return <CameraIcon size={size} />
  if (n.includes("gem") || n.includes("hidden") || n.includes("explore")) return <CompassIcon size={size} />
  if (n.includes("vibe") || n.includes("tripo ai")) return <SparklesIcon size={size} />
  if (n.includes("weather") || n.includes("forecast")) return <SunIcon size={size} />
  if (n.includes("currenc") || n.includes("converter") || n.includes("rate")) return <CoinsIcon size={size} />
  if (n.includes("split") || n.includes("bill") || n.includes("budget")) return <WalletIcon size={size} />
  if (n.includes("stay") || n.includes("book") || n.includes("hotel")) return <BedIcon size={size} />
  if (n.includes("calendar") || n.includes("trip") || n.includes("itinerar")) return <CalendarIcon size={size} />
  if (n.includes("saved") || n.includes("heart") || n.includes("place")) return <HeartIcon size={size} />
  if (n.includes("setting")) return <GearIcon size={size} />
  if (n.includes("logout") || n.includes("log out") || n.includes("disconnect")) return <DoorIcon size={size} />
  if (n.includes("delete") || n.includes("erase")) return <TrashIcon size={size} />
  if (n.includes("edit") || n.includes("profile") || n.includes("pencil")) return <PencilIcon size={size} />
  if (n.includes("world") || n.includes("map") || n.includes("communit") || n.includes("globe")) return <GlobeIcon size={size} />
  if (n.includes("note")) return <NoteIcon size={size} />
  if (n.includes("check")) return <CheckIcon size={size} />
  return <BoxIcon size={size} />
}

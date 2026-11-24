import type { ReactNode } from 'react'

type IconProps = { size?: number }

function Icon({ size = 17, children }: IconProps & { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  )
}

export function SearchIcon(props: IconProps) {
  return <Icon {...props}><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></Icon>
}

export function CameraIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="14" r="3.5" />
    </Icon>
  )
}

export function UploadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M12 15V4" /><path d="M7.5 8.5L12 4l4.5 4.5" /><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" />
    </Icon>
  )
}

export function SwitchCameraIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path d="M20 7h-9a5 5 0 0 0-5 5v1" /><path d="M17 4l3 3-3 3" />
      <path d="M4 17h9a5 5 0 0 0 5-5v-1" /><path d="M7 20l-3-3 3-3" />
    </Icon>
  )
}

export function PrinterIcon(props: IconProps) {
  return <Icon {...props}><path d="M7 9V3h10v6" /><rect x="3" y="9" width="18" height="8" rx="1" /><path d="M7 14h10v7H7z" /></Icon>
}

export function LogoMark(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="9" cy="12" r="6" />
      <circle cx="15" cy="12" r="6" />
      <path d="M12 6.8A6 6 0 0 1 12 17.2A6 6 0 0 1 12 6.8Z" fill="currentColor" stroke="none" />
    </Icon>
  )
}

export function SunIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Icon>
  )
}

export function MoonIcon(props: IconProps) {
  return <Icon {...props}><path d="M20 14.2A8 8 0 1 1 9.8 4a6.4 6.4 0 0 0 10.2 10.2z" /></Icon>
}
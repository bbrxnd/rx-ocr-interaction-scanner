import type { ReactNode } from 'react'

// Small line icons. They are decorative: the button or text next to them says what they mean.

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

export function AlertIcon(props: IconProps) {
  return <Icon {...props}><path d="M12 3l9.5 17H2.5L12 3z" /><path d="M12 10v4" /><path d="M12 17.5v.5" /></Icon>
}

export function InfoIcon(props: IconProps) {
  return <Icon {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5" /><path d="M12 16.5v.5" /></Icon>
}
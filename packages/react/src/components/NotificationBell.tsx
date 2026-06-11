import type { CSSProperties } from 'react';

/** Props for {@link NotificationBell}. */
export interface NotificationBellProps {
  /** Unread count shown in the badge; hidden when `0`. */
  count: number;
  /** Click handler (e.g. toggle the inbox panel). */
  onClick?: () => void;
  /** Accessible label. Default describes the unread count. */
  ariaLabel?: string;
  /** Marks the controlled panel as expanded (for `aria-expanded`). */
  expanded?: boolean;
  /** Cap the displayed number (e.g. `99+`). Default 99. */
  max?: number;
  className?: string;
  style?: CSSProperties;
  /** Override the bell glyph. */
  icon?: React.ReactNode;
}

const buttonStyle: CSSProperties = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 40,
  height: 40,
  padding: 0,
  border: 'none',
  borderRadius: 8,
  background: 'transparent',
  cursor: 'pointer',
  color: 'inherit',
};

const badgeStyle: CSSProperties = {
  position: 'absolute',
  top: 4,
  right: 4,
  minWidth: 16,
  height: 16,
  padding: '0 4px',
  borderRadius: 8,
  background: '#ef4444',
  color: '#fff',
  fontSize: 10,
  lineHeight: '16px',
  fontWeight: 600,
  textAlign: 'center',
  boxSizing: 'border-box',
};

const defaultIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 2a6 6 0 0 0-6 6c0 3.6-1 5.6-2 6.7-.3.4 0 1 .5 1h15c.5 0 .8-.6.5-1-1-1.1-2-3.1-2-6.7a6 6 0 0 0-6-6Z"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M10 19a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

/**
 * Composable bell button with an unread badge. State-free — pass `count` and
 * an `onClick`. Used standalone or by {@link Inbox}.
 */
export function NotificationBell({
  count,
  onClick,
  ariaLabel,
  expanded,
  max = 99,
  className,
  style,
  icon,
}: NotificationBellProps) {
  const label = ariaLabel ?? (count > 0 ? `Notifications, ${count} unread` : 'Notifications');
  const display = count > max ? `${max}+` : String(count);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-haspopup="true"
      aria-expanded={expanded}
      className={className}
      style={{ ...buttonStyle, ...style }}
    >
      {icon ?? defaultIcon}
      {count > 0 ? (
        <span style={badgeStyle} aria-hidden="true">
          {display}
        </span>
      ) : null}
    </button>
  );
}

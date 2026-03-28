/** Icons for main navigation tabs (stroke style, matches rules/toolbar icons). */

export type MainNavTabId = 'live' | 'history' | 'config' | 'logs' | 'help';

const svgProps = {
  className: 'tab-nav-icon',
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none' as const,
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true as const,
};

function IconLive() {
  return (
    <svg {...svgProps}>
      {/* Live stream: radio / signal */}
      <path d="M4.9 19.1A9.96 9.96 0 0 1 2 12a10 10 0 0 1 10-10 10 10 0 0 1 10 10" />
      <path d="M7.8 16.2A5.5 5.5 0 0 1 6 12a6 6 0 0 1 12 0c0 1.54-.58 2.94-1.54 4" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function IconHistory() {
  return (
    <svg {...svgProps}>
      <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l4 2" />
    </svg>
  );
}

function IconConfig() {
  return (
    <svg {...svgProps}>
      <path d="M4 21v-7" />
      <path d="M4 10V3" />
      <path d="M12 21v-9" />
      <path d="M12 8V3" />
      <path d="M20 21v-5" />
      <path d="M20 12V3" />
      <path d="M1 14h6" />
      <path d="M9 8h6" />
      <path d="M17 16h6" />
    </svg>
  );
}

function IconLogs() {
  return (
    <svg {...svgProps}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M16 13H8" />
      <path d="M16 17H8" />
      <path d="M10 9H8" />
    </svg>
  );
}

function IconHelp() {
  return (
    <svg {...svgProps}>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <path d="M12 17h.01" />
    </svg>
  );
}

export function MainNavTabIcon({ tabId }: { tabId: MainNavTabId }) {
  switch (tabId) {
    case 'live':
      return <IconLive />;
    case 'history':
      return <IconHistory />;
    case 'config':
      return <IconConfig />;
    case 'logs':
      return <IconLogs />;
    case 'help':
      return <IconHelp />;
    default:
      return null;
  }
}

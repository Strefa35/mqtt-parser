export function IconRuleEdit() {
  return (
    <svg
      className="rules-icon-svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      aria-hidden={true}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

/** Half-filled circle (contrast / theme), matches main nav icon style. */
export function IconThemeContrast() {
  return (
    <svg
      className="tabs-theme-icon-svg"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden={true}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path
        d="M12 4.5A7.5 7.5 0 0 0 12 19.5Z"
        fill="currentColor"
        fillOpacity="0.45"
        stroke="none"
      />
      <path d="M12 4.5a7.5 7.5 0 0 1 0 15" fill="none" />
    </svg>
  );
}

export function IconChevronDownSmall() {
  return (
    <svg
      className="tabs-theme-chevron-svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      aria-hidden={true}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

/** MQTT / broker hint for header Mosquitto toggle (waves + node). */
export function IconMqttBrokerKnob() {
  return (
    <svg
      className="mosquitto-toggle-knob-icon"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      aria-hidden={true}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20v-3" />
      <path d="M8.5 14a3.5 3.5 0 0 1 7 0" />
      <path d="M5 10a7 7 0 0 1 14 0" />
      <circle cx="12" cy="20" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconTrash() {
  return (
    <svg
      className="rules-icon-svg"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      aria-hidden={true}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}


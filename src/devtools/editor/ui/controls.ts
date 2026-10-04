import { createTransportIcon, type TransportIconName } from "./icons";

export type EditorActionName =
  | "toggle-timelines"
  | "jump-to-scrolltrigger-target"
  | "toggle-scrolltrigger-markers"
  | "toggle-reverse"
  | "toggle-loop"
  | "toggle-play"
  | "replay"
  | "reset-timeline-zoom"
  | "zoom-out"
  | "zoom-in"
  | "toggle-timeline-visibility"
  | "close-inspector"
  | "copy-debug-json";

interface ActionButtonConfiguration {
  readonly action: EditorActionName;
  readonly title?: string;
  readonly icon?: TransportIconName;
  readonly variants?: readonly string[];
  readonly pressed?: boolean;
  readonly expanded?: boolean;
  readonly controls?: string;
}

type ActionButtonAccessibleName =
  | { readonly label: string; readonly accessibleLabel?: string }
  | { readonly label?: string; readonly accessibleLabel: string };

export type ActionButtonOptions = ActionButtonConfiguration & ActionButtonAccessibleName;

export function createActionButton({
  action,
  label = "",
  accessibleLabel,
  title,
  icon,
  variants = [],
  pressed,
  expanded,
  controls,
}: ActionButtonOptions): HTMLButtonElement {
  const button = document.createElement("button");
  button.className = "devtools-editor__action";
  button.textContent = label;
  button.type = "button";
  button.dataset.action = action;
  button.classList.add(...variants);
  if (accessibleLabel !== undefined) button.setAttribute("aria-label", accessibleLabel);
  if (title !== undefined) button.title = title;
  if (pressed !== undefined) button.setAttribute("aria-pressed", String(pressed));
  if (expanded !== undefined) button.setAttribute("aria-expanded", String(expanded));
  if (controls !== undefined) button.setAttribute("aria-controls", controls);
  if (icon !== undefined) button.append(createTransportIcon(icon));
  return button;
}

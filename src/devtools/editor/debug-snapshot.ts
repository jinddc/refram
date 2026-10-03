import type { EditorSnapshot } from "./controller";
import type {
  TimelineScrollTriggerMarkerConfig,
  TimelineScrollTriggerMarkers,
} from "../timeline/session";

const DEBUG_SNAPSHOT_SCHEMA_VERSION = 1;

function boundedIdentity(value: string, maximumLength: number): string {
  return value.replace(/[\r\n\t]/g, " ").slice(0, maximumLength);
}

function describeTarget(target: Element): string {
  const tag = target.localName || "element";
  const id = target.id ? `#${boundedIdentity(target.id, 80)}` : "";
  const classes = [...target.classList]
    .slice(0, 4)
    .map((name) => `.${boundedIdentity(name, 64)}`)
    .join("");
  return `${tag}${id}${classes}`;
}

export function createSelectedTrackDebugJson(snapshot: EditorSnapshot): string | undefined {
  const inspector = snapshot.view.inspector;
  const selectedItem = snapshot.selectedItem;
  const timelineId = snapshot.activeTimelineId;
  if (!inspector || !selectedItem || !timelineId) return undefined;

  const timeline = snapshot.view.timelines.find(({ id }) => id === timelineId);
  const ease = inspector.mixedEase ? "Mixed" : inspector.ease ?? "Unavailable";
  const descriptors = [...new Set(selectedItem.sources.map(describeTarget))];
  return JSON.stringify({
    schemaVersion: DEBUG_SNAPSHOT_SCHEMA_VERSION,
    timeline: {
      id: timelineId,
      label: timeline?.label ?? timelineId,
    },
    track: {
      label: inspector.label,
      type: inspector.mapping,
      start: inspector.start,
      duration: inspector.duration,
      end: inspector.end,
      ease,
      targets: {
        animatedCount: inspector.animatedTargetCount,
        visualCount: inspector.visualTargetCount,
        descriptors,
      },
      properties: inspector.properties,
    },
  }, null, 2);
}

const MARKER_CONFIG_KEYS = [
  "startColor",
  "endColor",
  "fontSize",
  "fontWeight",
  "indent",
] as const satisfies readonly (keyof TimelineScrollTriggerMarkerConfig)[];

function markerConfigLines(config: TimelineScrollTriggerMarkerConfig): readonly string[] {
  return MARKER_CONFIG_KEYS.flatMap((key) => {
    const value = config[key];
    return value === undefined ? [] : [`  ${key}: ${JSON.stringify(value)},`];
  });
}

export function createScrollTriggerMarkersConfig(snapshot: EditorSnapshot): string | undefined {
  const markers: TimelineScrollTriggerMarkers | undefined = snapshot.view.scrollTrigger?.markers;
  if (markers === undefined) return undefined;
  if (markers === false || markers === true) return "markers: true";
  const lines = markerConfigLines(markers);
  return lines.length === 0
    ? "markers: {}"
    : ["markers: {", ...lines, "}"].join("\n");
}

export async function copyTextToClipboard(
  text: string,
  document: Document,
): Promise<boolean> {
  const clipboard = document.defaultView?.navigator.clipboard;
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // A blocked Clipboard API can still fall back to the document copy command.
    }
  }

  const legacyDocument = document as Document & {
    execCommand?: (command: string) => boolean;
  };
  if (typeof legacyDocument.execCommand !== "function") return false;

  const activeElement = document.activeElement;
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.readOnly = true;
  textarea.setAttribute("aria-hidden", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.append(textarea);
  textarea.select();
  try {
    return legacyDocument.execCommand("copy");
  } catch {
    return false;
  } finally {
    textarea.remove();
    if (activeElement instanceof HTMLElement) activeElement.focus();
  }
}

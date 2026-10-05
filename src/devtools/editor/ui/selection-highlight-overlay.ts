interface HighlightedSource {
  readonly source: Element;
  readonly selectionAttribute: string | null;
  readonly box: HTMLDivElement;
  readonly label: HTMLSpanElement;
}

export interface SelectionHighlightOverlay {
  syncTheme(source: Element): void;
  update(sources: readonly Element[], label?: string): void;
  destroy(): void;
}

interface HighlightTheme {
  readonly accent: string;
  readonly onAccent: string;
  readonly fontFamily: string;
}

const DARK_THEME: HighlightTheme = {
  accent: "#55adff",
  onAccent: "#071316",
  fontFamily: "-apple-system, \"SF Pro Text\", \"Segoe UI\", Roboto, Helvetica, Arial, sans-serif",
};

const LIGHT_THEME: HighlightTheme = {
  accent: "#087b8a",
  onAccent: "#ffffff",
  fontFamily: DARK_THEME.fontFamily,
};

function sourceLabel(source: Element): string {
  const tag = source.tagName.toLowerCase();
  return source.id ? `${tag}#${source.id}` : tag;
}

function createRoot(ownerDocument: Document): HTMLDivElement {
  const root = ownerDocument.createElement("div");
  root.dataset.rfHighlightRoot = "";
  root.setAttribute("aria-hidden", "true");
  root.style.position = "fixed";
  root.style.inset = "0";
  root.style.zIndex = "2147483646";
  root.style.pointerEvents = "none";
  root.style.overflow = "visible";
  return root;
}

function createBox(ownerDocument: Document, theme: HighlightTheme): {
  readonly box: HTMLDivElement;
  readonly label: HTMLSpanElement;
} {
  const box = ownerDocument.createElement("div");
  box.dataset.rfHighlight = "";
  box.style.position = "absolute";
  box.style.boxSizing = "border-box";
  box.style.border = `2px solid ${theme.accent}`;
  box.style.borderRadius = "3px";
  box.style.boxShadow = "none";
  box.style.pointerEvents = "none";

  const label = ownerDocument.createElement("span");
  label.dataset.rfHighlightLabel = "";
  label.style.position = "absolute";
  label.style.left = "-2px";
  label.style.padding = "3px 6px";
  label.style.borderRadius = "3px 3px 3px 0";
  label.style.background = theme.accent;
  label.style.color = theme.onAccent;
  label.style.fontFamily = theme.fontFamily;
  label.style.fontSize = "10px";
  label.style.fontWeight = "600";
  label.style.lineHeight = "1.4";
  label.style.letterSpacing = "0.02em";
  label.style.whiteSpace = "nowrap";
  label.style.maxWidth = "min(280px, calc(100vw - 16px))";
  label.style.overflow = "hidden";
  label.style.textOverflow = "ellipsis";
  box.append(label);
  return { box, label };
}

export function createSelectionHighlightOverlay(
  ownerDocument: Document,
): SelectionHighlightOverlay {
  let root: HTMLDivElement | undefined;
  let highlightedSources: HighlightedSource[] = [];
  let currentLabel: string | undefined;
  let theme = DARK_THEME;

  const applyTheme = (): void => {
    for (const highlighted of highlightedSources) {
      highlighted.box.style.borderColor = theme.accent;
      highlighted.box.style.boxShadow = "none";
      highlighted.label.style.background = theme.accent;
      highlighted.label.style.color = theme.onAccent;
      highlighted.label.style.fontFamily = theme.fontFamily;
    }
  };

  const updateLabels = (): void => {
    for (const highlighted of highlightedSources) {
      highlighted.label.textContent = currentLabel
        ? `${currentLabel} · ${sourceLabel(highlighted.source)}`
        : sourceLabel(highlighted.source);
    }
  };

  const clear = (): void => {
    for (const highlighted of highlightedSources) {
      if (highlighted.selectionAttribute === null) {
        highlighted.source.removeAttribute("data-rf-selected");
      } else {
        highlighted.source.setAttribute(
          "data-rf-selected",
          highlighted.selectionAttribute,
        );
      }
    }
    highlightedSources = [];
    currentLabel = undefined;
    root?.remove();
    root = undefined;
  };

  const mount = (sources: readonly Element[], label: string | undefined): void => {
    root = createRoot(ownerDocument);
    const parent = ownerDocument.body ?? ownerDocument.documentElement;
    parent.append(root);
    currentLabel = label;
    highlightedSources = sources.map((source) => {
      const { box, label: boxLabel } = createBox(ownerDocument, theme);
      const highlighted = {
        source,
        selectionAttribute: source.getAttribute("data-rf-selected"),
        box,
        label: boxLabel,
      } satisfies HighlightedSource;
      source.setAttribute("data-rf-selected", "true");
      root!.append(box);
      return highlighted;
    });
    updateLabels();
  };

  const position = (): void => {
    for (const highlighted of highlightedSources) {
      const bounds = highlighted.source.getBoundingClientRect();
      const measurable = highlighted.source.isConnected
        && Number.isFinite(bounds.left)
        && Number.isFinite(bounds.top)
        && bounds.width > 0
        && bounds.height > 0;
      highlighted.box.hidden = !measurable;
      if (!measurable) continue;
      highlighted.box.style.left = `${bounds.left}px`;
      highlighted.box.style.top = `${bounds.top}px`;
      highlighted.box.style.width = `${bounds.width}px`;
      highlighted.box.style.height = `${bounds.height}px`;
      highlighted.label.style.top = bounds.top >= 26 ? "-24px" : "0";
    }
  };

  return {
    syncTheme(source) {
      const style = ownerDocument.defaultView?.getComputedStyle(source);
      const rootNode = source.getRootNode();
      const light = rootNode instanceof ShadowRoot
        && rootNode.host instanceof HTMLElement
        && rootNode.host.dataset.theme === "light";
      const fallback = light ? LIGHT_THEME : DARK_THEME;
      const computedFontFamily = style?.fontFamily.trim();
      theme = {
        accent: style?.getPropertyValue("--rf-accent").trim() || fallback.accent,
        onAccent: style?.getPropertyValue("--rf-on-accent").trim() || fallback.onAccent,
        fontFamily: computedFontFamily
          && !/(?:monospace|\bmono\b|times new roman|(?:^|,)\s*["']?serif["']?\s*(?:,|$))/i.test(computedFontFamily)
          ? computedFontFamily
          : fallback.fontFamily,
      };
      applyTheme();
    },
    update(sources, label) {
      const sourcesChanged = sources.length !== highlightedSources.length
        || sources.some((source, index) => source !== highlightedSources[index]?.source);
      if (sources.length === 0) {
        if (highlightedSources.length > 0) clear();
        return;
      }
      if (sourcesChanged) {
        clear();
        mount(sources, label);
      } else {
        const labelChanged = currentLabel !== label;
        currentLabel = label;
        if (labelChanged) updateLabels();
      }
      position();
    },
    destroy: clear,
  };
}

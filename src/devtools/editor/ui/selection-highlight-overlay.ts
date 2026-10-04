interface HighlightedSource {
  readonly source: Element;
  readonly selectionAttribute: string | null;
  readonly box: HTMLDivElement;
  readonly label: HTMLSpanElement;
}

export interface SelectionHighlightOverlay {
  update(sources: readonly Element[], label?: string): void;
  destroy(): void;
}

const ACCENT = "#47d7e8";

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

function createBox(ownerDocument: Document): {
  readonly box: HTMLDivElement;
  readonly label: HTMLSpanElement;
} {
  const box = ownerDocument.createElement("div");
  box.dataset.rfHighlight = "";
  box.style.position = "absolute";
  box.style.boxSizing = "border-box";
  box.style.border = `2px solid ${ACCENT}`;
  box.style.borderRadius = "3px";
  box.style.boxShadow = [
    "0 0 0 1px rgb(4 16 20 / 72%)",
    "0 0 18px rgb(71 215 232 / 30%)",
  ].join(", ");
  box.style.pointerEvents = "none";

  const label = ownerDocument.createElement("span");
  label.dataset.rfHighlightLabel = "";
  label.style.position = "absolute";
  label.style.left = "-2px";
  label.style.padding = "3px 6px";
  label.style.borderRadius = "3px 3px 3px 0";
  label.style.background = ACCENT;
  label.style.color = "#041014";
  label.style.font = "600 10px/1.4 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
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
      const { box, label: boxLabel } = createBox(ownerDocument);
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

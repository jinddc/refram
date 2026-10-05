# Refram

Visual timeline debugger for authored GSAP animations.

Refram adds a development-only editor to your page. Your application continues
to own its timelines and ScrollTriggers; Refram observes registered timelines,
shows their tracks and scroll ranges, and exposes playback controls without
becoming the animation runtime.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [API](#api)
- [Naming tracks with data-label](#naming-tracks-with-data-label)
- [ScrollTrigger](#scrolltrigger)
- [Framework integration](#framework-integration)

## Install

GSAP is the host application's runtime dependency. Refram is normally a
development dependency:

```sh
npm install gsap
npm install --save-dev refram
```

Keep the dynamic `import("refram")` behind your build tool's development flag so
the editor and registration calls can be removed from production bundles.

The package can also be statically imported during SSR without DOM globals.
Creating `new Refram()` and registering DOM-backed timelines still belong in
client-side lifecycle hooks. A static import alone does not make those calls
server-safe or exclude the editor from production bundles; the examples below
retain development-gated dynamic imports for that purpose.

## Quick start

Mount one editor at the application or layout boundary:

```ts
// app.ts
let appDisposed = false;
let editor: import("refram").Refram | undefined;

if (import.meta.env.DEV) {
  void import("refram").then(({ Refram }) => {
    if (appDisposed) return;
    editor = new Refram();
  });
}

function cleanupApp(): void {
  appDisposed = true;
  editor?.destroy();
}

import.meta.hot?.dispose(cleanupApp);
```

Register each timeline in the component or module that owns the animation:

```ts
// hero.ts
import { gsap } from "gsap";

const root = document.querySelector<HTMLElement>("#hero")!;
const target = root.querySelector<HTMLElement>(".hero__title")!;
const timeline = gsap.timeline().to(target, { y: 0, autoAlpha: 1, duration: 0.8 });
let ownerDisposed = false;
let registration: import("refram").MotionTimelineRegistration | undefined;

if (import.meta.env.DEV) {
  void import("refram").then(({ registerTimeline }) => {
    if (ownerDisposed) return;
    registration = registerTimeline({
      id: "hero-intro",
      label: "Hero intro",
      root,
      timeline,
    });
  });
}

function cleanupHero(): void {
  if (ownerDisposed) return;
  ownerDisposed = true;
  registration?.destroy();
  timeline.kill();
}

import.meta.hot?.dispose(cleanupHero);
```

The cancellation check matters: a development-only dynamic import can finish
after its owner has unmounted. Refram injects its styles into the `<rf-editor>`
Shadow DOM, so no CSS import is required. Only one editor can be mounted in a
document at a time; any number of timelines can be registered.

## API

### `new Refram(options?)`

Mounts the editor immediately and uses the default timeline registry.

| Option | Type | Required | Description |
| --- | --- | --- | --- |
| `container` | `HTMLElement` | No | Connected mount container. Defaults to `document.body`. |
| `theme` | `"dark" \| "light"` | No | Initial editor theme. |

| Member | Type | Description |
| --- | --- | --- |
| `domElement` | `HTMLElement` | The mounted `<rf-editor>` element. |
| `controller` | `EditorController` | Imperative inspection and transport controller. |
| `destroy()` | `() => void` | Unmounts the editor and releases document ownership. Idempotent. |

### `editor.controller`

| Method | Returns | Usage |
| --- | --- | --- |
| `getSnapshot()` | `EditorSnapshot` | Read current editor state. |
| `subscribe(listener)` | `() => void` | Observe snapshots; call the returned function to unsubscribe. |
| `selectTimeline(id: string)` | `boolean` | Select a registered timeline. |
| `selectTrack(key: string)` | `boolean` | Select a track by its resolved editor key. |
| `selectItem(index: number)` | `boolean` | Select an inspected item by index. |
| `clearTrackSelection()` | `boolean` | Clear the selected track. |
| `play()` / `pause()` / `replay()` | `boolean` | Control the active timeline. |
| `seek(progress: number)` | `boolean` | Seek using normalized progress from `0` (start) to `1` (end); scrub timelines seek through their scroll range. |
| `setTimeScale(value: number)` | `boolean` | Set a positive playback multiplier, for example `0.5` or `2`. |
| `setReversed(value: boolean)` | `boolean` | Change playback direction. |
| `setLooping(value: boolean)` | `boolean` | Toggle preview looping. |
| `jumpToScrollTriggerTarget()` | `boolean` | Scroll to the active trigger element. |
| `toggleScrollTriggerMarkers()` | `boolean` | Toggle the active trigger's markers. |

Boolean-returning commands return `false` when the operation is unavailable.
For normal teardown, call `editor.destroy()`; calling the underlying controller's
`destroy()` alone does not remove the editor host.

### `registerTimeline(declaration, registry?)`

Registers a direct or rebuildable timeline. The optional registry defaults to
`defaultTimelineRegistry`.

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `id` | `string` | Yes | Unique, non-empty registry key. |
| `root` | `HTMLElement` | Yes | Preview/target-resolution boundary owned by the animation. |
| `label` | `string` | No | Human-readable name; defaults to `id`. |
| `timeline` | `gsap.core.Timeline` | Direct only | Existing host-owned timeline. |
| `tracks` | `MotionTimelineTrackDeclaration[]` | No (direct) | Explicit rows for selected child tweens. |
| `replay` | `"restart"` | No (direct) | Documents the direct timeline's rewind strategy. |
| `create` | `() => RebuildableMotionTimelineRuntime` | Rebuildable only | Creates a fresh timeline runtime. |
| `reset` | `() => void` | No (rebuildable) | Restores DOM state before a rebuild. |
| `replay` | `"rebuild"` | No (rebuildable) | Documents the reconstruction strategy. |

Direct registrations replay by rewinding the same timeline. Destroying the
registration does **not** kill the host-owned timeline:

```ts
const titleTween = gsap.to(title, { y: 0, duration: 0.6 });
const copyTween = gsap.to(copy, { autoAlpha: 1, duration: 0.4 });
const timeline = gsap.timeline().add(titleTween).add(copyTween, "-=0.2");

const registration = registerTimeline({
  id: "hero",
  root,
  timeline,
  tracks: [
    { id: "title", label: "Title", animation: titleTween, targets: title },
    { id: "copy", animations: [copyTween], targets: [copy] },
  ],
});

function cleanupHero(): void {
  registration.destroy();
  timeline.kill();
}
```

Use a rebuildable registration when replay must reconstruct DOM or graphics
resources. Refram calls the current runtime's `dispose()` before rebuilding and
again when the registration is destroyed. Each runtime must return `timeline`
and `dispose()`; `tracks` is optional:

```ts
const registration = registerTimeline({
  id: "particle-intro",
  root,
  replay: "rebuild",
  reset: () => root.replaceChildren(),
  create: () => {
    const canvas = document.createElement("canvas");
    root.append(canvas);
    const tween = gsap.to(canvas, { autoAlpha: 1, duration: 1 });
    const timeline = gsap.timeline().add(tween);

    return {
      timeline,
      tracks: [{ id: "particles", animation: tween, targets: canvas }],
      dispose: () => {
        timeline.kill();
        canvas.remove();
      },
    };
  },
});
```

The returned `MotionTimelineRegistration` exposes `id`, `label`, `root`,
`timeline`, `tracks`, `replayStrategy`, `replayState`, `subscribe()`, `replay()`
and idempotent `destroy()`.

### Naming tracks with `data-label`

Set `data-label` on an animated element to give its automatically detected track
a readable name. You do not need to declare `tracks` just to name a DOM target:

```html
<section id="hero">
  <h1 class="hero__title" data-label="Hero heading">Hello motion</h1>
  <p class="hero__copy" data-label="Supporting copy">Inspect this sequence.</p>
</section>
```

```ts
const root = document.querySelector<HTMLElement>("#hero")!;
const timeline = gsap.timeline()
  .from(root.querySelector(".hero__title"), { y: 24, autoAlpha: 0 })
  .from(root.querySelector(".hero__copy"), { autoAlpha: 0 });

const registration = registerTimeline({
  id: "hero-intro",
  label: "Hero intro", // Names the timeline, not the individual tracks.
  root,
  timeline,
});
```

The two automatic tracks display **Hero heading** and **Supporting copy**.
Track names follow this priority:

1. An explicit track declaration's resolved name (`tracks[].label`, or its `id`
   when `label` is omitted).
2. A non-empty `data-label` on the automatic track's source element.
3. An automatic selector-style name, such as `h1.hero__title`.

For an automatic tween with several DOM targets, the source is its first target;
the editor does not combine all of their `data-label` values. Use an explicit
track declaration when you want to name a group deliberately.

The attribute works the same way in React JSX, Vue templates and Svelte markup:

```tsx
<h1 data-label="Hero heading">Hello motion</h1>
```

`data-label` is display metadata: it does not register a timeline, change the
animation, or provide a unique registration/track ID. Register the owning
timeline separately as shown above.

### Registries

`createTimelineRegistry()` creates an isolated registry with `register()`,
`getSnapshot()`, `subscribe()` and `destroy()`. Pass it as the second argument
to `registerTimeline(declaration, registry)`. The current `Refram` constructor
always reads `defaultTimelineRegistry`; custom registries are intended for
headless/custom tooling until editor registry injection is added.

## ScrollTrigger

Import and register ScrollTrigger with GSAP before creating the timeline. Put
the ScrollTrigger on the same timeline that you pass to `registerTimeline` so
Refram can inspect its scroll driver:

```ts
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { registerTimeline } from "refram";

gsap.registerPlugin(ScrollTrigger);

const root = document.querySelector<HTMLElement>("#story")!;
const panel = root.querySelector<HTMLElement>(".story__panel")!;
const timeline = gsap.timeline({
  scrollTrigger: {
    id: "story-scroll",
    trigger: root,
    start: "top 80%",
    end: "bottom 20%",
    scrub: 0.5,
  },
}).to(panel, { xPercent: 40 });

const registration = registerTimeline({ id: "story", root, timeline });

function cleanupStory(): void {
  registration.destroy();
  timeline.scrollTrigger?.kill();
  timeline.kill();
}
```

- `scrub: true` ties timeline progress directly to scroll; a number adds catch-up
  smoothing. Refram seeks through the scroll driver rather than playing it as a
  free-running timeline.
- For enter/leave behavior, omit `scrub` and use four-position `toggleActions`,
  for example `"play pause resume reset"`.
- For a scrollable element, set `scroller` to that element on the registered
  timeline's ScrollTrigger:

```ts
const scroller = document.querySelector<HTMLElement>(".story-scroller")!;
const timeline = gsap.timeline({
  scrollTrigger: {
    trigger: root,
    scroller,
    start: "top center",
    toggleActions: "play pause resume reset",
  },
});
```

Registration cleanup only disconnects Refram. The owning component must kill
its timeline and ScrollTrigger. A rebuildable runtime should do that work in
`dispose()` instead. See the official [ScrollTrigger reference](https://gsap.com/docs/v3/Plugins/ScrollTrigger/)
and [plugin registration guidance](https://gsap.com/docs/v3/GSAP/gsap.registerPlugin()/).

## Framework integration

### Lenis and nested scrolling

Refram marks its editor host and internal UI with `data-lenis-prevent`, so Lenis
leaves wheel and touch gestures inside the devtools to native browser scrolling.
The Inspector, timeline viewport, and timeline list also contain overscroll at
their edges. No Lenis dependency or instance configuration is required for this
exclusion. See [Lenis nested-scroll guidance](https://github.com/darkroomengineering/lenis#nested-scroll).

The ownership rule is the same everywhere: mount one `Refram` in the application
shell/layout, and register a timeline in the component that creates and cleans
up that animation.

Wrap component animations in `gsap.context()` and call `context.revert()` during
cleanup, after removing their Refram registrations. `kill()` stops an animation
but does not restore the inline styles it applied. Reverting restores those
styles as well, so remounts and React Strict Mode do not capture a previous
animation's partially hidden state as the new starting state.

### Vanilla / Vite

Use the [quick start](#quick-start) in the app entry. Keep animation-specific
registrations in their feature modules and call their named cleanup functions
when the view is removed. Vite's [`hot.dispose`](https://vite.dev/guide/api-hmr#hot-dispose-cb)
hook is the HMR boundary; do not destroy the editor immediately after mounting.

### React / Next.js

Place this Client Component once in the root layout. The cancellation flag also
makes React Strict Mode's development setup → cleanup → setup cycle safe:

```tsx
"use client";

import { useEffect } from "react";
import type { Refram as ReframInstance } from "refram";

export function ReframDevtools() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    let active = true;
    let editor: ReframInstance | undefined;

    void import("refram").then(({ Refram }) => {
      if (!active) return;
      editor = new Refram();
    });

    return () => {
      active = false;
      editor?.destroy();
    };
  }, []);

  return null;
}
```

```tsx
// app/layout.tsx — Server Component
import { ReframDevtools } from "./refram-devtools";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html><body>{children}<ReframDevtools /></body></html>;
}
```

An animation component owns its GSAP timeline, registration and cleanup:

```tsx
"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import type { MotionTimelineRegistration } from "refram";

export function Hero() {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current!;
    const title = root.querySelector<HTMLElement>("h1")!;
    let timeline!: gsap.core.Timeline;
    const context = gsap.context(() => {
      timeline = gsap.timeline().from(title, { y: 24, autoAlpha: 0 });
    }, root);
    let active = true;
    let registration: MotionTimelineRegistration | undefined;

    if (process.env.NODE_ENV === "development") {
      void import("refram").then(({ registerTimeline }) => {
        if (!active) return;
        registration = registerTimeline({ id: "hero", root, timeline });
      });
    }

    return () => {
      active = false;
      registration?.destroy();
      context.revert();
    };
  }, []);

  return <section ref={rootRef}><h1>Build motion you can inspect</h1></section>;
}
```

Next.js requires [`"use client"`](https://nextjs.org/docs/app/api-reference/directives/use-client)
for browser APIs; React documents the extra Strict Mode cycle and symmetric
cleanup in [`useEffect`](https://react.dev/reference/react/useEffect).

### Vue / Nuxt

Mount this component once from `App.vue` or the top-level layout:

```vue
<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import type { Refram as ReframInstance } from "refram";

let active = true;
let editor: ReframInstance | undefined;

onMounted(() => {
  if (!import.meta.env.DEV) return;
  void import("refram").then(({ Refram }) => {
    if (!active) return;
    editor = new Refram();
  });
});

onUnmounted(() => {
  active = false;
  editor?.destroy();
});
</script>
```

Create and register each timeline in its owning component:

```vue
<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef } from "vue";
import { gsap } from "gsap";
import type { MotionTimelineRegistration } from "refram";

const root = useTemplateRef<HTMLElement>("root");
let active = true;
let timeline: gsap.core.Timeline | undefined;
let context: gsap.Context | undefined;
let registration: MotionTimelineRegistration | undefined;

onMounted(() => {
  const title = root.value!.querySelector<HTMLElement>("h1")!;
  context = gsap.context(() => {
    timeline = gsap.timeline().from(title, { y: 24, autoAlpha: 0 });
  }, root.value!);
  if (!import.meta.env.DEV) return;

  void import("refram").then(({ registerTimeline }) => {
    if (!active) return;
    registration = registerTimeline({ id: "hero", root: root.value!, timeline: timeline! });
  });
});

onUnmounted(() => {
  active = false;
  registration?.destroy();
  context?.revert();
});
</script>

<template><section ref="root"><h1>Build motion you can inspect</h1></section></template>
```

Vue's hooks are
client-only and cleanup is the component/HMR boundary; see the official
[lifecycle API](https://vuejs.org/api/composition-api-lifecycle.html).

For Nuxt, name the shell component `ReframDevtools.client.vue` (or render it
inside `<ClientOnly>`) and mount it once from `app.vue`/the root layout. Nuxt
documents both [client components](https://nuxt.com/docs/4.x/directory-structure/app/components#client-components)
and [`<ClientOnly>`](https://nuxt.com/docs/4.x/api/components/client-only).

### Svelte / SvelteKit

Put the editor mount in the root `App.svelte` or `+layout.svelte`. Keep the
`onMount` callback synchronous and start the dynamic import inside it so the
returned cleanup function remains effective:

```svelte
<script lang="ts">
  import { onMount } from "svelte";
  import type { Refram as ReframInstance } from "refram";

  onMount(() => {
    let active = true;
    let editor: ReframInstance | undefined;

    if (import.meta.env.DEV) {
      void import("refram").then(({ Refram }) => {
        if (!active) return;
        editor = new Refram();
      });
    }

    return () => {
      active = false;
      editor?.destroy();
    };
  });
</script>

<slot />
```

Register animations from their owning Svelte components:

```svelte
<script lang="ts">
  import { onMount } from "svelte";
  import { gsap } from "gsap";
  import type { MotionTimelineRegistration } from "refram";

  let root!: HTMLElement;

  onMount(() => {
    const title = root.querySelector<HTMLElement>("h1")!;
    let timeline!: gsap.core.Timeline;
    const context = gsap.context(() => {
      timeline = gsap.timeline().from(title, { y: 24, autoAlpha: 0 });
    }, root);
    let active = true;
    let registration: MotionTimelineRegistration | undefined;

    if (import.meta.env.DEV) {
      void import("refram").then(({ registerTimeline }) => {
        if (!active) return;
        registration = registerTimeline({ id: "hero", root, timeline });
      });
    }

    return () => {
      active = false;
      registration?.destroy();
      context.revert();
    };
  });
</script>

<section bind:this={root}><h1>Build motion you can inspect</h1></section>
```

`onMount` does
not run during SSR, and Svelte only treats a synchronously returned function as
cleanup; see [Svelte lifecycle hooks](https://svelte.dev/docs/svelte/lifecycle-hooks).

## Current scope

Refram inspects and controls registered GSAP timelines, including ScrollTrigger
metadata and markers. It does not create animations, replace GSAP, or ship a
motion-component collection. GSAP remains a peer dependency under its own
license.

## License

Refram is released under the MIT License.

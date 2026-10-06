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
- [Automatic tracks and targets](#automatic-tracks-and-targets)
- [When to declare tracks](#when-to-declare-tracks)
- [Naming automatic tracks](#naming-automatic-tracks)
- [ScrollTrigger](#scrolltrigger)
- [Framework integration](#framework-integration)
- [Production bundles](#production-bundles)

## Install

GSAP is the host application's runtime dependency. Refram is normally a
development dependency:

```sh
npm install gsap
npm install --save-dev refram
```

The examples use direct imports to get started. Mount the editor and register
timelines only in development. In SSR applications, importing Refram is safe;
creating the editor and registering DOM timelines belong in client lifecycle
hooks. See your framework's example below.

## Quick start

Mount one editor at the application or layout boundary. This example uses Vite's
development flag:

```ts
// app.ts
import { Refram } from "refram";

const editor = import.meta.env.DEV ? new Refram() : undefined;

function cleanupApp(): void {
  editor?.destroy();
}

import.meta.hot?.dispose(cleanupApp);
```

Register each timeline in the component or module that owns the animation:

```ts
// hero.ts
import { gsap } from "gsap";
import { registerTimeline } from "refram";

const root = document.querySelector<HTMLElement>("#hero")!;
const target = root.querySelector<HTMLElement>(".hero__title")!;
const timeline = gsap.timeline().from(target, {
  id: "Hero title",
  y: 24,
  autoAlpha: 0,
  duration: 0.8,
});
const registration = import.meta.env.DEV
  ? registerTimeline({ id: "hero-intro", root, timeline })
  : undefined;

function cleanupHero(): void {
  registration?.destroy();
  timeline.kill();
}

import.meta.hot?.dispose(cleanupHero);
```

With a `#hero` element containing `.hero__title`, the editor shows a timeline
named **hero-intro** with one track named **Hero title**. Click the track to see
its properties in the Inspector. Run these modules after the elements exist.

Refram injects its styles into the `<rf-editor>` Shadow DOM, so no CSS import is
required. Only one editor can be mounted in a document at a time; any number of
timelines can be registered. Call the cleanup functions when their owners are
removed; the `hot.dispose` calls also handle Vite hot reloads.

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
| `label` | `string` | No | Timeline sidebar name. An explicit label wins over ScrollTrigger names; otherwise the sidebar uses the ScrollTrigger ID/trigger selector, or the registration `id`. |
| `timeline` | `gsap.core.Timeline` | Direct only | Existing host-owned timeline. |
| `tracks` | `MotionTimelineTrackDeclaration[]` | No (direct) | Optional custom rows: name or group child tweens, or provide representative elements. Unmapped element tweens still get automatic rows. |
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

### Automatic tracks and targets

A **track** is a row in the editor's timeline. A **target** is an object that
GSAP animates. By default, each direct child tween with element targets appears
as one automatic track, even when it animates an array of elements with stagger.
Explicit `tracks` can group several tweens into one row. For ordinary HTML or
SVG animations, start without `tracks`:

```ts
const root = document.querySelector<HTMLElement>("#hero")!;
const chars = [...root.querySelectorAll(".char")];
const timeline = gsap.timeline().fromTo(
  chars,
  { opacity: 0, y: 50 },
  { opacity: 1, y: 0, stagger: 0.1 },
);

registerTimeline({ id: "hero", root, timeline });
```

If `chars` contains 99 HTML, SVG, or mixed elements, this creates **one automatic track with
99 targets**. Its duration includes the stagger. Calling `.to()` or `.fromTo()`
99 separate times creates 99 child tweens and therefore 99 automatic tracks,
provided each tween has an element target and is not grouped in explicit `tracks`.

Refram inspects direct child tweens of the registered timeline; it does not
expand a stagger into a row for every target or automatically traverse nested
timelines. Explicit `tracks` can group several direct child tweens into one row.

Automatic discovery accepts HTML and SVG elements, including `<path>` and `<g>`.
All element targets in an array belong to the same tween's row. Tweens that
animate only plain objects need an explicit track with a representative element,
such as the canvas they affect.

Automatic SVG discovery and tween-ID track naming are available from version
0.1.3. Version 0.1.2 discovers only HTML targets automatically; upgrade for SVG
support, or use an explicit track for SVG tweens as shown below.

If a track is missing, check that the selector matches elements when the tween
is created. When using `gsap.context(callback, root)`, selector strings inside
the callback are scoped to descendants of `root`. Create split-text `.char`
elements before building the timeline. Registration cannot recover targets that
GSAP did not resolve.

### When to declare `tracks`

Use `tracks` when you want to:

- Group multiple child tweens into one named row.
- Assign a stable track ID and an explicit label.
- Associate a tween animating plain objects with a representative element.

You do not need to repeat every tween in `tracks`. Declared tracks replace the
automatic rows for their mapped tweens; unmapped element tweens still appear
automatically. To name an automatic element track without grouping it, use the
tween's GSAP [`id`](#naming-automatic-tracks) or a target `data-label` fallback.

For example, group two child tweens into one **Headline** track:

```ts
const timeline = gsap.timeline();
const titleTween = gsap.to(title, { y: 0, duration: 0.6 });
const subtitleTween = gsap.to(subtitle, { opacity: 1, duration: 0.4 });
timeline.add(titleTween, 0).add(subtitleTween, 0.2);

const registration = registerTimeline({
  id: "hero",
  root,
  timeline,
  tracks: [{
    id: "headline",
    label: "Headline",
    animations: [titleTween, subtitleTween],
    targets: [title, subtitle],
  }],
});
```

| Track field | Meaning |
| --- | --- |
| `id` | Non-empty ID, unique within this registration. |
| `label` | Display name; defaults to `id`. |
| `animation` | One direct child tween of the registered timeline. |
| `animations` | Several direct child tweens to group into one row. Use this or `animation`, not both. |
| `targets` | One element or a non-empty array of elements representing the row. These do not retarget the GSAP animation. |

A tween can belong to only one declared track. A group's timing spans from the
earliest mapped tween's start to the latest mapped tween's end. Refram reports
the animated target count from the tweens themselves, not from the representative
`targets` array.

When chaining `timeline.to()` or `timeline.fromTo()`, the return value is the
timeline, not the new tween. Capture `timeline.recent()` immediately after adding
the tween if you need to map it:

```ts
const paths = [...root.querySelectorAll("svg .char")];
timeline.fromTo(paths, { opacity: 0 }, { opacity: 1, stagger: 0.1 });
const svgTween = timeline.recent() as gsap.core.Tween;

// Include this entry in registerTimeline({ ..., tracks: [...] }).
const svgTrack = {
  id: "svg-title",
  label: "SVG title",
  animation: svgTween,
  targets: paths,
};
```

Ensure `paths` is non-empty before creating this track. Empty targets or mappings
to tweens outside the registered timeline are rejected.

### Naming automatic tracks

Use GSAP's existing tween `id` to give an automatically detected track a readable
name. Refram reads the metadata from `tween.vars.id`; it does not add a custom
`label` field to tween vars. A target `data-label` remains a convenient fallback:

```html
<section id="hero">
  <h1 class="hero__title" data-label="Hero heading">Hello motion</h1>
  <p class="hero__copy" data-label="Supporting copy">Inspect this sequence.</p>
</section>
```

```ts
const root = document.querySelector<HTMLElement>("#hero")!;
const timeline = gsap.timeline()
  .from(root.querySelector(".hero__title"), {
    id: "Hero heading reveal",
    y: 24,
    autoAlpha: 0,
  })
  .from(root.querySelector(".hero__copy"), {
    id: "Supporting copy reveal",
    autoAlpha: 0,
  });

const registration = registerTimeline({
  id: "hero-intro",
  label: "Hero intro", // Names the timeline, not the individual tracks.
  root,
  timeline,
});
```

The two automatic tracks display **Hero heading reveal** and
**Supporting copy reveal**. String IDs are trimmed for display, numeric IDs such
as `0` are displayed as text, and blank or unsupported values fall through to
the next naming source.

Track names follow this priority:

1. An explicit track declaration's resolved name (`tracks[].label`, or its `id`
   when `label` is omitted).
2. A non-empty GSAP tween `vars.id`.
3. A non-empty `data-label` on the automatic track's source element.
4. An automatic selector-style name, such as `h1.hero__title`.

For an automatic tween with several DOM targets, the source is its first target;
the editor does not combine all of their `data-label` values. Use an explicit
track declaration when you want to name a group deliberately.

The attribute works the same way in React JSX, Vue templates and Svelte markup:

```tsx
<h1 data-label="Hero heading">Hello motion</h1>
```

Tween IDs and `data-label` are display metadata in Refram. They do not change
automatic selection keys, group tweens, or provide a Refram timeline registration
ID or authored track ID. A GSAP timeline position label is also separate: it
names a point in time, not an editor track. Register the owning timeline
separately as shown above.

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

Place this Client Component once in the root layout. Returning cleanup keeps
React Strict Mode's development setup → cleanup → setup cycle safe:

```tsx
"use client";

import { useEffect } from "react";
import { Refram } from "refram";

export function ReframDevtools() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;

    const editor = new Refram();
    return () => editor.destroy();
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
import { registerTimeline } from "refram";

export function Hero() {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const root = rootRef.current!;
    const title = root.querySelector<HTMLElement>("h1")!;
    let timeline!: gsap.core.Timeline;
    const context = gsap.context(() => {
      timeline = gsap.timeline().from(title, { y: 24, autoAlpha: 0 });
    }, root);
    const registration = process.env.NODE_ENV === "development"
      ? registerTimeline({ id: "hero", root, timeline })
      : undefined;

    return () => {
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
import { Refram } from "refram";

let editor: Refram | undefined;

onMounted(() => {
  if (!import.meta.env.DEV) return;
  editor = new Refram();
});

onUnmounted(() => {
  editor?.destroy();
});
</script>
```

Create and register each timeline in its owning component:

```vue
<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef } from "vue";
import { gsap } from "gsap";
import { registerTimeline, type MotionTimelineRegistration } from "refram";

const root = useTemplateRef<HTMLElement>("root");
let timeline: gsap.core.Timeline | undefined;
let context: gsap.Context | undefined;
let registration: MotionTimelineRegistration | undefined;

onMounted(() => {
  const title = root.value!.querySelector<HTMLElement>("h1")!;
  context = gsap.context(() => {
    timeline = gsap.timeline().from(title, { y: 24, autoAlpha: 0 });
  }, root.value!);
  if (!import.meta.env.DEV) return;

  registration = registerTimeline({ id: "hero", root: root.value!, timeline: timeline! });
});

onUnmounted(() => {
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

Put the editor mount in the root `App.svelte` or `+layout.svelte`. Mount it in
`onMount` and return the cleanup function:

```svelte
<script lang="ts">
  import { onMount } from "svelte";
  import { Refram } from "refram";

  onMount(() => {
    if (!import.meta.env.DEV) return;
    const editor = new Refram();
    return () => editor.destroy();
  });
</script>

<slot />
```

Register animations from their owning Svelte components:

```svelte
<script lang="ts">
  import { onMount } from "svelte";
  import { gsap } from "gsap";
  import { registerTimeline } from "refram";

  let root!: HTMLElement;

  onMount(() => {
    const title = root.querySelector<HTMLElement>("h1")!;
    let timeline!: gsap.core.Timeline;
    const context = gsap.context(() => {
      timeline = gsap.timeline().from(title, { y: 24, autoAlpha: 0 });
    }, root);
    const registration = import.meta.env.DEV
      ? registerTimeline({ id: "hero", root, timeline })
      : undefined;

    return () => {
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

## Production bundles

The examples above use direct imports and development guards. The guards prevent
the editor from running in production; they do not guarantee that your bundler
excludes the Refram package. When optimizing a production build, use a
development-gated dynamic import and inspect your build output. With asynchronous
imports, also check that the owner is still mounted before creating an editor or
registration, and destroy it during cleanup.

## Current scope

Refram inspects and controls registered GSAP timelines, including ScrollTrigger
metadata and markers. It does not create animations, replace GSAP, or ship a
motion-component collection. GSAP remains a peer dependency under its own
license.

## License

Refram is released under the MIT License.

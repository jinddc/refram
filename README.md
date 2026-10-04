# Refram

Visual timeline debugger for web animation.

Refram adds a development-only editor to a page so you can inspect and control
authored GSAP timelines. The first release focuses on timeline registration,
playback inspection, and safe teardown without taking ownership of your
animation code.

## Install

Install Refram together with its GSAP peer dependency:

```sh
npm install --save-dev refram gsap
```

## Use

Create your animation as usual, register it with Refram, and mount the editor:

```ts
import { gsap } from "gsap";
import { MotionDevtoolsEditor, registerTimeline } from "refram";

const root = document.querySelector<HTMLElement>("#preview")!;
const target = root.querySelector<HTMLElement>(".target")!;
const timeline = gsap.timeline().to(target, {
  x: 120,
  duration: 1,
});

const registration = registerTimeline({
  id: "hero-intro",
  label: "Hero intro",
  root,
  timeline,
});

const editor = new MotionDevtoolsEditor();

// Tear down the tools when the host view is unmounted.
editor.destroy();
registration.destroy();
```

Refram injects the editor styles into its own Shadow DOM, so no separate CSS
import is required. Only one editor can be mounted in a document at a time.

Keep Refram out of production bundles by loading it only in development code.
For example:

```ts
if (import.meta.env.DEV) {
  const { MotionDevtoolsEditor, registerTimeline } = await import("refram");

  const registration = registerTimeline({
    id: "hero-intro",
    label: "Hero intro",
    root,
    timeline,
  });
  const editor = new MotionDevtoolsEditor();

  import.meta.hot?.dispose(() => {
    editor.destroy();
    registration.destroy();
  });
}
```

## Current scope

Refram 0.1 provides:

- registration for direct and rebuildable GSAP timelines;
- a visual editor for inspecting tracks and playback state;
- timeline playback, seeking, replay, and speed controls;
- ScrollTrigger inspection and marker presentation;
- explicit editor and registration teardown.

Refram does not create animations, replace GSAP, or ship a motion-component
collection. GSAP remains a peer dependency and is distributed under its own
license.

## License

Refram is released under the MIT License.

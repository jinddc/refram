# motion-lab

## Local DevTools package

Build and pack the current checkout:

```sh
npm pack
```

Install the generated archive in another project alongside GSAP:

```sh
npm install /absolute/path/to/motion-lab-0.0.0.tgz gsap
```

Register an authored timeline and mount the editor:

```ts
import { gsap } from "gsap";
import { MotionDevtoolsEditor, registerTimeline } from "motion-lab";

const root = document.querySelector<HTMLElement>("#preview")!;
const target = root.querySelector<HTMLElement>(".target")!;
const timeline = gsap.timeline().to(target, { x: 120, duration: 1 });

const registration = registerTimeline({
  id: "example",
  label: "Example",
  root,
  timeline,
});
const editor = new MotionDevtoolsEditor();

// When the host app no longer needs the tools:
editor.destroy();
registration.destroy();
```

import { register } from "../internal/register";
import { MotionRevealElement } from "./reveal-element";

export function registerMotionReveal(): void {
  register("motion-reveal", MotionRevealElement);
}

/**
 * Tiny inlined ANSI stripper. We avoid the `strip-ansi` npm dep
 * to keep this package zero-runtime-dep — the regex below covers
 * SGR, cursor moves, screen erases, and OSC sequences.
 *
 * Source pattern adapted from `strip-ansi` (Sindre Sorhus, MIT).
 */
const ANSI_REGEX = /[\u001B\u009B][[\]()#;?]*(?:(?:(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)|(?:(?:\d{1,4}(?:;\d{0,4})*)?[\dA-PRZcf-nqry=><]))/g;

export function stripAnsi(input: string): string {
  return input.replace(ANSI_REGEX, "");
}

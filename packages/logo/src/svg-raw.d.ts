// Vite/Vitest `?raw` imports return a module's file contents as a string. Used
// by the parity test to read `assets/mark.svg` without a runtime fs path.
declare module "*?raw" {
  const content: string;
  export default content;
}

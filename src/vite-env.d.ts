/// <reference types="vite/client" />

// Vite's client types do not include custom asset queries; inline SVGs ship
// as a decoded data URI string, embedded directly in the JS bundle.
declare module '*.svg?inline' {
  const src: string;
  export default src;
}

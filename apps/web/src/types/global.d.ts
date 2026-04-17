// src/types/css.d.ts
// Tells TypeScript that importing a .css file is valid (side-effect import).
// Without this, TS throws TS2882 on `import './globals.css'` in layout.tsx.
// This is a declaration-only file — it has no runtime effect.

declare module '*.css' {
  const content: Record<string, string>;
  export default content;
}

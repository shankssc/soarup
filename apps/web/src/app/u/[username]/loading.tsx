// apps/web/src/app/u/[username]/loading.tsx
// Route-level Suspense fallback. generateMetadata in page.tsx does a fetch
// before the page can render — without this file, that gap shows a blank
// tab with zero feedback. Next streams this immediately instead.

import { PublicProfileSkeleton } from './client';

export default function Loading() {
  return <PublicProfileSkeleton />;
}

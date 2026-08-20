// apps/web/src/components/ui/page-transition.tsx
'use client';

import * as React from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export function PageTransition() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isTransitioning, setIsTransitioning] = React.useState(false);

  const currentKey = `${pathname}?${searchParams}`;
  const [prevKey, setPrevKey] = React.useState(currentKey);

  if (currentKey !== prevKey) {
    setPrevKey(currentKey);
    setIsTransitioning(true);
  }

  React.useEffect(() => {
    if (!isTransitioning) return;
    const timer = setTimeout(() => setIsTransitioning(false), 400);
    return () => clearTimeout(timer);
  }, [isTransitioning]);

  if (!isTransitioning) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[9999]">
      <div className="absolute left-0 top-0 h-[2px] w-full overflow-hidden">
        <div className="h-full animate-[page-load_0.4s_ease-out_forwards] bg-primary" />
      </div>
    </div>
  );
}

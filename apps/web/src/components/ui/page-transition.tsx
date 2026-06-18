// apps/web/src/components/ui/page-transition.tsx
'use client';

import * as React from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export function PageTransition() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isTransitioning, setIsTransitioning] = React.useState(false);

  React.useEffect(() => {
    setIsTransitioning(true);
    const timer = setTimeout(() => setIsTransitioning(false), 400);
    return () => clearTimeout(timer);
  }, [pathname, searchParams]);

  if (!isTransitioning) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[9999]">
      {/* Top loading bar */}
      <div className="absolute left-0 top-0 h-[2px] w-full overflow-hidden">
        <div className="h-full animate-[page-load_0.4s_ease-out_forwards] bg-primary" />
      </div>
    </div>
  );
}

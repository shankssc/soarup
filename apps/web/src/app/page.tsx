//apps/web/src/app/page.tsx

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="space-y-4 text-center">
        <h1 className="text-4xl font-bold tracking-tight">🚀 SoarUp</h1>
        <p className="text-muted-foreground text-lg">
          Async standups for indie devs and small remote teams.
        </p>
        <div className="bg-primary/10 text-primary inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm">
          <span className="relative flex h-2 w-2">
            <span className="bg-primary absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"></span>
            <span className="bg-primary relative inline-flex h-2 w-2 rounded-full"></span>
          </span>
          Backend connected
        </div>
      </div>
    </main>
  );
}

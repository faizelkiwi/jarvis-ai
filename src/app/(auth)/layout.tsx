export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-dvh grid place-items-center p-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="orb !max-w-[96px] mb-5" aria-hidden />
          <h1 className="font-display text-2xl font-bold tracking-[0.3em] text-accent">JARVIS</h1>
          <p className="mt-1 text-xs tracking-[0.2em] uppercase text-muted">Your Business. Your Intelligence. Your Control.</p>
        </div>
        {children}
      </div>
    </main>
  );
}

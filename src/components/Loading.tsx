export default function Loading({ text = 'Memuat...' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-900 relative">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_50%,rgba(99,102,241,0.05)_0%,transparent_100%)]"></div>
      <div className="relative z-10 flex flex-col items-center">
        <div className="w-12 h-12 border-4 border-slate-700 border-t-indigo-500 rounded-full animate-spin mb-6 shadow-[0_0_15px_rgba(99,102,241,0.3)]"></div>
        <p className="text-slate-300 font-medium tracking-wide">{text}</p>
      </div>
    </div>
  );
}

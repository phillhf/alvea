export function LiveIndicator({ label }: { label: string }) {
  if (!label) return null;
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-400 select-none">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" />
      {label}
    </div>
  );
}

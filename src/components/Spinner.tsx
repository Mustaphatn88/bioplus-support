export default function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-slate-50">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-teal-700 border-t-transparent" />
      {label && <p className="text-sm text-slate-500">{label}</p>}
    </div>
  );
}
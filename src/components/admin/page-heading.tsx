export function PageHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header>
      <p className="text-[10px] uppercase tracking-wider font-semibold text-emerald-500">Administration</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-50">
        {title}
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
        {description}
      </p>
    </header>
  );
}

export function PageHeader({ eyebrow, title, description, children }: { eyebrow?: React.ReactNode; title: React.ReactNode; description?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        {eyebrow && <p className="text-muted-foreground mb-1 text-sm">{eyebrow}</p>}
        <h1>{title}</h1>
        {description && <div className="text-muted-foreground mt-1.5 text-sm">{description}</div>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

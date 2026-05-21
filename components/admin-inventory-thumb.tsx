type AdminInventoryThumbProps = {
  imageUrl?: string;
  name: string;
  className?: string;
};

/** Product image (or letter placeholder) for admin inventory rows. */
export function AdminInventoryThumb({
  imageUrl,
  name,
  className = '',
}: AdminInventoryThumbProps) {
  const initial = (name || '?').trim().charAt(0).toUpperCase() || '?';
  return (
    <div
      className={`shrink-0 flex items-center justify-center ${className}`}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt=''
          className='h-12 w-12 rounded-md object-cover border border-border/60 bg-muted'
        />
      ) : (
        <span
          className='flex h-12 w-12 items-center justify-center rounded-md border border-border/60 bg-muted/50 text-base font-serif text-muted-foreground'
          aria-hidden
        >
          {initial}
        </span>
      )}
    </div>
  );
}

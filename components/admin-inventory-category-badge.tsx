'use client';

import { UNCATEGORIZED_CATEGORY } from '@/lib/categories';
import { cn } from '@/lib/utils';

type Props = {
  category?: string;
  /** Overlay on product image (grid cards). */
  variant?: 'overlay' | 'inline';
  className?: string;
};

/** Primary category label for admin inventory cards. */
export function AdminInventoryCategoryBadge({
  category,
  variant = 'overlay',
  className,
}: Props) {
  if (!category?.trim()) return null;

  const isUncategorized =
    category.trim() === UNCATEGORIZED_CATEGORY ||
    category.trim().toLowerCase() === 'uncategorized';

  if (variant === 'overlay') {
    return (
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/75 via-black/50 to-transparent px-2 pb-2 pt-8 pointer-events-none',
          className
        )}
      >
        <p
          className={cn(
            'text-[11px] sm:text-xs font-medium leading-snug line-clamp-2',
            isUncategorized ? 'text-amber-200' : 'text-white'
          )}
          title={category}
        >
          {category}
        </p>
      </div>
    );
  }

  return (
    <span
      className={cn(
        'inline-block max-w-full text-[10px] sm:text-xs font-medium leading-tight line-clamp-2 text-center',
        isUncategorized ? 'text-amber-700' : 'text-muted-foreground',
        className
      )}
      title={category}
    >
      {category}
    </span>
  );
}

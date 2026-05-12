'use client';

// apps/web/src/components/ui/select.tsx

// Radix Select primitive wrapped in Electric Atelier design tokens.
// Exports: Select (headless parts re-exported), SelectField (composed input).

import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';

// ─── Token helpers ─────────────────────────────────────────────────────────────
// All colors reference CSS variables defined in globals.css so light/dark mode
// is handled at the theme level, not here.

// ─── Re-export primitive parts for headless usage ─────────────────────────────

export const Select = SelectPrimitive.Root;
export const SelectGroup = SelectPrimitive.Group;
export const SelectValue = SelectPrimitive.Value;

// ─── Trigger ──────────────────────────────────────────────────────────────────

export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className = '', children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={[
      'flex w-full items-center justify-between',
      'bg-transparent px-0 py-2',
      // Bottom-border only — Electric Atelier input style
      'border-0 border-b border-outline-variant',
      'font-label text-[15px] text-on-surface',
      'data-[placeholder]:text-on-surface-variant',
      // Focus — primary (cyan) underline, no ring
      'focus:border-primary focus:outline-none',
      'rounded-none transition-colors duration-150',
      className,
    ].join(' ')}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDownIcon className="h-4 w-4 shrink-0 text-on-surface-variant" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = SelectPrimitive.Trigger.displayName;

// ─── Content (dropdown panel) ──────────────────────────────────────────────────

export const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content> & {
    searchable?: boolean;
    searchPlaceholder?: string;
    onSearchChange?: (query: string) => void;
    searchValue?: string;
  }
>(
  (
    {
      className = '',
      children,
      position = 'popper',
      searchable = false,
      searchPlaceholder = 'Search...',
      onSearchChange,
      searchValue = '',
      ...props
    },
    ref,
  ) => (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        ref={ref}
        className={[
          'border border-outline-variant bg-surface-high',
          'rounded-none',
          'max-h-[280px] w-[var(--radix-select-trigger-width)]',
          'z-50 overflow-hidden',
          'data-[state=open]:animate-in data-[state=closed]:animate-out',
          'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
          'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          position === 'popper' &&
            'data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        position={position}
        {...props}
      >
        {/* Optional search input at top of dropdown */}
        {searchable && (
          <div className="flex items-center gap-2 border-b border-outline-variant px-3 py-2">
            <SearchIcon className="h-3.5 w-3.5 shrink-0 text-on-surface-variant" />
            <input
              autoFocus
              className={[
                'flex-1 bg-transparent font-label text-[13px]',
                'text-on-surface placeholder:text-on-surface-variant',
                'border-none outline-none',
              ].join(' ')}
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => onSearchChange?.(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
        )}
        <SelectPrimitive.Viewport className="max-h-[230px] overflow-y-auto p-1">
          {children}
        </SelectPrimitive.Viewport>
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  ),
);
SelectContent.displayName = SelectPrimitive.Content.displayName;

// ─── Label (group header) ──────────────────────────────────────────────────────

export const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Label>
>(({ className = '', ...props }, ref) => (
  <SelectPrimitive.Label
    ref={ref}
    className={[
      'px-3 py-1.5',
      'font-label text-[10px] font-medium uppercase tracking-[0.08em]',
      'text-on-surface-variant',
      className,
    ].join(' ')}
    {...props}
  />
));
SelectLabel.displayName = SelectPrimitive.Label.displayName;

// ─── Item ──────────────────────────────────────────────────────────────────────

export const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className = '', children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={[
      'relative flex w-full cursor-pointer select-none items-center',
      'rounded-none px-3 py-2',
      'font-label text-[14px] text-on-surface',
      'outline-none',
      'hover:bg-surface-highest focus:bg-surface-highest',
      // Selected — primary (cyan) text
      'data-[state=checked]:text-primary',
      'data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
      className,
    ].join(' ')}
    {...props}
  >
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = SelectPrimitive.Item.displayName;

// ─── Separator ─────────────────────────────────────────────────────────────────

export const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Separator>
>(({ className = '', ...props }, ref) => (
  <SelectPrimitive.Separator
    ref={ref}
    className={['my-1 h-px bg-outline-variant', className].join(' ')}
    {...props}
  />
));
SelectSeparator.displayName = SelectPrimitive.Separator.displayName;

// ─── SelectField (composed, labeled field) ─────────────────────────────────────
// This is what the onboarding form and other forms use directly.

export interface SelectFieldProps {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
  searchPlaceholder?: string;
  groups: Array<{
    label: string;
    items: Array<{ value: string; label: string }>;
  }>;
  error?: string;
  disabled?: boolean;
}

export function SelectField({
  label,
  value,
  onValueChange,
  placeholder = 'Select...',
  searchable = false,
  searchPlaceholder = 'Search...',
  groups,
  error,
  disabled = false,
}: SelectFieldProps) {
  const [search, setSearch] = React.useState('');

  // Filter groups by search query
  const filteredGroups = React.useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        items: g.items.filter(
          (item) =>
            item.label.toLowerCase().includes(q) ||
            item.value.toLowerCase().includes(q),
        ),
      }))
      .filter((g) => g.items.length > 0);
  }, [groups, search]);

  // Reset search when dropdown closes
  const handleOpenChange = (open: boolean) => {
    if (!open) setSearch('');
  };

  return (
    <div className="flex flex-col gap-1">
      {/* Label */}
      <span
        className={[
          'font-label text-[10px] font-medium uppercase tracking-[0.08em]',
          error ? 'text-error' : 'text-on-surface',
        ].join(' ')}
      >
        {label}
      </span>

      <Select
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        onOpenChange={handleOpenChange}
      >
        <SelectTrigger className={error ? 'border-error' : ''}>
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>

        <SelectContent
          searchable={searchable}
          searchPlaceholder={searchPlaceholder}
          searchValue={search}
          onSearchChange={setSearch}
        >
          {filteredGroups.length === 0 ? (
            <div className="px-3 py-4 text-center font-label text-[13px] text-on-surface-variant">
              No results found
            </div>
          ) : (
            filteredGroups.map((group, i) => (
              <SelectGroup key={group.label}>
                <SelectLabel>{group.label}</SelectLabel>
                {group.items.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
                {i < filteredGroups.length - 1 && <SelectSeparator />}
              </SelectGroup>
            ))
          )}
        </SelectContent>
      </Select>

      {error && <span className="font-label text-[12px] text-error">{error}</span>}
    </div>
  );
}

// ─── Inline SVG icons (no icon library dependency) ────────────────────────────

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

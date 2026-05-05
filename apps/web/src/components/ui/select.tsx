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
      // Layout
      'flex w-full items-center justify-between',
      'bg-transparent px-0 py-2',
      // Bottom-border only — Electric Atelier input style
      'border-0 border-b border-[var(--color-border-default)]',
      // Typography
      'font-[Space_Grotesk] text-[15px] text-[var(--color-text-primary)]',
      // Placeholder
      'data-[placeholder]:text-[var(--color-text-muted)]',
      // Focus — cyan underline, no ring
      'focus:outline-none focus:border-[var(--color-cyan)]',
      'transition-colors duration-150',
      // Sharp corners
      'rounded-none',
      className,
    ].join(' ')}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDownIcon className="h-4 w-4 text-[var(--color-text-muted)] shrink-0" />
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
          // Background + border — Electric Atelier surface
          'bg-[var(--color-surface-high)] border border-[var(--color-border-default)]',
          // Sharp corners
          'rounded-none',
          // Sizing
          'w-[var(--radix-select-trigger-width)] max-h-[280px]',
          // Elevation — no shadow per design rules
          'z-50 overflow-hidden',
          // Animation
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
          <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--color-border-default)]">
            <SearchIcon className="h-3.5 w-3.5 text-[var(--color-text-muted)] shrink-0" />
            <input
              autoFocus
              className={[
                'flex-1 bg-transparent text-[13px] font-[Space_Grotesk]',
                'text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)]',
                'border-none outline-none',
              ].join(' ')}
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={(e) => onSearchChange?.(e.target.value)}
              // Prevent Radix from capturing keystrokes meant for the search input
              onKeyDown={(e) => e.stopPropagation()}
            />
          </div>
        )}
        <SelectPrimitive.Viewport className="overflow-y-auto max-h-[230px] p-1">
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
      'font-[Space_Grotesk] text-[10px] font-medium tracking-[0.08em] uppercase',
      'text-[var(--color-text-muted)]',
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
      'px-3 py-2 rounded-none',
      'font-[Space_Grotesk] text-[14px] text-[var(--color-text-primary)]',
      // Hover / focus state
      'outline-none',
      'hover:bg-[var(--color-surface-highest)] focus:bg-[var(--color-surface-highest)]',
      // Selected state — cyan text
      'data-[state=checked]:text-[var(--color-cyan)]',
      // Disabled
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
    className={['h-px bg-[var(--color-border-default)] my-1', className].join(' ')}
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
    <div className="flex flex-col gap-[4px]">
      {/* Label */}
      <span
        className={[
          'font-[Space_Grotesk] text-[10px] font-medium tracking-[0.08em] uppercase',
          error
            ? 'text-[var(--color-error)]'
            : 'text-[var(--color-text-primary)]',
        ].join(' ')}
      >
        {label}
      </span>

      {/* Select */}
      <Select
        value={value}
        onValueChange={onValueChange}
        disabled={disabled}
        onOpenChange={handleOpenChange}
      >
        <SelectTrigger
          className={
            error ? 'border-[var(--color-error)]' : ''
          }
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>

        <SelectContent
          searchable={searchable}
          searchPlaceholder={searchPlaceholder}
          searchValue={search}
          onSearchChange={setSearch}
        >
          {filteredGroups.length === 0 ? (
            <div className="px-3 py-4 text-center font-[Space_Grotesk] text-[13px] text-[var(--color-text-muted)]">
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

      {/* Error message */}
      {error && (
        <span className="font-[Space_Grotesk] text-[12px] text-[var(--color-error)]">
          {error}
        </span>
      )}
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

// apps/web/tests/unit/select.test.tsx

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import * as axeMatchers from 'vitest-axe/matchers';
import { SelectField } from '@/components/ui/select';

expect.extend(axeMatchers);

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const groups = [
  {
    label: 'Americas',
    items: [
      { value: 'America/New_York', label: 'New York' },
      { value: 'America/Chicago', label: 'Chicago' },
      { value: 'America/Los_Angeles', label: 'Los Angeles' },
    ],
  },
  {
    label: 'Europe',
    items: [
      { value: 'Europe/London', label: 'London' },
      { value: 'Europe/Paris', label: 'Paris' },
    ],
  },
];

const user = userEvent.setup();

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('SelectField — rendering', () => {
  it('renders the label', () => {
    render(
      <SelectField label="Timezone" value="" onValueChange={vi.fn()} groups={groups} />,
    );
    expect(screen.getByText('Timezone')).toBeInTheDocument();
  });

  it('renders placeholder when no value is selected', () => {
    render(
      <SelectField
        label="Timezone"
        value=""
        onValueChange={vi.fn()}
        groups={groups}
        placeholder="Select timezone..."
      />,
    );
    expect(screen.getByText('Select timezone...')).toBeInTheDocument();
  });

  it('renders the selected value label', () => {
    render(
      <SelectField
        label="Timezone"
        value="America/New_York"
        onValueChange={vi.fn()}
        groups={groups}
      />,
    );
    expect(screen.getByText('New York')).toBeInTheDocument();
  });

  it('renders error message when error prop is provided', () => {
    render(
      <SelectField
        label="Timezone"
        value=""
        onValueChange={vi.fn()}
        groups={groups}
        error="Please select a timezone."
      />,
    );
    expect(screen.getByText('Please select a timezone.')).toBeInTheDocument();
  });

  it('does not render error message when error is not provided', () => {
    render(
      <SelectField label="Timezone" value="" onValueChange={vi.fn()} groups={groups} />,
    );
    expect(screen.queryByText(/please select/i)).not.toBeInTheDocument();
  });
});

// ─── Selection ────────────────────────────────────────────────────────────────

describe('SelectField — selection', () => {
  it('calls onValueChange with the correct value when an item is selected', async () => {
    const onValueChange = vi.fn();
    render(
      <SelectField
        label="Timezone"
        value=""
        onValueChange={onValueChange}
        groups={groups}
      />,
    );
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByText('New York'));
    expect(onValueChange).toHaveBeenCalledWith('America/New_York');
  });

  it('calls onValueChange when selecting from a different group', async () => {
    const onValueChange = vi.fn();
    render(
      <SelectField
        label="Timezone"
        value=""
        onValueChange={onValueChange}
        groups={groups}
      />,
    );
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByText('London'));
    expect(onValueChange).toHaveBeenCalledWith('Europe/London');
  });
});

// ─── Disabled state ───────────────────────────────────────────────────────────

describe('SelectField — disabled state', () => {
  it('disables the trigger when disabled prop is true', () => {
    render(
      <SelectField
        label="Timezone"
        value=""
        onValueChange={vi.fn()}
        groups={groups}
        disabled
      />,
    );
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('does not disable trigger when disabled is false', () => {
    render(
      <SelectField
        label="Timezone"
        value=""
        onValueChange={vi.fn()}
        groups={groups}
        disabled={false}
      />,
    );
    expect(screen.getByRole('combobox')).not.toBeDisabled();
  });
});

// ─── Search filtering ─────────────────────────────────────────────────────────

describe('SelectField — search filtering', () => {
  it('shows search input when searchable is true', async () => {
    render(
      <SelectField
        label="Timezone"
        value=""
        onValueChange={vi.fn()}
        groups={groups}
        searchable
        searchPlaceholder="Search timezones..."
      />,
    );
    await user.click(screen.getByRole('combobox'));
    expect(screen.getByPlaceholderText('Search timezones...')).toBeInTheDocument();
  });

  it('does not show search input when searchable is false', async () => {
    render(
      <SelectField
        label="Timezone"
        value=""
        onValueChange={vi.fn()}
        groups={groups}
        searchable={false}
      />,
    );
    await user.click(screen.getByRole('combobox'));
    expect(screen.queryByPlaceholderText(/search/i)).not.toBeInTheDocument();
  });

  it('filters items by label when searching', async () => {
    render(
      <SelectField
        label="Timezone"
        value=""
        onValueChange={vi.fn()}
        groups={groups}
        searchable
      />,
    );
    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByPlaceholderText(/search/i), 'york');

    await waitFor(() => {
      expect(screen.getByText('New York')).toBeInTheDocument();
      expect(screen.queryByText('Chicago')).not.toBeInTheDocument();
      expect(screen.queryByText('London')).not.toBeInTheDocument();
    });
  });

  it('filters items by value when searching', async () => {
    render(
      <SelectField
        label="Timezone"
        value=""
        onValueChange={vi.fn()}
        groups={groups}
        searchable
      />,
    );
    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByPlaceholderText(/search/i), 'europe');

    await waitFor(() => {
      expect(screen.getByText('London')).toBeInTheDocument();
      expect(screen.getByText('Paris')).toBeInTheDocument();
      expect(screen.queryByText('New York')).not.toBeInTheDocument();
    });
  });

  it('shows no results message when search has no matches', async () => {
    render(
      <SelectField
        label="Timezone"
        value=""
        onValueChange={vi.fn()}
        groups={groups}
        searchable
      />,
    );
    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByPlaceholderText(/search/i), 'zzz');
    expect(await screen.findByText(/no results found/i)).toBeInTheDocument();
  });

  it('search is case-insensitive', async () => {
    render(
      <SelectField
        label="Timezone"
        value=""
        onValueChange={vi.fn()}
        groups={groups}
        searchable
      />,
    );
    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByPlaceholderText(/search/i), 'PARIS');
    await waitFor(() => expect(screen.getByText('Paris')).toBeInTheDocument());
  });

  it('resets search when dropdown closes', async () => {
    render(
      <SelectField
        label="Timezone"
        value=""
        onValueChange={vi.fn()}
        groups={groups}
        searchable
      />,
    );
    // Open and search
    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByPlaceholderText(/search/i), 'york');
    await waitFor(() => expect(screen.queryByText('Chicago')).not.toBeInTheDocument());

    // Close by pressing Escape
    await user.keyboard('{Escape}');

    // Reopen — all items should be visible again
    await user.click(screen.getByRole('combobox'));
    await waitFor(() => {
      expect(screen.getByText('New York')).toBeInTheDocument();
      expect(screen.getByText('Chicago')).toBeInTheDocument();
      expect(screen.getByText('London')).toBeInTheDocument();
    });
  });

  it('shows all items when search is cleared', async () => {
    render(
      <SelectField
        label="Timezone"
        value=""
        onValueChange={vi.fn()}
        groups={groups}
        searchable
      />,
    );
    await user.click(screen.getByRole('combobox'));
    const searchInput = screen.getByPlaceholderText(/search/i);
    await user.type(searchInput, 'york');
    await waitFor(() => expect(screen.queryByText('Chicago')).not.toBeInTheDocument());

    await user.clear(searchInput);
    await waitFor(() => {
      expect(screen.getByText('New York')).toBeInTheDocument();
      expect(screen.getByText('Chicago')).toBeInTheDocument();
    });
  });
});

// ─── Group rendering ──────────────────────────────────────────────────────────

describe('SelectField — group rendering', () => {
  it('renders group labels', async () => {
    render(
      <SelectField
        label="Timezone"
        value=""
        onValueChange={vi.fn()}
        groups={groups}
      />,
    );
    await user.click(screen.getByRole('combobox'));
    expect(screen.getByText('Americas')).toBeInTheDocument();
    expect(screen.getByText('Europe')).toBeInTheDocument();
  });

  it('hides empty groups after filtering', async () => {
    render(
      <SelectField
        label="Timezone"
        value=""
        onValueChange={vi.fn()}
        groups={groups}
        searchable
      />,
    );
    await user.click(screen.getByRole('combobox'));
    await user.type(screen.getByPlaceholderText(/search/i), 'paris');
    await waitFor(() => {
      expect(screen.getByText('Europe')).toBeInTheDocument();
      expect(screen.queryByText('Americas')).not.toBeInTheDocument();
    });
  });
});

// ─── Accessibility ────────────────────────────────────────────────────────────

describe('SelectField — accessibility', () => {
  it('has no accessibility violations in closed state', async () => {
  const { container } = render(
    <SelectField label="Role" value="" onValueChange={vi.fn()} groups={groups} />,
  );
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
});

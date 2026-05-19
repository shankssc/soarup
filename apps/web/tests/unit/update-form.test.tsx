// apps/web/tests/unit/update-form.test.tsx

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UpdateForm } from '@/components/domain/updates/update-form';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const defaultProps = {
  onSubmit: vi.fn().mockResolvedValue(undefined),
  onCancel: vi.fn(),
  isSubmitting: false,
};

function getTextarea() {
  return screen.getByPlaceholderText(/I finished/i);
}

function getSubmitButton() {
  return screen.getByRole('button', { name: /submit/i });
}

function getCancelButton() {
  return screen.getByRole('button', { name: /cancel/i });
}

function setContent(value: string) {
  fireEvent.change(screen.getByPlaceholderText(/I finished/i), {
    target: { value },
  });
}

// ─── Reset ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── Rendering ────────────────────────────────────────────────────────────────

describe('UpdateForm — rendering', () => {
  it('renders textarea with correct placeholder', () => {
    render(<UpdateForm {...defaultProps} />);
    expect(getTextarea()).toBeInTheDocument();
  });

  it('renders character counter', () => {
    render(<UpdateForm {...defaultProps} />);
    expect(screen.getByText('1000 / 1000')).toBeInTheDocument();
  });

  it('character counter updates as user types', () => {
    render(<UpdateForm {...defaultProps} />);
    setContent('Hello');
    expect(screen.getByText('995 / 1000')).toBeInTheDocument();
  });
});

// ─── Submit button state ──────────────────────────────────────────────────────

describe('UpdateForm — submit button state', () => {
  it('submit button is disabled when content is empty', () => {
    render(<UpdateForm {...defaultProps} />);
    expect(getSubmitButton()).toBeDisabled();
  });

  it('submit button is enabled after typing', async () => {
    const user = userEvent.setup();
    render(<UpdateForm {...defaultProps} />);
    await user.type(getTextarea(), 'My update');
    expect(getSubmitButton()).not.toBeDisabled();
  });

  it('submit button is disabled when content exceeds 1000 chars', () => {
    render(<UpdateForm {...defaultProps} />);
    setContent('a'.repeat(1001));
    expect(getSubmitButton()).toBeDisabled();
  });
});

// ─── Submission ───────────────────────────────────────────────────────────────

describe('UpdateForm — submission', () => {
  it('calls onSubmit with trimmed content', async () => {
    const user = userEvent.setup();
    render(<UpdateForm {...defaultProps} />);
    setContent('  My update  ');
    await user.click(getSubmitButton());
    await waitFor(() =>
      expect(defaultProps.onSubmit).toHaveBeenCalledWith('My update'),
    );
  });

  it('blocks empty submission (whitespace only)', () => {
    render(<UpdateForm {...defaultProps} />);
    setContent('   ');
    expect(getSubmitButton()).toBeDisabled();
    expect(defaultProps.onSubmit).not.toHaveBeenCalled();
  });

  it('Cmd+Enter submits the form', async () => {
    render(<UpdateForm {...defaultProps} />);
    setContent('My update');
    fireEvent.keyDown(getTextarea(), { key: 'Enter', metaKey: true });
    await waitFor(() =>
      expect(defaultProps.onSubmit).toHaveBeenCalledWith('My update'),
    );
  });

  it('Ctrl+Enter also submits the form', async () => {
    render(<UpdateForm {...defaultProps} />);
    setContent('My update');
    fireEvent.keyDown(getTextarea(), { key: 'Enter', ctrlKey: true });
    await waitFor(() =>
      expect(defaultProps.onSubmit).toHaveBeenCalledWith('My update'),
    );
  });
});

// ─── Cancel ───────────────────────────────────────────────────────────────────

describe('UpdateForm — cancel', () => {
  it('cancel button fires onCancel', async () => {
    const user = userEvent.setup();
    render(<UpdateForm {...defaultProps} />);
    await user.click(getCancelButton());
    expect(defaultProps.onCancel).toHaveBeenCalledOnce();
  });

  it('Escape key fires onCancel', () => {
    render(<UpdateForm {...defaultProps} />);
    fireEvent.keyDown(getTextarea(), { key: 'Escape' });
    expect(defaultProps.onCancel).toHaveBeenCalledOnce();
  });
});

// ─── Loading state ────────────────────────────────────────────────────────────

describe('UpdateForm — loading state', () => {
  it('disables submit button when isSubmitting is true', () => {
    render(<UpdateForm {...defaultProps} isSubmitting={true} />);
    expect(getSubmitButton()).toBeDisabled();
  });

  it('disables cancel button when isSubmitting is true', () => {
    render(<UpdateForm {...defaultProps} isSubmitting={true} />);
    expect(getCancelButton()).toBeDisabled();
  });
});

// ─── Over-limit state ─────────────────────────────────────────────────────────

describe('UpdateForm — character limit', () => {
  it('counter shows negative value when over limit', () => {
    render(<UpdateForm {...defaultProps} />);
    setContent('a'.repeat(1001));
    expect(screen.getByText('-1 / 1000')).toBeInTheDocument();
  });
});

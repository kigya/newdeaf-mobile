import React from 'react';
import { Text } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { ConfirmDialog } from '@/src/shared/ui/ConfirmDialog';
import { EmptyState } from '@/src/shared/ui/EmptyState';
import { Screen } from '@/src/shared/ui/Screen';
import { t } from '@/src/shared/i18n';

describe('Screen', () => {
  it('renders title, subtitle, left, right, and children', async () => {
    await render(
      <Screen
        title="Catalog"
        subtitle="Browse"
        left={<Text>L</Text>}
        right={<Text>R</Text>}
      >
        <Text>Body</Text>
      </Screen>
    );
    expect(screen.getByText('Catalog')).toBeTruthy();
    expect(screen.getByText('Browse')).toBeTruthy();
    expect(screen.getByText('L')).toBeTruthy();
    expect(screen.getByText('R')).toBeTruthy();
    expect(screen.getByText('Body')).toBeTruthy();
  });

  it('renders without header when no title/left/right', async () => {
    await render(
      <Screen>
        <Text>Only body</Text>
      </Screen>
    );
    expect(screen.getByText('Only body')).toBeTruthy();
  });
});

describe('EmptyState', () => {
  it('renders title and subtitle', async () => {
    await render(<EmptyState title="Nothing here" subtitle="Try again" />);
    expect(screen.getByText('Nothing here')).toBeTruthy();
    expect(screen.getByText('Try again')).toBeTruthy();
  });

  it('renders without subtitle', async () => {
    await render(<EmptyState title="Empty" />);
    expect(screen.getByText('Empty')).toBeTruthy();
  });
});

describe('ConfirmDialog', () => {
  it('returns null when not visible', async () => {
    const { toJSON } = await render(
      <ConfirmDialog
        visible={false}
        title="Delete?"
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    expect(toJSON()).toBeNull();
  });

  it('fires confirm and cancel', async () => {
    const onConfirm = jest.fn();
    const onCancel = jest.fn();
    await render(
      <ConfirmDialog
        visible
        title="Delete?"
        message="Are you sure?"
        confirmLabel="Yes"
        cancelLabel="No"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );
    expect(screen.getByText('Delete?')).toBeTruthy();
    expect(screen.getByText('Are you sure?')).toBeTruthy();
    await fireEvent.press(screen.getByText('Yes'));
    expect(onConfirm).toHaveBeenCalled();
    await fireEvent.press(screen.getByText('No'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('hides cancel when confirmOnly', async () => {
    await render(
      <ConfirmDialog
        visible
        title="Notice"
        confirmOnly
        confirmLabel={t('common.gotIt')}
        onConfirm={jest.fn()}
        onCancel={jest.fn()}
      />
    );
    expect(screen.getByText(t('common.gotIt'))).toBeTruthy();
    expect(screen.queryByText(t('common.cancel'))).toBeNull();
  });

  it('uses destructive confirm styling path', async () => {
    const onConfirm = jest.fn();
    await render(
      <ConfirmDialog
        visible
        title="Danger"
        destructive
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={jest.fn()}
      />
    );
    await fireEvent.press(screen.getByText('Delete'));
    expect(onConfirm).toHaveBeenCalled();
  });
});

import type { ReactNode } from 'react';
import { Group, Text, Title } from '@mantine/core';

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <Group justify="space-between" align="flex-end" mb="md">
      <div>
        <Title order={2}>{title}</Title>
        {subtitle && (
          <Text c="dimmed" size="sm">
            {subtitle}
          </Text>
        )}
      </div>
      {children && <Group gap="xs">{children}</Group>}
    </Group>
  );
}

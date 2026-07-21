import {
  checkPluginVersion,
  type InvenTreePluginContext,
  ModelType
} from '@inventreedb/ui';
import { Alert, Button, List, Loader, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconInfoCircle } from '@tabler/icons-react';
import { useMemo, useRef, useState } from 'react';

/**
 * Render a custom panel with the provided context.
 * Refer to the InvenTree documentation for the context interface
 * https://docs.inventree.org/en/latest/plugins/mixins/ui/#plugin-context
 */
function SOLineItemImportPanel({
  context
}: {
  context: InvenTreePluginContext;
}) {
  const salesOrderId = useMemo(() => {
    return context.model === ModelType.salesorder && context.id
      ? context.id
      : null;
  }, [context.model, context.id]);

  const importUrl = useMemo(() => {
    return String(context.instance?.import_url || '');
  }, [context.instance]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);

  function getCsrfToken(): string {
    const cookieValue = document.cookie
      .split('; ')
      .find((row) => row.startsWith('csrftoken='))
      ?.split('=')[1];

    return cookieValue || '';
  }

  async function runImport(file: File) {
    if (!salesOrderId) {
      notifications.show({
        title: 'Invalid context',
        message: 'This action can only run on a sales order page',
        color: 'red'
      });
      return;
    }

    if (!importUrl) {
      notifications.show({
        title: 'Plugin setup issue',
        message: 'Import endpoint URL is missing in panel context',
        color: 'red'
      });
      return;
    }

    const payload = new FormData();
    payload.append('file', file);
    payload.append('sales_order_id', String(salesOrderId));

    setUploading(true);

    try {
      const response = await fetch(importUrl, {
        method: 'POST',
        body: payload,
        credentials: 'include',
        headers: {
          'X-CSRFToken': getCsrfToken()
        }
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.detail || 'Import failed');
      }

      setLastResult(data);

      notifications.show({
        title: 'Import completed',
        message: `Created ${data.created_count || 0} line items`,
        color: 'green'
      });
    } catch (error: any) {
      notifications.show({
        title: 'Import failed',
        message: String(error?.message || error),
        color: 'red'
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <Stack>
      <Title order={4} c={context.theme.primaryColor}>
        Sales Order Line Import
      </Title>

      <Alert icon={<IconInfoCircle />} color='blue'>
        Upload an Excel file with at least two columns: product name and
        quantity.
      </Alert>

      <input
        ref={fileInputRef}
        type='file'
        accept='.xlsx,.xlsm'
        style={{ display: 'none' }}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];

          if (!file) {
            return;
          }

          void runImport(file);

          event.currentTarget.value = '';
        }}
      />

      <Button
        onClick={() => fileInputRef.current?.click()}
        disabled={!salesOrderId || uploading}
      >
        {uploading ? <Loader size='xs' /> : 'Import from Excel'}
      </Button>

      {lastResult && (
        <Alert color='green' title='Import Summary'>
          <Stack gap='xs'>
            <Text>Created: {lastResult.created_count || 0}</Text>
            <Text>Skipped: {lastResult.skipped_count || 0}</Text>

            {Array.isArray(lastResult.unresolved) &&
              lastResult.unresolved.length > 0 && (
                <>
                  <Text fw={600}>Unresolved rows</Text>
                  <List spacing='xs' size='sm'>
                    {lastResult.unresolved
                      .slice(0, 10)
                      .map((item: any, idx: number) => (
                        <List.Item key={`unresolved-${idx}`}>
                          Row {item.row}: {item.product_name || '(empty)'} [
                          {item.reason}]
                        </List.Item>
                      ))}
                  </List>
                </>
              )}
          </Stack>
        </Alert>
      )}
    </Stack>
  );
}

// This is the function which is called by InvenTree to render the actual panel component
export function RenderSOLineItemImportPanel(context: InvenTreePluginContext) {
  checkPluginVersion(context);

  return <SOLineItemImportPanel context={context} />;
}

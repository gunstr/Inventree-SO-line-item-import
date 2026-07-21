import {
  checkPluginVersion,
  type InvenTreePluginContext,
  ModelType
} from '@inventreedb/ui';
import {
  Alert,
  Badge,
  Button,
  Group,
  List,
  Loader,
  Stack,
  Table,
  Text,
  Title
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconInfoCircle } from '@tabler/icons-react';
import { useMemo, useRef, useState } from 'react';

const DISPLAY_ROW_LIMIT = 50;

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
    return String(context.context?.import_url || '');
  }, [context.context]);

  const resolvedImportUrl = useMemo(() => {
    if (!importUrl) {
      return '';
    }

    try {
      return new URL(importUrl, window.location.origin).toString();
    } catch {
      return importUrl;
    }
  }, [importUrl]);

  const backendOrigin = useMemo(() => {
    const apiBase = String((context.api as any)?.defaults?.baseURL || '');

    if (apiBase) {
      try {
        return new URL(apiBase, window.location.origin).origin;
      } catch {
        // Continue with fallback strategies.
      }
    }

    const hostFromContext = String(context.host || '').trim();

    if (hostFromContext) {
      try {
        if (
          hostFromContext.startsWith('http://') ||
          hostFromContext.startsWith('https://')
        ) {
          return new URL(hostFromContext).origin;
        }

        return new URL(`http://${hostFromContext}`).origin;
      } catch {
        // Continue with fallback strategies.
      }
    }

    return window.location.origin;
  }, [context.api, context.host]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [pendingMode, setPendingMode] = useState<'dry-run' | 'import'>(
    'import'
  );
  const [previewExpired, setPreviewExpired] = useState(false);
  const hasPreviewResult = Boolean(lastResult?.dry_run);
  const canImport = Boolean(lastResult?.dry_run && lastResult?.preview_token);

  function getCsrfToken(): string {
    const cookieValue = document.cookie
      .split('; ')
      .find((row) => row.startsWith('csrftoken='))
      ?.split('=')[1];

    return cookieValue || '';
  }

  async function runImport(file: File | null, mode: 'dry-run' | 'import') {
    setPendingMode(mode);

    if (!salesOrderId) {
      notifications.show({
        title: 'Invalid context',
        message: 'This action can only run on a sales order page',
        color: 'red'
      });
      return;
    }

    if (!resolvedImportUrl) {
      notifications.show({
        title: 'Plugin setup issue',
        message: 'Import endpoint URL is missing in panel context',
        color: 'red'
      });
      return;
    }

    const payload = new FormData();
    payload.append('sales_order_id', String(salesOrderId));
    payload.append('dry_run', String(mode === 'dry-run'));

    if (mode === 'dry-run') {
      setPreviewExpired(false);

      if (!file) {
        notifications.show({
          title: 'No file selected',
          message: 'Please select an Excel file to preview.',
          color: 'red'
        });
        return;
      }

      payload.append('file', file);
    } else if (lastResult?.preview_token) {
      payload.append('preview_token', String(lastResult.preview_token));
    }

    setUploading(true);

    try {
      const endpoint = (() => {
        try {
          const path = new URL(resolvedImportUrl, window.location.origin)
            .pathname;
          return `${backendOrigin}${path}`;
        } catch {
          return `${backendOrigin}/plugin/so-line-item-import/import/so-lines/`;
        }
      })();

      const response = await fetch(endpoint, {
        method: 'POST',
        body: payload,
        credentials: 'include',
        headers: {
          'X-CSRFToken': getCsrfToken()
        }
      });

      const contentType = response.headers.get('content-type') || '';
      const responseText = await response.text();
      let data: any = null;

      if (responseText) {
        try {
          data = JSON.parse(responseText);
        } catch {
          data = null;
        }
      }

      if (response.redirected) {
        throw new Error(
          'Request was redirected. Please sign in again and retry.'
        );
      }

      if (!response.ok) {
        const fallback = responseText
          ? responseText.slice(0, 200)
          : `${response.status} ${response.statusText}`;

        const detail = data?.detail || fallback || 'Import failed';

        throw new Error(`${String(detail)} (URL: ${endpoint})`);
      }

      if (!contentType.includes('application/json') || !data) {
        throw new Error(
          `Import endpoint returned an unexpected response format (URL: ${endpoint}).`
        );
      }

      setLastResult(data);
      setPreviewExpired(false);

      notifications.show({
        title: mode === 'dry-run' ? 'Preview completed' : 'Import completed',
        message:
          mode === 'dry-run'
            ? `Would create ${data.would_create_count || 0} line items`
            : `Created ${data.created_count || 0} line items`,
        color: 'green'
      });
    } catch (error: any) {
      const message = String(error?.message || error);

      if (
        mode === 'import' &&
        (message.includes('Preview token is invalid or has expired') ||
          message.includes('Preview token does not match this sales order'))
      ) {
        setPreviewExpired(true);
        setLastResult((prev: any) =>
          prev ? { ...prev, preview_token: null } : prev
        );
      }

      notifications.show({
        title: 'Import failed',
        message,
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

          void runImport(file, pendingMode);

          event.currentTarget.value = '';
        }}
      />

      <Group>
        <Button
          variant='light'
          onClick={() => {
            setPendingMode('dry-run');
            fileInputRef.current?.click();
          }}
          disabled={!salesOrderId || uploading}
        >
          {uploading && pendingMode === 'dry-run' ? (
            <Loader size='xs' />
          ) : (
            'Upload Excel'
          )}
        </Button>
        <Button
          onClick={() => {
            void runImport(null, 'import');
          }}
          disabled={!salesOrderId || uploading || !canImport}
        >
          {uploading && pendingMode === 'import' ? (
            <Loader size='xs' />
          ) : (
            'Add to SO'
          )}
        </Button>
      </Group>

      <Badge
        color={canImport ? 'green' : previewExpired ? 'red' : 'gray'}
        variant='light'
      >
        {canImport
          ? 'Preview ready'
          : previewExpired
            ? 'Preview expired'
            : 'Preview required'}
      </Badge>

      {!canImport && (
        <Text size='sm' c='dimmed'>
          {previewExpired
            ? 'Preview expired. Upload Excel again to refresh the preview before adding to SO.'
            : hasPreviewResult
              ? 'Run Upload Excel again to generate a valid preview token before adding to SO.'
              : 'Run Upload Excel first to enable adding line items to this sales order.'}
        </Text>
      )}

      {lastResult && (
        <Alert
          color='green'
          title={lastResult.dry_run ? 'Preview Summary' : 'Import Summary'}
        >
          <Stack gap='xs'>
            {lastResult.dry_run ? (
              <Text>Would Create: {lastResult.would_create_count || 0}</Text>
            ) : (
              <Text>Created: {lastResult.created_count || 0}</Text>
            )}
            <Text>Skipped: {lastResult.skipped_count || 0}</Text>

            {Array.isArray(lastResult.unresolved) &&
              lastResult.unresolved.length > 0 && (
                <>
                  <Text fw={600}>Unresolved rows</Text>
                  <List spacing='xs' size='sm'>
                    {lastResult.unresolved
                      .slice(0, DISPLAY_ROW_LIMIT)
                      .map((item: any, idx: number) => (
                        <List.Item key={`unresolved-${idx}`}>
                          Row {item.row}: {item.product_name || '(empty)'} [
                          {item.reason}]
                        </List.Item>
                      ))}
                  </List>
                  {lastResult.unresolved.length > DISPLAY_ROW_LIMIT && (
                    <Text size='sm' c='dimmed'>
                      Showing first {DISPLAY_ROW_LIMIT} unresolved rows of{' '}
                      {lastResult.unresolved.length}
                    </Text>
                  )}
                </>
              )}

            {lastResult.dry_run &&
              Array.isArray(lastResult.preview_rows) &&
              lastResult.preview_rows.length > 0 && (
                <>
                  <Text fw={600}>Preview rows</Text>
                  <Table striped withTableBorder withColumnBorders>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Row</Table.Th>
                        <Table.Th>Status</Table.Th>
                        <Table.Th>Input</Table.Th>
                        <Table.Th>Matched Part</Table.Th>
                        <Table.Th>Quantity</Table.Th>
                        <Table.Th>Reason</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {lastResult.preview_rows
                        .slice(0, DISPLAY_ROW_LIMIT)
                        .map((item: any, idx: number) => (
                          <Table.Tr key={`preview-${idx}`}>
                            <Table.Td>{item.row ?? '-'}</Table.Td>
                            <Table.Td>
                              <Badge
                                color={
                                  item.status === 'ready' ||
                                  item.status === 'imported'
                                    ? 'green'
                                    : item.status === 'error'
                                      ? 'red'
                                      : 'yellow'
                                }
                                variant='light'
                              >
                                {item.status || 'unknown'}
                              </Badge>
                            </Table.Td>
                            <Table.Td>{item.input || '-'}</Table.Td>
                            <Table.Td>
                              {item.matched_ipn || item.matched_name
                                ? `${item.matched_ipn || ''}${item.matched_ipn && item.matched_name ? ' | ' : ''}${item.matched_name || ''}`
                                : '-'}
                            </Table.Td>
                            <Table.Td>{item.quantity || '-'}</Table.Td>
                            <Table.Td>{item.reason || '-'}</Table.Td>
                          </Table.Tr>
                        ))}
                    </Table.Tbody>
                  </Table>
                  {lastResult.preview_rows.length > DISPLAY_ROW_LIMIT && (
                    <Text size='sm' c='dimmed'>
                      Showing first {DISPLAY_ROW_LIMIT} rows of{' '}
                      {lastResult.preview_rows.length}
                    </Text>
                  )}
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

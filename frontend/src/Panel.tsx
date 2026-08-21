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
 *
 * The preview table below is client-side only: no token/cache is kept on the
 * server. `lastFileRef` holds the originally selected file so that
 * confirming ("Add to SO") can resend it and have the backend re-validate
 * everything against current data. See docs/implementation.md for why.
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
  const lastFileRef = useRef<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [pendingMode, setPendingMode] = useState<'dry-run' | 'import'>(
    'import'
  );
  const hasPreviewResult = Boolean(lastResult?.dry_run);
  const canImport = Boolean(hasPreviewResult && lastFileRef.current);

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

    if (mode === 'dry-run' && file) {
      lastFileRef.current = file;
    }

    const fileToSend = file ?? lastFileRef.current;

    if (!fileToSend) {
      notifications.show({
        title: 'No file selected',
        message: 'Please select an Excel file to preview.',
        color: 'red'
      });
      return;
    }

    // Every request (preview or import) resends the file so the backend
    // always re-parses and re-validates against the current database state.
    payload.append('file', fileToSend);

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
            void runImport(lastFileRef.current, 'import');
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

      {!canImport && (
        <Text size='sm' c='dimmed'>
          {hasPreviewResult
            ? 'The previewed file is no longer available. Run Upload Excel again before adding to SO.'
            : 'Run Upload Excel first to enable adding line items to this sales order.'}
        </Text>
      )}

      {canImport && (
        <Text size='sm' c='dimmed'>
          Adding to SO re-validates every row against the current database
          state, so results may differ slightly if data changed since the
          preview.
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

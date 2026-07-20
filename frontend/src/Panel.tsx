// Import for type checking
// Import table display function
import {
  ApiEndpoints,
  apiUrl,
  checkPluginVersion,
  INVENTREE_PLUGIN_VERSION,
  type InvenTreePluginContext,
  InvenTreeTable,
  ModelType,
  RowEditAction,
  useTable
} from '@inventreedb/ui';
import {
  Accordion,
  Alert,
  Button,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconInfoCircle } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';

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
  // React hooks can be used within plugin components
  useEffect(() => {
    console.log('useEffect in plugin component:');
    console.log('- Model:', context.model);
    console.log('- ID:', context.id);
  }, [context.model, context.id]);

  // Memoize the part ID as passed via the context object
  const partId = useMemo(() => {
    return context.model == ModelType.part ? context.id || null : null;
  }, [context.model, context.id]);

  // Does this InvenTree version support tables in plugins?
  const supportsTables = useMemo(() => !!context.tables, [context.tables]);

  // State management for the API driven table
  const tableState = useTable('my-custom-table');

  // Custom table properties for the loaded table
  const tableProps = {
    enableSelection: true,
    enablePagination: true,
    enableRefresh: true,
    modelType: ModelType.part,
    params: {
      active: true
    },
    tableFilters: [
      {
        name: 'assembly',
        label: 'Assembly',
        description: 'Show assembly parts'
      }
    ],
    rowActions: (record: any) => [
      RowEditAction({
        onClick: () => {
          notifications.show({
            title: 'Row Action Clicked',
            message: `You clicked the edit action for ${record.name}`,
            color: 'blue'
          });
        }
      })
    ]
  };

  // Hello world - counter example
  const [counter, setCounter] = useState<number>(0);

  // Extract context information
  const instance: string = useMemo(() => {
    const data = context?.instance ?? {};
    return JSON.stringify(data, null, 2);
  }, [context.instance]);

  // Custom form to edit the selected part
  const editPartForm = context.forms.edit({
    url: apiUrl(ApiEndpoints.part_list, partId),
    title: 'Edit Part',
    preFormContent: (
      <Alert title='Custom Plugin Form' color='blue'>
        This is a custom form launched from within a plugin!
      </Alert>
    ),
    fields: {
      name: {},
      description: {},
      category: {}
    },
    successMessage: null,
    onFormSuccess: () => {
      notifications.show({
        title: 'Success',
        message: 'Part updated successfully!',
        color: 'green'
      });
    }
  });

  // Custom callback function example
  const openForm = useCallback(() => {
    editPartForm?.open();
  }, [editPartForm]);

  // Navigation functionality example
  const gotoDashboard = useCallback(() => {
    context.navigate('/home');
  }, [context]);

  return (
    <>
      {editPartForm.modal}
      <Accordion defaultValue='main'>
        <Accordion.Item value='main'>
          <Accordion.Control>
            <Title c={context.theme.primaryColor} order={4}>
              Custom Data Examples
            </Title>
          </Accordion.Control>
          <Accordion.Panel>
            <SimpleGrid cols={2}>
              <Alert
                icon={<IconInfoCircle />}
                title={'Version Information'}
                color='blue'
              >
                <Stack gap='xs'>
                  <Text>
                    Frontend Version: {context?.version?.inventree || 'unknown'}
                  </Text>
                  <Text>Plugin Version: {INVENTREE_PLUGIN_VERSION}</Text>
                </Stack>
              </Alert>

              <Stack gap='xs'>
                <Group grow justify='apart' wrap='nowrap' gap='sm'>
                  <Button color='blue' onClick={gotoDashboard}>
                    Go to Dashboard
                  </Button>
                  {partId && (
                    <Button color='green' onClick={openForm}>
                      Edit Part
                    </Button>
                  )}
                </Group>
                <Group grow justify='apart' wrap='nowrap' gap='sm'>
                  <Button onClick={() => setCounter(counter + 1)}>
                    Increment Counter
                  </Button>
                  <Text size='xl'>Counter: {counter}</Text>
                </Group>
              </Stack>
              {instance ? (
                <Alert title='Instance Data' color='blue'>
                  {instance}
                </Alert>
              ) : (
                <Alert title='No Instance' color='yellow'>
                  No instance data available
                </Alert>
              )}
            </SimpleGrid>
          </Accordion.Panel>
        </Accordion.Item>
        <Accordion.Item value='table'>
          <Accordion.Control>
            <Title c={context.theme.primaryColor} order={4}>
              Custom Table Example
            </Title>
          </Accordion.Control>
          <Accordion.Panel>
            {supportsTables ? (
              <InvenTreeTable
                url={apiUrl(ApiEndpoints.part_list)}
                tableState={tableState}
                context={context}
                props={tableProps}
                columns={[
                  {
                    accessor: 'name',
                    switchable: false
                  },
                  {
                    accessor: 'IPN'
                  },
                  {
                    accessor: 'description'
                  }
                ]}
              />
            ) : (
              <Alert title='Table Not Supported' color='red'>
                {
                  'This version of InvenTree does not support tables within plugins.'
                }
                <br />
                {
                  'Please upgrade to a more recent version of InvenTree to use this feature.'
                }
              </Alert>
            )}
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </>
  );
}

// This is the function which is called by InvenTree to render the actual panel component
export function RenderSOLineItemImportPanel(context: InvenTreePluginContext) {
  checkPluginVersion(context);

  return <SOLineItemImportPanel context={context} />;
}

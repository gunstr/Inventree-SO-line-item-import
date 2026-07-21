# InvenTree Sales Order Line Item Import

Import Sales Order line items from Excel files directly in the [InvenTree](https://github.com/inventree/InvenTree) Sales Order UI.

## Development notes

The boilerplate for this plugin was generated using the [InvenTree plugin creator](https://github.com/inventree/plugin-creator).

Most of the initial application implementation has then been done by Copilot, with some manual adjustments and improvements.

## Installation

### InvenTree Plugin Manager

Open the Plugin Manager and add this plugin with the following setting:

Package name: inventree-so-line-item-import

Source URL: git+https://github.com/gunstr/Inventree-SO-line-item-import.git

Version: Select the version to install

Enable Confirm plugin installation and click Install

Once the installation is ready, activate the plugin

### Command Line 

To install manually via the command line, run the following command:

```bash
pip install https://github.com/gunstr/Inventree-SO-line-item-import.git
```

## Configuration

There is no configuration required for this plugin.

## Usage

The plugin adds an "Import Sales Order Lines" panel on Sales Order detail pages.

### Workflow

1. Click "Upload Excel" and select a file.
2. The plugin runs a dry-run preview first (no data is written).
3. Review the preview table and summary.
4. Click "Add to SO" to create Sales Order line items from the validated preview.

Notes:

- "Add to SO" is enabled only after a successful dry-run.
- The dry-run preview token is short-lived (15 minutes). If expired, upload again.

### Excel Format

The file must contain at least:

- one product column
- one quantity column

Additional columns are ignored.

### Part Name or IPN

**Header Aliases:**
The part name column should have any of the header aliases: 'product', 'product/service', 'product / service', 'product name', 'part', 'part name' or 'name' and is case insensitive.

**Values:**
The plugin resolves each value using exact matching only:

1. Exact IPN (case-insensitive)
2. Exact part name (case-insensitive)

Only salable parts are accepted.

If no exact match is found, the row is skipped and shown in the preview table.

A special case that is handled is when the part name or IPN contains a colon (":"). In this case, the part name or IPN will be split into two parts, and the plugin will attempt to match the last part with a part in InvenTree.

Example:

- `EX Extrusion:MT-EX-06-06-120-51` -> `MT-EX-06-06-120-51`

### Quantity

**Header Aliases:**
The quantity column should have any of the header aliases: 'qty', 'quantity', 'order qty' or 'ordered quantity' and is case insensitive.

**Values:**
The plugin accepts numeric values only. Rows are skipped if quantity is:

- missing
- invalid
- non-positive (<= 0)

These rows are marked in the preview table with a reason.

### Preview Output

The dry-run preview includes:

- summary counts (would create, skipped)
- row-level preview table with status, matched part, quantity, and reason

Up to 50 rows are shown in the panel table.

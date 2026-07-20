"""Custom parsing and importing of SO line items"""

from plugin import InvenTreePlugin

from plugin.mixins import AppMixin, UserInterfaceMixin

from . import PLUGIN_VERSION


class SOLineItemImport(AppMixin, UserInterfaceMixin, InvenTreePlugin):
    """SOLineItemImport - custom InvenTree plugin."""

    # Plugin metadata
    TITLE = "SO Line Item Import"
    NAME = "SOLineItemImport"
    SLUG = "so-line-item-import"
    DESCRIPTION = "Custom parsing and importing of SO line items"
    VERSION = PLUGIN_VERSION

    # Additional project information
    AUTHOR = "gunstr"
    WEBSITE = "https://my-project-url.com"
    LICENSE = "MIT"

    # Optionally specify supported InvenTree versions
    # MIN_VERSION = '0.18.0'
    # MAX_VERSION = '2.0.0'

    # User interface elements (from UserInterfaceMixin)
    # Ref: https://docs.inventree.org/en/latest/plugins/mixins/ui/

    # Custom UI panels
    def get_ui_panels(self, request, context: dict, **kwargs):
        """Return a list of custom panels to be rendered in the InvenTree user interface."""

        panels = []

        # Only display this panel for the 'part' target
        if context.get("target_model") == "part":
            panels.append({
                "key": "so-line-item-import-panel",
                "title": "SO Line Item Import",
                "description": "Custom panel description",
                "icon": "ti:mood-smile:outline",
                "source": self.plugin_static_file(
                    "Panel.js:RenderSOLineItemImportPanel"
                ),
                "context": {
                    # Provide additional context data to the panel'foo': 'bar'
                },
            })

        return panels

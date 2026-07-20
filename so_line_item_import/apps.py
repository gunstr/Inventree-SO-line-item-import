"""Django config for the SOLineItemImport plugin."""

from django.apps import AppConfig


class SOLineItemImportConfig(AppConfig):
    """Config class for the SOLineItemImport plugin."""

    name = "so_line_item_import"

    def ready(self):
        """This function is called whenever the SOLineItemImport plugin is loaded."""
        ...

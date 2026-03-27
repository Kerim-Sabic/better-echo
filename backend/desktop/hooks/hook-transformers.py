from PyInstaller.utils.hooks import (
    copy_metadata,
    get_module_attribute,
    is_module_satisfies,
    logger,
)

datas = []

try:
    dependencies = get_module_attribute(
        "transformers.dependency_versions_table",
        "deps",
    )
except Exception:
    logger.warning(
        "custom hook-transformers: failed to query dependency table.",
        exc_info=True,
    )
    dependencies = {}

for dependency_name, dependency_req in dependencies.items():
    if not is_module_satisfies(dependency_req):
        continue
    try:
        datas += copy_metadata(dependency_name)
    except Exception:
        pass

# Keep transformers modules in the PYZ archive only so vendor source files do
# not ship alongside the packaged server.
module_collection_mode = "pyz"

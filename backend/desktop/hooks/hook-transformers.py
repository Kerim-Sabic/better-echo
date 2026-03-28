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

# Keep the package on disk as source in frozen builds because transformers
# scans its own Python files at runtime to build the lazy import structure.
# PYC-only collection breaks that scan and causes packaged view-classifier
# imports to fail before any study analysis can run.
module_collection_mode = {
    "transformers": "py",
}

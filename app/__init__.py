import sys, pathlib
# Alias package: make ``import app.xxx`` resolve to the actual code under ``backend/app``
_backend_path = pathlib.Path(__file__).parent.parent / "backend" / "app"
if str(_backend_path) not in sys.path:
    sys.path.insert(0, str(_backend_path))
# Ensure this package’s __path__ points to the real directory for submodule discovery
__path__ = [str(_backend_path)]


import importlib, traceback, sys
modules = [
    'backend.app.api.v1.staff',
    'backend.app.api.v1.public',
    'backend.app.schemas.contracts',
    'backend.app.services.ws_manager',
    'backend.app.services.eta',
    'backend.app.services.queue',
]
for m in modules:
    try:
        importlib.import_module(m)
        print(f'{m}: OK')
    except Exception as e:
        print(f'{m}: FAIL')
        traceback.print_exc()

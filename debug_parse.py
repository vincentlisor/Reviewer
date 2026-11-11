from pathlib import Path
import esprima
for name in ['pharmaendterm2.js', 'common.js']:
    src = Path(name).read_text(encoding='utf-8')
    try:
        esprima.parseScript(src)
        print(name + ': OK')
    except Exception as e:
        print(name + ': FAIL')
        print(type(e).__name__ + ': ' + str(e))
        import traceback; traceback.print_exc(limit=5)

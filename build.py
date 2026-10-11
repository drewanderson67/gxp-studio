#!/usr/bin/env python3
"""Inline src/*.css + src/*.js into a single self-contained index.html."""
import pathlib, re
root = pathlib.Path(__file__).parent
src = root / 'src'
order = ['core.js', 'runner.js', 'migrate.js', 'seed.js', 'views1.js', 'views2.js', 'main.js']
js = '\n'.join((src / f).read_text() for f in order)
css = (src / 'style.css').read_text()
html = (src / 'index.tpl.html').read_text()
html = html.replace('/*CSS*/', css).replace('/*JS*/', js.replace('</script', '<\\/script'))
(root / 'index.html').write_text(html)
ver = re.search(r"APP_VERSION='([^']+)'", js).group(1)
sw = (src / 'sw.js').read_text().replace('__VERSION__', ver)
(root / 'sw.js').write_text(sw)
print(f'index.html {len(html)//1024} KB, v{ver}')

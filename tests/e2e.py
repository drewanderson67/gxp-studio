"""Browser smoke + flow test. Serve the repo on :8080 first (python3 -m http.server 8080).
Usage: python3 tests/e2e.py [cdp_url]  — uses Chrome over CDP if given, else launches Chromium."""
import asyncio, sys
from playwright.async_api import async_playwright
U = 'http://localhost:8080/index.html'
ROUTES = ['dashboard','docs','doc/DOC-0001','changes','change/CR-0001','defects','defect/BUG-0001','tests','run/TR-0002',
          'deviations','dev/DEV-0001','dev/DEV-0002','dev/DEV-0003','training','trace','code/CV-0001','audit','settings','more']
FAIL = []
def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{extra}]' if extra else ''))
    if not cond: FAIL.append(name)

async def main():
    async with async_playwright() as p:
        b = await (p.chromium.connect_over_cdp(sys.argv[1]) if len(sys.argv) > 1 else p.chromium.launch())
        ctx = await b.new_context(viewport={'width': 1300, 'height': 900}); pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        await pg.goto(U); await pg.evaluate('localStorage.clear()'); await pg.reload(); await pg.wait_for_timeout(400)
        ev = pg.evaluate
        dev = lambda k: ev(f"S.deviations.find(v=>v.id==='DEV-0003').{k}")
        async def toast(): return (await pg.locator('.toast').last.inner_text()) if await pg.locator('.toast').count() else ''
        async def user(n): await pg.select_option('[data-chg=user]', label=n); await pg.wait_for_timeout(150)
        async def sign(reason='ok'):
            await pg.wait_for_selector('#sgP'); await pg.fill('#sgR', reason); await pg.fill('#sgP', '1234'); await pg.click('#sgGo'); await pg.wait_for_timeout(250)
        for r in ROUTES:
            await pg.goto(U + '#/' + r); await pg.wait_for_timeout(100)
            if await pg.locator('text=Something went wrong').count(): errs.append('render ' + r)
        check('seed audit chain intact', await ev('verifyAudit().ok'))
        check('seed counts', await ev('S.deviations.length') == 3 and await ev('S.training.length') == 11)
        # training
        await user('Priya Shah'); await pg.goto(U + '#/training'); await pg.wait_for_timeout(150)
        check('Priya overdue on DOC-0001', await ev("trainingGaps('u2').map(([d,s])=>d.id+':'+s.k).join()") == 'DOC-0001:Overdue')
        await pg.click('[data-act=trainSign]'); await pg.wait_for_selector('#sgP')
        check('e-sign shows training warning', await pg.locator('.modal >> text=Training not current').count() == 1)
        await pg.fill('#sgP', '1234'); await pg.click('#sgGo'); await pg.wait_for_timeout(250)
        check('training signed clears gap', await ev("trainingGaps('u2').length") == 0)
        check('doc approval signatures untouched', await ev("S.docs.find(d=>d.id==='DOC-0001').signatures.length") == 2)
        await ev("(()=>{const d=S.docs.find(x=>x.id==='DOC-0002');d.version='5.0';d.effective=nowISO();save();render()})()")
        check('new SOP version resets training to Due', await ev("S.users.every(u=>trainingGaps(u.id).some(([d,s])=>d.id==='DOC-0002'&&s.k==='Due'))"))
        # deviation lifecycle on DEV-0003 (owner Alex, reporter Sam)
        await user('Alex Rivera'); await pg.goto(U + '#/dev/DEV-0003'); await pg.wait_for_timeout(150)
        await pg.click('[data-act=devAdv]'); await pg.wait_for_timeout(150)
        check('Investigation blocked without containment', await dev('status') == 'Open', await toast())
        await pg.fill('#vI', 'Workbook quarantined'); await pg.click('[data-act=devAdv]'); await pg.wait_for_timeout(150)
        check('moves to Investigation', await dev('status') == 'Investigation')
        await pg.fill('#vM', 'No patient impact'); await pg.select_option('#vK', index=7); await pg.fill('#vRC', 'LIMS screen unavailable on tablets')
        await pg.click('[data-act=devAdv]'); await pg.wait_for_timeout(150)
        check('Major QA Review blocked without CAPA', await dev('status') == 'Investigation', await toast())
        await pg.click('[data-act=devBug]'); await pg.wait_for_selector('#nbT'); await pg.click('#nbGo'); await pg.wait_for_timeout(300)
        check('linked defect raised', len(await dev('bugs')) == 1)
        await pg.goto(U + '#/dev/DEV-0003'); await pg.wait_for_timeout(150); await pg.click('[data-act=devAdv]'); await sign('Investigation done')
        check('signed into QA Review', await dev('status') == 'QA Review')
        await pg.click('[data-act=devAdv]'); await pg.wait_for_timeout(150)
        check('owner cannot close', await dev('status') == 'QA Review' and await pg.locator('#sgP').count() == 0, await toast())
        await user('Morgan Lee'); await pg.goto(U + '#/dev/DEV-0003'); await pg.click('[data-act=devAdv]'); await sign('Closed')
        check('QA closes with signature', await dev('status') == 'Closed' and await dev('signatures.length') == 2)
        check('audit chain intact after flows', await ev('verifyAudit().ok'))
        # v1.0 workspace upgrade
        await ev("(()=>{const s=JSON.parse(localStorage.getItem(STORE_KEY));delete s.deviations;delete s.training;localStorage.setItem(STORE_KEY,JSON.stringify(s))})()")
        await pg.reload(); await pg.wait_for_timeout(300)
        check('v1.0 workspace upgraded', await ev('S.deviations.length') == 3 and await ev('verifyAudit().ok'))
        await ctx.close()
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}); pg = await ctx.new_page()
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(U); await pg.evaluate('localStorage.clear()'); await pg.reload(); await pg.wait_for_timeout(300)
        over = []
        for r in ROUTES:
            await pg.goto(U + '#/' + r); await pg.wait_for_timeout(100)
            if await pg.evaluate('document.documentElement.scrollWidth') > 392: over.append(r)
        check('mobile: no horizontal overflow', not over, ','.join(over))
        await pg.goto(U + '#/deviations'); await pg.wait_for_timeout(100)
        check('mobile: More tab active on Deviations', await pg.locator('.tabbar a.on').inner_text() == '⋯\nMore' or 'More' in await pg.locator('.tabbar a.on').inner_text())
        check('no page/console errors', not errs, '; '.join(errs)[:300])
        await ctx.close()
    print('\n%d failure(s)' % len(FAIL)); sys.exit(1 if FAIL else 0)
asyncio.run(main())

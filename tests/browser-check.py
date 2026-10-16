"""Optional local Chromium smoke test (requires real npm dependency + running Vite server)."""
import asyncio, json, sys, pathlib
from playwright.async_api import async_playwright

async def run(url='http://127.0.0.1:5173/'):
    target=pathlib.Path(__file__).resolve().parents[1] / 'qa-results'
    target.mkdir(exist_ok=True)
    async with async_playwright() as p:
        browser=await p.chromium.launch(headless=True)
        page=await browser.new_page(viewport={'width':1440,'height':900}, device_scale_factor=1)
        errors=[]
        page.on('pageerror',lambda e: errors.append(str(e)))
        await page.goto(url,wait_until='domcontentloaded')
        await page.wait_for_function('Boolean(window.__NurseMemoCanvasProbe)',timeout=25000)
        await page.wait_for_timeout(700)
        initial=await page.evaluate('window.__NurseMemoCanvasProbe.pageCount()')
        await page.screenshot(path=str(target/'stress-desktop.png'),full_page=True)
        data=await page.evaluate('window.__NurseMemoCanvasProbe.stats()')
        page.once('dialog',lambda dialog: asyncio.create_task(dialog.accept()))
        await page.get_by_role('button',name='Normal memo').click()
        await page.wait_for_timeout(600)
        normal=await page.evaluate('window.__NurseMemoCanvasProbe.pageCount()')
        # Restore multi-page fixture using public programmatic hook.
        await page.evaluate('window.__NurseMemoCanvasProbe.reset(true)')
        await page.wait_for_timeout(250)
        await page.get_by_role('button',name='Append paragraph').click()
        after=await page.evaluate('window.__NurseMemoCanvasProbe.pageCount()')
        saved=await page.evaluate('window.__NurseMemoCanvasProbe.save()')
        await page.get_by_role('button',name='Save JSON').click()
        await page.get_by_role('button',name='Reload JSON').click()
        restored=await page.evaluate('window.__NurseMemoCanvasProbe.save()')
        result={
          'engine_loaded':True,'stress_pages':initial,'normal_pages':normal,
          'after_append_pages':after,'table_data':data,
          'roundtrip_contains_appended_text': 'Reflow test 1' in json.dumps(restored.get('data',{})),
          'page_errors':errors,
          'stress_at_least_three_pages':initial >= 3,
        }
        (target/'browser-results.json').write_text(json.dumps(result,indent=2))
        print(json.dumps(result,indent=2))
        await browser.close()
        if not result['stress_at_least_three_pages'] or errors or not result['roundtrip_contains_appended_text']:
            return 1
        return 0

if __name__=='__main__':sys.exit(asyncio.run(run(*sys.argv[1:])))

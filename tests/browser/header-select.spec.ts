import { expect, test } from '@playwright/test';

test('compact branding and themed picker preserve real search filtering and mobile navigation', async ({ page }) => {
  await page.setViewportSize({width:1280,height:900});
  await page.goto('/?q=삼성전자');
  await expect(page.locator('.brand')).toHaveText('Company Lens');
  const header=await page.locator('.site-header').boundingBox();
  expect(header!.height).toBeLessThanOrEqual(64);
  const region=page.getByRole('combobox',{name:'지역',exact:true});
  await region.click();
  await expect(page.getByRole('option',{name:'서울',exact:true})).toBeVisible();
  await page.getByRole('option',{name:'서울',exact:true}).click();
  await expect.poll(()=>new URL(page.url()).searchParams.get('region')).toBe('서울특별시');
  expect(new URL(page.url()).searchParams.get('q')).toBe('삼성전자');
  await expect(page.getByRole('combobox',{name:'지역',exact:true})).toHaveValue('서울특별시');
  for(const width of [390,320]) {
    await page.setViewportSize({width,height:844});
    await page.goto('/');
    const mobileHeader=await page.locator('.site-header').boundingBox();
    expect(mobileHeader!.height).toBeLessThan(100);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.getByRole('combobox',{name:'지역',exact:true}).click();
    await expect(page.getByRole('option',{name:'서울',exact:true})).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('navigation',{name:'주 메뉴'}).getByRole('link',{name:'사업장 비교',exact:true}).click();
    await expect(page).toHaveURL(/\/compare$/);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
});

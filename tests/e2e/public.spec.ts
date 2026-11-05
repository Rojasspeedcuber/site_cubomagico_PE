import { test, expect } from '@playwright/test';

test('acervo: busca, diagramas cube-icons e progresso local persistente', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/algoritmos');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('.ci svg').first()).toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('searchbox')).toBeVisible();
  await page.getByRole('searchbox').fill('Sune');
  await expect(page.getByText('Sune', { exact: true }).first()).toBeVisible();
  await page.getByRole('searchbox').fill('nenhum-caso-com-este-texto');
  await expect(page.getByText(/nenhum (algoritmo|caso|resultado)/i).first()).toBeVisible();
  await page.getByRole('searchbox').fill('');
  const favorite = page.getByRole('button', { name: /favorit/i }).first();
  await favorite.click();
  await page.reload();
  await expect(page.getByRole('button', { name: /remover.*favorit|desfavoritar/i }).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('navegação pública em tela pequena sem transbordamento', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ['/algoritmos', '/campeonatos', '/sobre', '/conta']) {
    await page.goto(path);
    await expect(page.locator('main')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  await page.goto('/sobre');
  await expect(page.getByText('Henrique Rojas', { exact: true }).first()).toBeVisible();
});

test('a área administrativa exige conta autorizada', async ({ page }) => {
  await page.goto('/admin');
  await expect(page.getByText(/entre|entrar|acesso restrito|permissão|conecte/i).first()).toBeVisible();
  const response = await page.request.get('/api/admin/events');
  expect(response.status()).toBe(401);
});

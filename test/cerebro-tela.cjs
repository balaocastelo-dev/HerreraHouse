// Interações da tela Cérebro no Chrome; usa as rotas reais com banco e Google simulados.
// Executar separadamente: node test/cerebro-tela.cjs (ou definir CHROME_PATH).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright-core');
const { criarServidor, CHAVE, NOVA, TOKEN } = require('./cerebro');

(async () => {
  const { base, estado, fechar } = await criarServidor();
  let browser;
  try {
    browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, timezoneId: 'UTC' });
    const page = await context.newPage(), erros = [];
    const falharProximaConsulta = () => page.route('**/gestor-api/cerebro?periodo=*', (r) => r.fulfill({
      status: 500, contentType: 'application/json', body: JSON.stringify({ erro: 'Falha simulada na leitura da configuração.' }),
    }), { times: 1 });
    async function conferirFalhaAposGravar() {
      await page.getByText('Não foi possível carregar a configuração. Use Atualizar consumo para tentar novamente.', { exact: true }).waitFor();
      await page.waitForFunction(() => document.querySelector('#ia-atualizar')?.disabled === false);
      for (const nome of ['Guardar', 'Testar', 'Atualizar modelos', 'Remover']) {
        assert.equal(await page.getByRole('button', { name: nome, exact: true }).isDisabled(), true, nome + ' não pode usar a configuração anterior após gravar');
      }
      assert.equal(await page.locator('[name=modelo]').isDisabled(), true);
      assert.equal(await page.getByLabel('Nova chave', { exact: true }).inputValue(), '');
    }
    page.on('pageerror', (e) => erros.push(e.message));
    await page.route('https://fonts.**', (r) => r.abort());
    await page.goto(base + '/gestor/cerebro');
    await page.locator('#f-entrar').waitFor();
    assert.equal(await page.locator('#cerebro').count(), 0);
    await context.addCookies([{ name: 'gestor_sessao', value: TOKEN, url: base }]);
    await page.reload();
    await page.waitForFunction(() => document.querySelector('#ia-testar')?.disabled === false);
    assert.match(await page.locator('#ia-estado').innerText(), /…7890/);
    assert.ok(!(await page.content()).includes(CHAVE));
    assert.equal(await page.locator('.cerebro-dia').count(), 30);
    assert.equal(await page.locator('#ia-consumo tfoot').innerText(), 'TOTAL\t15\t9.000.000.070\t110\t3');
    assert.match(await page.locator('#ia-consumo tbody').innerText(), /Onde <morar>\?/);
    await page.locator('.cerebro-dia').nth(8).focus();
    assert.match(await page.locator('#ia-dia').innerText(), /09\/10\/2026/);

    await page.getByRole('button', { name: 'Hoje', exact: true }).click();
    await page.getByText('Nenhum consumo registrado neste período.', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-periodo=hoje]').getAttribute('aria-pressed'), 'true');
    await page.getByRole('button', { name: 'Mês passado', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#ia-consumo tfoot')?.innerText.includes('9.000.000.070'));
    await page.locator('[data-periodo=mes]').click();
    await page.waitForFunction(() => document.querySelector('#ia-consumo')?.getAttribute('aria-busy') !== 'true');
    console.log('ok · tela protegida, tabela, períodos, barras acessíveis e texto escapado');

    await page.locator('[name=modelo]').selectOption('gemini-pro-teste');
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#ia-testar')?.disabled === false);
    assert.equal(estado.chave, CHAVE); assert.equal(estado.modelo, 'gemini-pro-teste');
    assert.equal(estado.gravacoes.at(-1)[2], true);
    await page.getByLabel('Nova chave', { exact: true }).fill(NOVA);
    await falharProximaConsulta();
    await page.getByRole('button', { name: 'Guardar', exact: true }).click();
    await conferirFalhaAposGravar();
    assert.equal(estado.chave, NOVA, 'a troca já foi gravada apesar da falha na consulta seguinte');
    await page.getByRole('button', { name: 'Atualizar consumo', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#ia-estado')?.textContent.includes('…3210'));
    await page.waitForFunction(() => document.querySelector('#ia-testar')?.disabled === false);
    assert.equal(await page.locator('[name=modelo]').inputValue(), 'gemini-pro-teste');
    assert.equal(await page.getByLabel('Nova chave', { exact: true }).inputValue(), '');
    assert.ok(!(await page.content()).includes(NOVA));
    assert.match(await page.locator('#ia-estado').innerText(), /30\/10\/2026, 14:35:00/);
    await page.getByRole('button', { name: 'Testar', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#ia-teste')?.textContent.startsWith('OK'));
    assert.match(await page.locator('#ia-teste').innerText(), /\([\d,]+ s\)/);
    await page.waitForFunction(() => document.querySelector('#ia-testar')?.disabled === false);
    estado.erroGoogle = 429;
    await page.getByRole('button', { name: 'Testar', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#ia-teste')?.textContent.startsWith('Erro'));
    assert.match(await page.locator('#ia-teste').innerText(), /Limite de uso/);
    estado.erroGoogle = 0;
    await page.waitForFunction(() => document.querySelector('#ia-testar')?.disabled === false);
    console.log('ok · guardar apenas modelo, trocar chave, limpar campo e testar sucesso/erro com duração');

    const pasta = path.join(__dirname, '..', 'data', 'cerebro-qa'); fs.mkdirSync(pasta, { recursive: true });
    await page.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll('.aviso').forEach((a) => a.remove()); });
    await page.screenshot({ path: path.join(pasta, 'desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(pasta, 'celular.png'), fullPage: true });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'a rolagem deve ficar dentro da tabela e do gráfico');
    await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
    await page.screenshot({ path: path.join(pasta, 'celular-escuro.png'), fullPage: true });
    await page.getByRole('button', { name: 'Remover', exact: true }).click();
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    assert.equal(estado.chave, NOVA);
    await page.getByRole('button', { name: 'Remover', exact: true }).click();
    await falharProximaConsulta();
    await page.getByRole('button', { name: 'Remover chave', exact: true }).click();
    await conferirFalhaAposGravar();
    assert.equal(estado.chave, null, 'a remoção já foi gravada apesar da falha na consulta seguinte');
    await page.getByRole('button', { name: 'Hoje', exact: true }).click();
    await page.getByText('Guarde uma chave para listar e testar os modelos disponíveis.', { exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('#f-cerebro fieldset')?.disabled === false);
    assert.match(await page.locator('#ia-estado').innerText(), /Nenhuma chave central cadastrada/);
    assert.equal(estado.chave, null); assert.equal(await page.locator('#ia-testar').isDisabled(), true);
    console.log('ok · falha após guardar/remover bloqueia estado anterior e recupera configuração pelo consumo ou período');

    estado.erroBanco = true;
    await page.reload();
    await page.getByText('Não foi possível carregar a configuração. Use Atualizar consumo para tentar novamente.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Guardar', exact: true }).isDisabled(), true);
    estado.erroBanco = false;
    await page.getByRole('button', { name: 'Hoje', exact: true }).click();
    await page.getByText('Nenhum consumo registrado neste período.', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Guardar', exact: true }).isDisabled(), false, 'trocar o período também deve recuperar a configuração após uma falha inicial');
    assert.match(await page.locator('#ia-estado').innerText(), /Nenhuma chave central cadastrada/);

    estado.erroBanco = true;
    await page.reload();
    await page.getByText('Não foi possível carregar a configuração. Use Atualizar consumo para tentar novamente.', { exact: true }).waitFor();
    estado.erroBanco = false;
    await page.getByRole('button', { name: 'Atualizar consumo', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('#f-cerebro fieldset')?.disabled === false);
    await context.clearCookies();
    await page.getByRole('button', { name: 'Atualizar consumo', exact: true }).click();
    await page.locator('#f-entrar').waitFor();
    assert.equal(await page.locator('#cerebro').count(), 0);
    assert.deepEqual(erros, []);
    console.log('ok · celular sem transbordamento, remoção, recuperação de falha e sessão expirada');
  } finally { if (browser) await browser.close(); await fechar(); }
})().catch((e) => { console.error(e); process.exitCode = 1; });

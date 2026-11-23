/* Vendas e margem: a tela. Precisa de comum.js, ui.js e margem-logica.js antes. */
(function () {
  'use strict';
  var C = window.Comum, UI = window.UI, M = window.Margem;
  var CHAVE = 'ferramentas-bpo:margem:v1';
  var guardaOk = UI.navegadorGuarda();
  var $ = function (id) { return document.getElementById(id); };
  var esc = UI.esc;

  // ---------- configurações guardadas (só configurações, nunca as vendas) ----------
  var dados = normalizar(C.recuperar(CHAVE, null));
  function normalizar(d) {
    if (!d || typeof d !== 'object' || !d.clientes || typeof d.clientes !== 'object') d = { clientes: {}, atual: null };
    Object.keys(d.clientes).forEach(function (k) {
      var c = d.clientes[k];
      if (!c || typeof c !== 'object') { delete d.clientes[k]; return; }
      c.id = k;
      c.classes = c.classes || {}; c.mapas = c.mapas || {}; c.taxaPct = c.taxaPct || {};
      if (c.tolerancia == null) c.tolerancia = 1;
    });
    if (!d.atual || !d.clientes[d.atual]) d.atual = Object.keys(d.clientes)[0] || null;
    return d;
  }
  function novoCliente() {
    var c = { id: C.id(), nome: '', aliquota: null, tolerancia: 1, cmvModo: null, cmvValor: '', cmvPct: '', classes: {}, mapas: {}, taxaPct: {} };
    dados.clientes[c.id] = c; dados.atual = c.id;
    return c;
  }
  function cli() { return dados.clientes[dados.atual] || novoCliente(); }
  function salvar() { if (guardaOk) C.guardar(CHAVE, dados); }
  function numero(t) { return C.valor(String(t == null ? '' : t).replace('%', '')); }

  // ---------- estado da análise (some ao fechar) ----------
  var estado = { sistema: null, maquininhas: [], mes: null };

  // ---------- passo 1: cliente ----------
  function renderCliente() {
    var sel = $('cliente-sel'), c = cli();
    sel.innerHTML = '';
    Object.keys(dados.clientes).map(function (k) { return dados.clientes[k]; })
      .sort(function (a, b) { return (a.nome || '').localeCompare(b.nome || '', 'pt-BR'); })
      .forEach(function (x) { sel.appendChild(UI.el('option', { value: x.id, texto: x.nome || '(cliente sem nome)' })); });
    sel.value = c.id;
    $('cliente-nome').value = c.nome || '';
    $('aliquota').value = c.aliquota == null ? '' : C.num(c.aliquota, c.aliquota % 1 ? 2 : 0);
    $('tolerancia').value = C.num(c.tolerancia == null ? 1 : c.tolerancia, 2);
    $('cmv-valor').value = c.cmvValor || '';
    $('cmv-pct').value = c.cmvPct || '';
  }
  function ligarCliente() {
    $('cliente-sel').addEventListener('change', function () {
      dados.atual = this.value; salvar();
      renderCliente(); reaplicarMemoria(); tudo();
    });
    $('cliente-nome').addEventListener('input', function () {
      cli().nome = this.value.trim(); salvar();
      var op = $('cliente-sel').querySelector('option[value="' + cli().id + '"]');
      if (op) op.textContent = cli().nome || '(cliente sem nome)';
      renderResultado(); marcarPassos();
    });
    $('cliente-nome').addEventListener('change', function () { renderCliente(); });
    $('aliquota').addEventListener('input', function () { cli().aliquota = numero(this.value); salvar(); renderResultado(); });
    $('tolerancia').addEventListener('input', function () {
      var t = numero(this.value); cli().tolerancia = t == null ? 1 : Math.abs(t); salvar(); renderResultado();
    });
    $('btn-novo').addEventListener('click', function () {
      novoCliente(); salvar(); renderCliente(); reaplicarMemoria(); tudo();
      $('cliente-nome').focus();
    });
    $('btn-apagar').addEventListener('click', function () {
      var c = cli();
      if (!window.confirm('Apagar as configurações de "' + (c.nome || 'cliente sem nome') + '" deste navegador? Isso não tem volta (a não ser por um backup).')) return;
      delete dados.clientes[c.id];
      dados.atual = Object.keys(dados.clientes)[0] || null;
      if (!dados.atual) novoCliente();
      salvar(); renderCliente(); reaplicarMemoria(); tudo();
      UI.avisar('Cliente apagado.');
    });
    $('btn-backup').addEventListener('click', function () {
      var hoje = new Date();
      var nome = 'backup-vendas-e-margem-' + hoje.getFullYear() + '-' + String(hoje.getMonth() + 1).padStart(2, '0') + '-' + String(hoje.getDate()).padStart(2, '0') + '.json';
      UI.baixar(nome, JSON.stringify({ ferramenta: 'vendas-e-margem', versao: 1, clientes: dados.clientes, atual: dados.atual }, null, 2), 'application/json');
      UI.avisar('Backup salvo: ' + nome);
    });
    $('btn-restaurar').addEventListener('click', function () {
      UI.escolherArquivo('.json,application/json').then(function (f) {
        if (!f) return null;
        return UI.lerJSON(f);
      }).then(function (obj) {
        if (!obj) return;
        if (!obj.clientes || typeof obj.clientes !== 'object') throw new Error('Esse arquivo não é um backup da ferramenta Vendas e margem.');
        var n = Object.keys(obj.clientes).length;
        if (!window.confirm('Restaurar ' + n + ' cliente(s) do backup? Clientes com o mesmo cadastro serão substituídos pelos do backup.')) return;
        Object.keys(obj.clientes).forEach(function (k) { dados.clientes[k] = obj.clientes[k]; });
        if (obj.atual && obj.clientes[obj.atual]) dados.atual = obj.atual;
        dados = normalizar(dados);
        salvar(); renderCliente(); reaplicarMemoria(); tudo();
        UI.avisar('Backup restaurado.');
      }).catch(function (e) { UI.avisar(e.message, 'erro'); });
    });
  }

  // ---------- memória das colunas ----------
  function lembrar(prefixo, tabela) {
    var m = cli().mapas[prefixo + M.assinatura(tabela.cabecalho)];
    if (!m) return;
    Object.keys(tabela.escolha).forEach(function (k) {
      if (typeof m[k] === 'number' && m[k] < tabela.cabecalho.length) tabela.escolha[k] = m[k];
    });
  }
  function guardarMapa(prefixo, tabela) {
    var copia = {};
    Object.keys(tabela.escolha).forEach(function (k) { copia[k] = tabela.escolha[k]; });
    cli().mapas[prefixo + M.assinatura(tabela.cabecalho)] = copia;
    salvar();
  }
  // trocou de cliente: usa o que esse cliente lembra
  function reaplicarMemoria() {
    if (estado.sistema) { lembrar('v:', estado.sistema.tabela); processarSistema(); renderSistema(); }
    estado.maquininhas.forEach(function (m) { lembrar('m:', m.tabela); processarMaq(m); });
    renderMaqs();
  }

  // ---------- passo 2: vendas do sistema ----------
  function linhasDe(obj) { return obj.abas[obj.aba].linhas; }
  function prepararSistema(aba) {
    var s = estado.sistema;
    s.aba = aba;
    s.tabela = M.prepararTabela(linhasDe(s), M.CAMPOS_VENDAS);
    lembrar('v:', s.tabela);
    processarSistema();
  }
  function processarSistema() {
    var s = estado.sistema;
    if (!s) return;
    s.falta = C.faltando(s.tabela.escolha, M.CAMPOS_VENDAS);
    s.leitura = s.falta.length ? null : M.lerVendas(linhasDe(s), s.tabela.inicio, s.tabela.escolha, { classes: cli().classes });
  }
  function receberSistema(arquivos) {
    var f = arquivos[0];
    UI.lerArquivo(f).then(function (abas) {
      if (!abas.length) throw new Error('O arquivo "' + f.name + '" está vazio.');
      estado.sistema = { arquivo: f.name, abas: abas, aba: 0 };
      prepararSistema(M.melhorAba(abas, M.CAMPOS_VENDAS));
      renderSistema(); tudo();
      UI.avisar('Vendas lidas: ' + f.name);
    }).catch(function (e) { UI.avisar(e.message, 'erro'); });
  }
  function seletorAba(obj, aoTrocar) {
    if (obj.abas.length < 2) return null;
    var sel = UI.el('select', { 'aria-label': 'Aba da planilha' });
    obj.abas.forEach(function (a, i) { sel.appendChild(UI.el('option', { value: String(i), texto: a.nome + ' (' + a.linhas.length + ' linhas)' })); });
    sel.value = String(obj.aba);
    sel.addEventListener('change', function () { aoTrocar(Number(sel.value)); });
    return UI.el('label', { class: 'campo campo-aba' }, [UI.el('span', { texto: 'Esta planilha tem ' + obj.abas.length + ' abas. Usando a aba:' }), sel]);
  }
  function renderSistema() {
    var alvo = $('sistema-info');
    alvo.innerHTML = '';
    var s = estado.sistema;
    if (!s) return;
    var bloco = UI.el('div', { class: 'bloco-arquivo' });
    var tirar = UI.el('button', { type: 'button', class: 'btn btn-perigo', texto: 'Tirar arquivo', onclick: function () {
      estado.sistema = null; renderSistema(); tudo();
    } });
    bloco.appendChild(UI.el('div', { class: 'arquivo-lido' }, [UI.el('span', {}, [UI.el('b', { texto: 'Lido: ' }), s.arquivo]), tirar]));
    var aba = seletorAba(s, function (i) { prepararSistema(i); renderSistema(); tudo(); });
    if (aba) { bloco.appendChild(UI.el('div', { style: 'margin-top:10px' }, [aba])); }
    bloco.appendChild(UI.el('h3', { texto: 'Confira as colunas' }));
    bloco.appendChild(UI.el('p', { class: 'ajuda', style: 'margin-bottom:8px', texto: 'Já escolhi as que reconheci. Se alguma estiver errada, troque. Na próxima vez, para este cliente, eu lembro.' }));
    var mapa = UI.el('div');
    bloco.appendChild(mapa);
    var detalhe = UI.el('div', { id: 'sistema-detalhe' });
    bloco.appendChild(detalhe);
    alvo.appendChild(bloco);
    var linhas = linhasDe(s);
    UI.mapeador(mapa, s.tabela.cabecalho, M.CAMPOS_VENDAS, s.tabela.escolha, linhas.slice(s.tabela.inicio + 1, s.tabela.inicio + 8), function () {
      guardarMapa('v:', s.tabela); processarSistema(); renderSistemaDetalhe(); tudo();
    });
    renderSistemaDetalhe();
  }
  function listaMotivos(itens, fn) {
    if (!itens.length) return '';
    var max = 200;
    return '<ul>' + itens.slice(0, max).map(function (x) { return '<li>' + esc(fn(x)) + '</li>'; }).join('') +
      (itens.length > max ? '<li>e mais ' + (itens.length - max) + '</li>' : '') + '</ul>';
  }
  function renderSistemaDetalhe() {
    var alvo = $('sistema-detalhe'), s = estado.sistema;
    if (!alvo || !s) return;
    if (s.falta.length) {
      alvo.innerHTML = '<div class="nota erro">Falta escolher a coluna de: <b>' + esc(s.falta.map(function (c) { return c.rotulo; }).join(', ')) + '</b>. Sem ela não dá para seguir.</div>';
      return;
    }
    var L = s.leitura;
    var tot = C.soma(L.canceladas, function (c) { return c.valor; });
    var h = '<details class="lidas"><summary>Linhas lidas: ' + L.lidas + '. Vendas usadas: ' + L.vendas.length +
      '. Canceladas: ' + L.canceladas.length + '. Ignoradas: ' + L.ignoradas.length + '. Ver por quê</summary>';
    if (L.canceladas.length) h += '<p style="margin-top:6px"><b>Canceladas, estornadas ou devolvidas (ficaram de fora, ' + esc(C.brl(tot)) + '):</b></p>' +
      listaMotivos(L.canceladas, function (c) { return 'Linha ' + c.linha + ': ' + C.dataBR(c.data) + ', ' + C.brl(c.valor) + ', ' + (c.forma || '') + ' (' + c.situacao + ')'; });
    if (L.ignoradas.length) h += '<p style="margin-top:6px"><b>Ignoradas:</b></p>' + listaMotivos(L.ignoradas, function (x) { return 'Linha ' + x.linha + ': ' + x.motivo; });
    if (!L.canceladas.length && !L.ignoradas.length) h += '<p style="margin-top:6px">Nenhuma linha ficou de fora.</p>';
    h += '</details>';
    if (!L.vendas.length) h += '<div class="nota erro">Não achei nenhuma venda com data e valor. Confira as colunas acima.</div>';
    alvo.innerHTML = h;
    if (!L.vendas.length) return;

    // como entendi cada forma de pagamento
    var textos = M.textosDeForma(L.vendas);
    alvo.appendChild(UI.el('h3', { style: 'margin-top:16px', texto: 'Como entendi cada forma de pagamento' }));
    alvo.appendChild(UI.el('p', { class: 'ajuda', style: 'margin-bottom:8px', texto: 'Se algum estiver errado, troque. A correção fica guardada para este cliente.' }));
    var tabela = UI.el('table', { class: 'tabela-classes' });
    tabela.innerHTML = '<thead><tr><th>No sistema está</th><th class="n">Vendas</th><th class="n">Valor</th><th>Entendi como</th></tr></thead>';
    var corpo = UI.el('tbody');
    textos.forEach(function (t) {
      var sel = UI.el('select', { 'aria-label': 'Classe de ' + t.texto });
      M.CLASSES.forEach(function (c) { sel.appendChild(UI.el('option', { value: c.chave, texto: c.nome + (c.chave === t.classeAuto ? ' (automático)' : '') })); });
      sel.value = t.classe;
      var td = UI.el('td', { class: t.classe !== t.classeAuto ? 'mudou' : null }, [sel]);
      sel.addEventListener('change', function () {
        if (sel.value === t.classeAuto) delete cli().classes[t.chave]; else cli().classes[t.chave] = sel.value;
        salvar();
        M.aplicarClasses(L.vendas, cli().classes);
        td.className = sel.value !== t.classeAuto ? 'mudou' : '';
        tudo();
      });
      corpo.appendChild(UI.el('tr', {}, [UI.el('td', { texto: t.texto }), UI.el('td', { class: 'n', texto: String(t.qtd) }), UI.el('td', { class: 'n', texto: C.brl(t.valor) }), td]));
    });
    tabela.appendChild(corpo);
    alvo.appendChild(UI.el('div', { class: 'tabela-rolagem' }, [tabela]));
    if (textos.some(function (t) { return t.classe === 'cartao'; })) {
      alvo.appendChild(UI.el('div', { class: 'nota atencao', html: 'Algumas vendas estão só como <b>cartão</b>, sem dizer se é débito ou crédito. Nesses dias eu confiro só o total do cartão.' }));
    }
  }

  // ---------- passo 3: maquininhas ----------
  function processarMaq(m) {
    m.falta = C.faltando(m.tabela.escolha, M.CAMPOS_MAQ);
    if (m.falta.length) { m.leitura = null; return; }
    var lemb = cli().taxaPct[M.assinatura(m.tabela.cabecalho)];
    m.leitura = M.lerMaquininha(linhasDe(m), m.tabela.inicio, m.tabela.escolha, { arquivo: m.arquivo, taxaPct: typeof lemb === 'boolean' ? lemb : null });
  }
  function prepararMaq(m, aba) {
    m.aba = aba;
    m.tabela = M.prepararTabela(linhasDe(m), M.CAMPOS_MAQ);
    lembrar('m:', m.tabela);
    processarMaq(m);
  }
  function receberMaq(arquivos) {
    var pend = arquivos.map(function (f) {
      return UI.lerArquivo(f).then(function (abas) {
        if (!abas.length) throw new Error('O arquivo "' + f.name + '" está vazio.');
        var m = { id: C.id(), arquivo: f.name, abas: abas, aba: 0 };
        prepararMaq(m, M.melhorAba(abas, M.CAMPOS_MAQ));
        estado.maquininhas.push(m);
      }).catch(function (e) { UI.avisar(e.message, 'erro'); });
    });
    Promise.all(pend).then(function () { renderMaqs(); tudo(); });
  }
  function renderMaqs() {
    var alvo = $('maq-lista');
    alvo.innerHTML = '';
    estado.maquininhas.forEach(function (m) {
      var bloco = UI.el('div', { class: 'bloco-arquivo' });
      var tirar = UI.el('button', { type: 'button', class: 'btn btn-perigo', texto: 'Tirar arquivo', onclick: function () {
        estado.maquininhas = estado.maquininhas.filter(function (x) { return x !== m; });
        renderMaqs(); tudo();
      } });
      bloco.appendChild(UI.el('div', { class: 'arquivo-lido' }, [UI.el('span', {}, [UI.el('b', { texto: 'Lido: ' }), m.arquivo]), tirar]));
      var aba = seletorAba(m, function (i) { prepararMaq(m, i); renderMaqs(); tudo(); });
      if (aba) bloco.appendChild(UI.el('div', { style: 'margin-top:10px' }, [aba]));
      bloco.appendChild(UI.el('h3', { texto: 'Confira as colunas' }));
      var mapa = UI.el('div');
      bloco.appendChild(mapa);
      var det = UI.el('div');
      bloco.appendChild(det);
      alvo.appendChild(bloco);
      var linhas = linhasDe(m);
      UI.mapeador(mapa, m.tabela.cabecalho, M.CAMPOS_MAQ, m.tabela.escolha, linhas.slice(m.tabela.inicio + 1, m.tabela.inicio + 8), function () {
        guardarMapa('m:', m.tabela); processarMaq(m); renderMaqDetalhe(m, det); tudo();
      });
      renderMaqDetalhe(m, det);
    });
    if (estado.maquininhas.length) {
      alvo.appendChild(UI.el('p', { class: 'ajuda', style: 'margin-top:8px', texto: 'Tem outra maquininha? Arraste o arquivo dela acima: ela entra junto.' }));
    }
  }
  function renderMaqDetalhe(m, alvo) {
    alvo.innerHTML = '';
    if (m.falta.length) {
      alvo.innerHTML = '<div class="nota erro">Falta escolher a coluna de: <b>' + esc(m.falta.map(function (c) { return c.rotulo; }).join(', ')) + '</b>. Sem ela este arquivo fica de fora.</div>';
      return;
    }
    var e = m.tabela.escolha, L = m.leitura;
    // taxa em R$ ou %
    if (e.taxa >= 0 && !(e.liquido >= 0)) {
      var ass = M.assinatura(m.tabela.cabecalho), lemb = cli().taxaPct[ass];
      var sel = UI.el('select', { 'aria-label': 'A coluna da taxa está em' });
      sel.appendChild(UI.el('option', { value: 'auto', texto: 'Descobrir sozinha (achei: ' + (L.taxaPct ? '%' : 'R$') + ')' }));
      sel.appendChild(UI.el('option', { value: 'reais', texto: 'Em R$ (valor da taxa)' }));
      sel.appendChild(UI.el('option', { value: 'pct', texto: 'Em % (percentual sobre a venda)' }));
      sel.value = lemb === true ? 'pct' : lemb === false ? 'reais' : 'auto';
      sel.addEventListener('change', function () {
        if (sel.value === 'auto') delete cli().taxaPct[ass]; else cli().taxaPct[ass] = sel.value === 'pct';
        salvar(); processarMaq(m); renderMaqDetalhe(m, alvo); tudo();
      });
      alvo.appendChild(UI.el('label', { class: 'campo campo-aba', style: 'margin-top:12px' }, [UI.el('span', { texto: 'A coluna da taxa está em:' }), sel]));
    } else if (!(e.taxa >= 0) && !(e.liquido >= 0)) {
      alvo.appendChild(UI.el('div', { class: 'nota atencao', texto: 'Este arquivo não tem valor líquido nem taxa. Dá para conferir as vendas, mas não sei quanto a maquininha cobrou. Se o portal tiver um relatório com o valor líquido, use ele.' }));
    }
    if (!(e.modalidade >= 0)) {
      alvo.appendChild(UI.el('div', { class: 'nota atencao', texto: 'Sem a coluna de modalidade, não sei o que foi débito ou crédito: confiro só o total do cartão de cada dia.' }));
    }
    var totAp = C.soma(L.aParte, function (x) { return x.bruto; });
    var h = '<details class="lidas"><summary>Linhas lidas: ' + L.lidas + '. Vendas usadas: ' + L.transacoes.length +
      '. Canceladas, estornadas ou negadas: ' + L.aParte.length + '. Ignoradas: ' + L.ignoradas.length + '. Ver por quê</summary>';
    if (L.aParte.length) h += '<p style="margin-top:6px"><b>À parte (não entram na conta, ' + esc(C.brl(totAp)) + '):</b></p>' +
      listaMotivos(L.aParte, function (x) { return 'Linha ' + x.linha + ': ' + C.dataBR(x.data) + ', ' + C.brl(x.bruto) + ', ' + (x.modalidade || '') + ' ' + (x.bandeira || '') + ' (' + x.motivo + ')'; });
    if (L.ignoradas.length) h += '<p style="margin-top:6px"><b>Ignoradas:</b></p>' + listaMotivos(L.ignoradas, function (x) { return 'Linha ' + x.linha + ': ' + x.motivo; });
    if (!L.aParte.length && !L.ignoradas.length) h += '<p style="margin-top:6px">Nenhuma linha ficou de fora.</p>';
    h += '</details>';
    if (!L.transacoes.length) h += '<div class="nota erro">Não achei nenhuma venda com data e valor bruto neste arquivo. Confira as colunas acima.</div>';
    alvo.insertAdjacentHTML('beforeend', h);
  }

  // ---------- passo 4: CMV ----------
  function temCusto() { var s = estado.sistema; return !!(s && s.tabela && s.tabela.escolha.custo >= 0); }
  function modoCmv() {
    var c = cli();
    if (c.cmvModo) return c.cmvModo;
    return temCusto() ? 'coluna' : null;
  }
  function ligarCmv() {
    Array.prototype.forEach.call(document.querySelectorAll('input[name="cmv-modo"]'), function (r) {
      r.addEventListener('change', function () { cli().cmvModo = r.value; salvar(); tudo(); });
    });
    $('cmv-valor').addEventListener('input', function () { cli().cmvValor = this.value; if (this.value) cli().cmvModo = 'valor'; salvar(); tudo(); });
    $('cmv-pct').addEventListener('input', function () { cli().cmvPct = this.value; if (this.value) cli().cmvModo = 'pct'; salvar(); tudo(); });
  }
  function renderCmv() {
    var modo = modoCmv();
    Array.prototype.forEach.call(document.querySelectorAll('input[name="cmv-modo"]'), function (r) { r.checked = r.value === modo; });
    $('cmv-coluna-dica').textContent = estado.sistema ? (temCusto() ? '(achei a coluna de custo)' : '(o relatório não tem coluna de custo)') : '';
    var av = $('cmv-aviso'), h = '';
    if (!modo) h = '<div class="nota atencao">Escolha como calcular o custo do que foi vendido. Sem ele, mostro as vendas e a maquininha, mas não a margem.</div>';
    else if (modo === 'coluna' && estado.sistema && !temCusto()) h = '<div class="nota erro">O relatório de vendas não tem coluna de custo (ou ela não foi escolhida no passo 2). Escolha a coluna ou outro jeito acima.</div>';
    else if (modo === 'valor' && numero(cli().cmvValor) == null) h = '<div class="nota atencao">Digite o valor do CMV do mês.</div>';
    else if (modo === 'pct' && numero(cli().cmvPct) == null) h = '<div class="nota atencao">Digite o % de custo sobre a venda.</div>';
    av.innerHTML = h;
  }

  // ---------- passo 5: resultado ----------
  var ultimo = null;
  function transacoes() {
    var t = [];
    estado.maquininhas.forEach(function (m) { if (m.leitura) t = t.concat(m.leitura.transacoes); });
    return t;
  }
  function cartao(titulo, valor, detalhe, classe) {
    return '<div class="cartao' + (classe ? ' ' + classe : '') + '"><small>' + esc(titulo) + '</small><b>' + esc(valor) + '</b>' + (detalhe ? '<span>' + esc(detalhe) + '</span>' : '') + '</div>';
  }
  function renderResultado() {
    var alvo = $('resultado'), s = estado.sistema;
    ultimo = null;
    if (!s) { alvo.innerHTML = '<p class="ajuda">Arraste as vendas do sistema no passo 2 para ver o resultado.</p>'; return; }
    if (s.falta.length) { alvo.innerHTML = '<div class="nota erro">Termine de escolher as colunas obrigatórias das vendas do sistema (passo 2).</div>'; return; }
    if (!s.leitura.vendas.length) { alvo.innerHTML = '<div class="nota erro">Nenhuma venda foi lida do sistema. Confira o passo 2.</div>'; return; }
    var maqFalta = estado.maquininhas.filter(function (m) { return m.falta.length; });
    if (maqFalta.length) { alvo.innerHTML = '<div class="nota erro">Termine de escolher as colunas obrigatórias do arquivo da maquininha: ' + esc(maqFalta.map(function (m) { return m.arquivo; }).join(', ')) + ' (passo 3).</div>'; return; }

    var c = cli(), V = s.leitura.vendas, T = transacoes();
    var meses = M.mesesDisponiveis(V, T);
    if (!estado.mes || meses.indexOf(estado.mes) < 0) estado.mes = M.mesPadrao(V, T);
    var modo = modoCmv();
    var r = M.calcular({ vendas: V, transacoes: T, mes: estado.mes, aliquota: c.aliquota || 0, tolerancia: c.tolerancia == null ? 1 : c.tolerancia,
      cmv: { modo: modo, valor: c.cmvValor, pct: c.cmvPct } });
    ultimo = r;
    var temMaq = estado.maquininhas.length > 0;
    var tol = r.conferencia.tolerancia;
    var h = '';

    // topo: mês e botões
    h += '<div class="topo-resultado"><label class="campo"><span>Mês</span><select id="mes-sel">' + meses.map(function (m) {
      return '<option value="' + m + '"' + (m === estado.mes ? ' selected' : '') + '>' + esc(C.mesLongo(m)) + '</option>';
    }).join('') + '</select></label><div class="botoes nao-imprimir"><button type="button" class="btn btn-forte" id="btn-excel">Baixar em Excel</button>' +
      '<button type="button" class="btn" id="btn-imprimir">Imprimir ou salvar em PDF</button></div></div>';
    h += '<h3>' + esc((c.nome || 'Cliente') + ', ' + C.mesLongo(estado.mes)) + '</h3>';
    if (!r.qtdVendas) h += '<div class="nota atencao">Não há vendas do sistema em ' + esc(C.mesLongo(estado.mes)) + '. Escolha outro mês.</div>';

    // cartões
    var pctDe = function (x) { return r.vendas && x != null ? C.pct(x / r.vendas) + ' das vendas' : ''; };
    var semCmv = r.cmv == null;
    h += '<div class="cartoes">';
    h += cartao('Vendas no sistema', C.brl(r.vendas), r.qtdVendas + ' vendas');
    h += cartao('Vendas no cartão (sistema)', C.brl(r.cartaoSistema), pctDe(r.cartaoSistema));
    h += cartao('Vendas na maquininha (bruto)', temMaq ? C.brl(r.maquininha) : 'sem arquivo', temMaq ? 'só cartões, ' + r.qtdTransacoes + ' transações no mês' : 'arraste no passo 3');
    if (temMaq) h += cartao('Diferença cartão', C.brl(r.diferencaCartao), 'maquininha menos sistema', Math.abs(r.diferencaCartao) > tol ? 'ruim' : 'bom');
    if (temMaq) h += cartao('Taxas da maquininha', r.brutoComTaxa ? C.brl(r.taxas) : 'sem taxa no arquivo', r.taxaEfetiva != null ? 'taxa efetiva de ' + C.pct(r.taxaEfetiva, 2) : '');
    h += cartao('Impostos sobre vendas', C.brl(r.impostos), C.num(r.aliquota, 2) + '% das vendas');
    h += cartao('CMV', semCmv ? 'falta o CMV' : C.brl(r.cmv), semCmv ? 'escolha no passo 4' : pctDe(r.cmv), semCmv ? 'meio' : '');
    h += cartao('Margem bruta', semCmv ? '?' : C.brl(r.margemBruta), semCmv ? 'vendas menos CMV' : C.pct(r.margemBrutaPct) + ' (vendas menos CMV)', semCmv ? '' : r.margemBruta >= 0 ? 'bom' : 'ruim');
    h += cartao('Margem de contribuição', semCmv ? '?' : C.brl(r.margemContrib), semCmv ? 'o que sobra' : C.pct(r.margemContribPct) + ' das vendas sobram', semCmv ? '' : r.margemContrib >= 0 ? 'bom' : 'ruim');
    h += '</div>';

    // avisos
    var canc = s.leitura.canceladas.filter(function (x) { return C.mesDe(x.data) === estado.mes; });
    var ap = [];
    estado.maquininhas.forEach(function (m) { if (m.leitura) ap = ap.concat(m.leitura.aParte.filter(function (x) { return x.mes === estado.mes; })); });
    if (canc.length || ap.length) {
      h += '<div class="nota info">Ficaram de fora da conta: ' + [
        canc.length ? canc.length + ' venda(s) cancelada(s) no sistema (' + C.brl(C.soma(canc, function (x) { return x.valor; })) + ')' : '',
        ap.length ? ap.length + ' transação(ões) cancelada(s), estornada(s) ou negada(s) na maquininha (' + C.brl(C.soma(ap, function (x) { return x.bruto; })) + ')' : ''
      ].filter(Boolean).map(esc).join(' e ') + '.</div>';
    }
    if (r.cmvInfo.modo === 'coluna' && r.cmvInfo.repetidas) h += '<div class="nota info">' + r.cmvInfo.repetidas + ' venda(s) paga(s) com mais de uma forma vieram em várias linhas com o mesmo custo: contei o custo uma vez só.</div>';
    if (r.cmvInfo.modo === 'coluna' && r.cmvInfo.semCusto) h += '<div class="nota atencao">' + r.cmvInfo.semCusto + ' venda(s) sem custo preenchido no relatório: o CMV pode estar menor do que o real.</div>';
    if (temMaq && r.semTaxa && r.brutoComTaxa) h += '<div class="nota atencao">' + r.semTaxa + ' transação(ões) sem taxa nem valor líquido. A taxa efetiva considera só as que têm.</div>';
    if (!temMaq) h += '<div class="nota atencao">Sem o arquivo da maquininha, não sei as taxas nem consigo conferir o cartão. Arraste no passo 3.</div>';

    // do que vendeu até o que sobrou + formas de pagamento
    h += '<div class="duas secao-res"><div><h3>Do que vendeu até o que sobrou</h3>';
    if (semCmv) h += '<p class="ajuda">Falta o CMV (passo 4) para mostrar o que sobrou.</p>';
    else h += UI.barrasHorizontais(M.cascata(r).map(function (i) {
      return { nome: i.nome, valor: i.valor, cor: i.cor, texto: C.brl(i.valor) + (r.vendas ? ' (' + C.pct(Math.abs(i.valor) / r.vendas) + ')' : '') };
    }));
    h += '</div><div><h3>Vendas por forma de pagamento (sistema)</h3><div class="tabela-rolagem"><table><thead><tr><th>Forma</th><th class="n">Vendas</th><th class="n">Valor</th><th class="n">%</th></tr></thead><tbody>';
    r.formas.forEach(function (f) { h += '<tr><td>' + esc(f.nome) + '</td><td class="n">' + f.qtd + '</td><td class="n">' + esc(C.brl(f.valor)) + '</td><td class="n">' + esc(C.pct(f.pct)) + '</td></tr>'; });
    h += '<tr class="total"><td>Total</td><td class="n">' + r.qtdVendas + '</td><td class="n">' + esc(C.brl(r.vendas)) + '</td><td class="n">100%</td></tr></tbody></table></div></div></div>';

    // conferência dia a dia
    if (temMaq) h += conferenciaHTML(r, tol);
    // taxas
    if (temMaq) h += taxasHTML(r);
    alvo.innerHTML = h;

    $('mes-sel').addEventListener('change', function () { estado.mes = this.value; renderResultado(); });
    $('btn-excel').addEventListener('click', baixarExcel);
    $('btn-imprimir').addEventListener('click', function () { window.print(); });
  }

  function conferenciaHTML(r, tol) {
    var cf = r.conferencia, rs = cf.resumo;
    var separa = cf.dias.some(function (d) { return d.separa; });
    var h = '<div class="secao-res"><h3>Conferência dia a dia: cartão no sistema x maquininha</h3>';
    if (!cf.dias.length) return h + '<p class="ajuda">Não há vendas no cartão neste mês, nem no sistema nem na maquininha.</p></div>';
    if (rs.diasComDiferenca) {
      h += '<div class="nota erro"><b>' + rs.diasComDiferenca + ' dia(s) com diferença maior que ' + esc(C.brl(tol)) + '.</b> ' +
        (rs.somaMaqMaior ? 'Maquininha maior em ' + esc(C.brl(rs.somaMaqMaior)) + '. ' : '') +
        (rs.somaSisMaior ? 'Sistema maior em ' + esc(C.brl(rs.somaSisMaior)) + '. ' : '') +
        'Total das diferenças (maquininha menos sistema): ' + esc(C.brl(rs.somaDiferencas)) + '.</div>';
    } else h += '<div class="nota ok">Todos os dias bateram no total do cartão (tolerância de ' + esc(C.brl(tol)) + ' por dia).</div>';
    if (rs.diasFormaTrocada) h += '<div class="nota atencao">' + rs.diasFormaTrocada + ' dia(s) em que o total bate, mas débito e crédito não: alguma venda foi lançada com a forma errada no sistema.</div>';
    h += '<div class="nota info">Pix, só para informação (pix nem sempre passa pela maquininha): no sistema ' + esc(C.brl(r.pixSistema)) + ', na maquininha ' + esc(C.brl(r.pixMaquininha)) + '.</div>';

    function tabela(dias) {
      var t = '<div class="tabela-rolagem" style="margin-top:10px"><table><thead><tr><th>Dia</th><th class="n">Cartão no sistema</th><th class="n">Maquininha</th><th class="n">Diferença</th>';
      if (separa) t += '<th class="n">Débito sistema</th><th class="n">Débito maquininha</th><th class="n">Crédito sistema</th><th class="n">Crédito maquininha</th>';
      t += '<th class="quebra">Situação</th><th class="quebra">O que sobrou sem par</th></tr></thead><tbody>';
      dias.forEach(function (d) {
        var dif = d.diferenca;
        t += '<tr><td>' + esc(C.dataBR(d.data)) + '</td><td class="n">' + esc(C.brl(d.sis.total)) + '</td><td class="n">' + esc(C.brl(d.maq.total)) + '</td>' +
          '<td class="n' + (Math.abs(dif) > tol ? ' neg' : '') + '">' + esc(C.brl(dif)) + '</td>';
        if (separa) {
          if (d.separa) t += '<td class="n">' + esc(C.brl(d.sis.deb)) + '</td><td class="n">' + esc(C.brl(d.maq.deb)) + '</td><td class="n">' + esc(C.brl(d.sis.cred)) + '</td><td class="n">' + esc(C.brl(d.maq.cred)) + '</td>';
          else t += '<td class="n" colspan="4">tem cartão sem detalhe</td>';
        }
        t += '<td class="quebra"><span class="selo ' + d.tipoSelo + '">' + esc(d.selo) + '</span></td><td class="quebra">' + esc(M.detalheDia(d)) + '</td></tr>';
      });
      return t + '</tbody></table></div>';
    }
    var prob = cf.dias.filter(function (d) { return d.situacao !== 'ok'; });
    var oks = cf.dias.filter(function (d) { return d.situacao === 'ok'; });
    if (prob.length) h += tabela(prob);
    if (oks.length) h += '<details class="lidas dias-ok"' + (prob.length ? '' : ' open') + '><summary>Ver os ' + oks.length + ' dia(s) que bateram</summary>' + tabela(oks) + '</details>';
    return h + '</div>';
  }

  function taxasHTML(r) {
    var tp = r.taxasPor;
    var h = '<div class="secao-res"><h3>Taxas por modalidade e bandeira</h3>';
    if (!r.brutoComTaxa) return h + '<p class="ajuda">Os arquivos da maquininha não têm valor líquido nem taxa, então não sei quanto foi cobrado.</p></div>';
    var cara = tp.porModalidade.filter(function (o) { return o.classe === tp.maisCara; })[0];
    if (cara) h += '<div class="nota atencao">A modalidade mais cara foi <b>' + esc(cara.nome) + '</b>, com taxa efetiva de <b>' + esc(C.pct(cara.efetiva, 2)) + '</b> (' + esc(C.brl(cara.taxa)) + ' sobre ' + esc(C.brl(cara.bruto)) + ').</div>';
    h += '<div class="tabela-rolagem" style="margin-top:10px"><table><thead><tr><th>Modalidade</th><th>Bandeira</th><th class="n">Transações</th><th class="n">Bruto</th><th class="n">Taxa</th><th class="n">Taxa efetiva</th></tr></thead><tbody>';
    tp.porModalidade.forEach(function (o) {
      var maisCara = o.classe === tp.maisCara;
      h += '<tr class="sub' + (maisCara ? ' mais-cara' : '') + '"><td>' + esc(o.nome) + (maisCara ? ' <span class="selo ruim">mais cara</span>' : '') + '</td><td>todas</td><td class="n">' + o.qtd + '</td><td class="n">' + esc(C.brl(o.bruto)) + '</td><td class="n">' + (o.comTaxa ? esc(C.brl(o.taxa)) : '') + '</td><td class="n">' + (o.efetiva != null ? esc(C.pct(o.efetiva, 2)) : '') + '</td></tr>';
      tp.porModalidadeBandeira.filter(function (b) { return b.classe === o.classe; }).forEach(function (b) {
        h += '<tr class="recuo"><td>' + esc(b.nome) + '</td><td>' + esc(b.bandeira) + '</td><td class="n">' + b.qtd + '</td><td class="n">' + esc(C.brl(b.bruto)) + '</td><td class="n">' + (b.comTaxa ? esc(C.brl(b.taxa)) : '') + '</td><td class="n">' + (b.efetiva != null ? esc(C.pct(b.efetiva, 2)) : '') + '</td></tr>';
      });
    });
    h += '<tr class="total"><td>Total</td><td></td><td class="n">' + r.qtdTransacoes + '</td><td class="n">' + esc(C.brl(C.soma(tp.porModalidade, function (o) { return o.bruto; }))) + '</td><td class="n">' + esc(C.brl(r.taxas)) + '</td><td class="n">' + (r.taxaEfetiva != null ? esc(C.pct(r.taxaEfetiva, 2)) : '') + '</td></tr>';
    return h + '</tbody></table></div><p class="ajuda" style="margin-top:6px">Taxa efetiva: quanto a maquininha ficou, dividido pelo valor bruto das vendas. Inclui o pix, quando passa pela maquininha.</p></div>';
  }

  function baixarExcel() {
    if (!ultimo) return;
    var nome = cli().nome || 'cliente';
    UI.baixarExcel('vendas-e-margem-' + UI.nomeArquivo(nome) + '-' + ultimo.mes + '.xlsx', M.abasExcel(ultimo, nome));
  }

  // ---------- tudo junto ----------
  function marcarPassos() {
    var s = estado.sistema;
    $('passo1').classList.toggle('feito', !!cli().nome);
    $('passo2').classList.toggle('feito', !!(s && !s.falta.length && s.leitura && s.leitura.vendas.length));
    $('passo3').classList.toggle('feito', estado.maquininhas.length > 0 && estado.maquininhas.every(function (m) { return !m.falta.length; }));
    var modo = modoCmv();
    var cmvOk = modo === 'coluna' ? temCusto() : modo === 'valor' ? numero(cli().cmvValor) != null : modo === 'pct' ? numero(cli().cmvPct) != null : false;
    $('passo4').classList.toggle('feito', cmvOk);
  }
  function tudo() {
    renderCmv();
    renderResultado();
    marcarPassos();
  }

  function iniciar() {
    if (!guardaOk) $('aviso-navegador').hidden = false;
    cli();
    $('area-sistema').appendChild(UI.areaArquivo({ titulo: 'Arraste aqui o relatório de vendas do sistema', dica: 'ou clique para escolher. Excel (.xlsx, .xls) ou CSV.', aoReceber: receberSistema }));
    $('area-maq').appendChild(UI.areaArquivo({ titulo: 'Arraste aqui o relatório de vendas da maquininha', dica: 'Pode ser mais de um arquivo. Excel (.xlsx, .xls) ou CSV.', varios: true, aoReceber: receberMaq }));
    renderCliente();
    ligarCliente();
    ligarCmv();
    tudo();
  }
  iniciar();
})();

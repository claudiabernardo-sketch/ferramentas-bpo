/* Monitor de volume, a tela. Precisa de xlsx, comum.js, ui.js e volume-logica.js antes. */
(function () {
  'use strict';
  var C = window.Comum, U = window.UI, V = window.Volume;
  var el = U.el, esc = U.esc;
  var $ = function (id) { return document.getElementById(id); };

  var estado = V.normalizar(C.recuperar(V.CHAVE, null));
  var guarda = U.navegadorGuarda();
  var selecionado = null; // id do cliente aberto no detalhe
  var pendentes = [];     // arquivos lidos esperando para guardar

  function salvar() {
    if (!C.guardar(V.CHAVE, estado) && guarda) U.avisar('Não consegui salvar neste navegador. Salve um backup.', 'erro');
  }
  function cliente(id) { return estado.clientes.filter(function (c) { return c.id === id; })[0] || null; }

  // ---------- avisos do topo ----------
  function renderAvisos() {
    var alvo = $('avisos-topo');
    alvo.innerHTML = '';
    if (!guarda) {
      alvo.appendChild(el('div', { class: 'nota erro', html: '<b>Este navegador não está guardando os dados</b> (modo anônimo ou bloqueado). Nada fica salvo quando você fechar a página. Use <b>Salvar backup</b> antes de sair.' }));
    }
    if (estado.clientes.length) {
      var dias = V.diasDesde(estado.ultimoBackup);
      if (dias == null) alvo.appendChild(el('div', { class: 'nota info', texto: 'Dica: você ainda não salvou nenhum backup. Ele guarda tudo num arquivo, para não perder se o navegador for limpo.' }));
      else if (dias > 7) alvo.appendChild(el('div', { class: 'nota info', texto: 'Seu último backup foi há ' + dias + ' dias. Vale salvar um novo.' }));
    }
  }

  // ---------- passo 1: clientes ----------
  $('form-cliente').addEventListener('submit', function (e) {
    e.preventDefault();
    var nome = $('novo-nome').value.trim();
    if (!nome) { U.avisar('Escreva o nome do cliente.', 'erro'); return; }
    var hon = $('novo-honorario').value.trim();
    var honN = hon ? C.valor(hon) : null;
    if (hon && honN == null) { U.avisar('Não entendi o honorário. Escreva só o número, por exemplo 1.500,00.', 'erro'); return; }
    var c = V.novoCliente(nome, honN, $('novo-mes').value);
    estado.clientes.push(c);
    salvar();
    $('novo-nome').value = ''; $('novo-honorario').value = ''; $('novo-mes').value = '';
    renderTudo();
    $('cliente-arquivos').value = c.id;
    U.avisar('Cliente "' + c.nome + '" cadastrado. Agora traga os extratos no passo 2.');
  });

  function renderSelectClientes() {
    var sel = $('cliente-arquivos'), atual = sel.value;
    sel.innerHTML = '';
    var lista = estado.clientes.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
    lista.forEach(function (c) { sel.appendChild(el('option', { value: c.id, texto: c.nome })); });
    if (atual && cliente(atual)) sel.value = atual;
    else if (selecionado && cliente(selecionado)) sel.value = selecionado;
    $('sem-cliente').hidden = lista.length > 0;
    sel.disabled = !lista.length;
    renderBotaoGuardar();
  }

  // ---------- passo 2: arquivos ----------
  var area = U.areaArquivo({
    titulo: 'Arraste os extratos aqui',
    dica: 'ou clique para escolher. Excel (.xlsx, .xls), CSV ou OFX do banco. Pode ser mais de um.',
    varios: true,
    aoReceber: receberArquivos
  });
  var inputArq = area.querySelector('input');
  if (inputArq) inputArq.setAttribute('accept', '.xlsx,.xls,.csv,.txt,.ofx,.qfx');
  $('area-arquivos').appendChild(area);

  function lerTexto(arquivo) {
    return new Promise(function (ok, falha) {
      var r = new FileReader();
      r.onload = function () { try { ok(C.decodificar(new Uint8Array(r.result))); } catch (e) { falha(e); } };
      r.onerror = function () { falha(new Error('Não consegui ler o arquivo.')); };
      r.readAsArrayBuffer(arquivo);
    });
  }
  function ehOFX(nome) { return /\.(ofx|qfx)$/i.test(nome); }

  function receberArquivos(lista) {
    if (!estado.clientes.length) { U.avisar('Cadastre um cliente no passo 1 primeiro.', 'erro'); return; }
    Promise.all(lista.map(function (arq) {
      var item = { chave: C.id(), nome: arq.name };
      if (ehOFX(arq.name)) {
        return lerTexto(arq).then(function (texto) {
          if (!V.pareceOFX(texto)) throw new Error('"' + arq.name + '" não parece um arquivo OFX de banco.');
          item.tipo = 'ofx';
          item.ofx = V.lerOFX(texto);
          if (!item.ofx.contadas) item.erro = 'Não achei lançamentos dentro deste OFX.';
          return item;
        }).catch(function (e) { item.erro = e.message; return item; });
      }
      return U.lerArquivo(arq).then(function (abas) {
        if (!abas.length) throw new Error('"' + arq.name + '" está vazio.');
        item.tipo = 'planilha';
        item.abas = abas;
        item.abaIdx = V.melhorAba(abas);
        item.prep = V.prepararAba(abas[item.abaIdx].linhas);
        return item;
      }).catch(function (e) {
        // um CSV ou TXT pode ser, na verdade, um OFX
        return lerTexto(arq).then(function (texto) {
          if (V.pareceOFX(texto)) { item.tipo = 'ofx'; item.ofx = V.lerOFX(texto); return item; }
          item.erro = e.message; return item;
        }).catch(function () { item.erro = e.message; return item; });
      });
    })).then(function (itens) {
      itens.forEach(function (it) {
        pendentes = pendentes.filter(function (p) { return p.nome !== it.nome; });
        pendentes.push(it);
      });
      renderPendentes();
    });
  }

  function textoMeses(porMes) {
    var meses = Object.keys(porMes).sort();
    if (!meses.length) return el('p', { class: 'vol-dica', texto: 'Nenhum lançamento com data encontrado.' });
    return el('div', { class: 'vol-meses' }, meses.map(function (m) {
      return el('span', {}, [C.mesCurto(m) + ': ', el('b', { texto: C.num(porMes[m]) })]);
    }));
  }
  function blocoIgnoradas(r) {
    var ig = r.ignoradas, tot = ig.semData + ig.saldo + ig.total + ig.zero;
    var resumo = 'Li ' + C.num(r.lidas) + ' linhas: ' + C.num(r.contadas) + ' lançamentos contados e ' + C.num(tot) + ' ignoradas.';
    if (!tot) return el('p', { class: 'vol-dica', texto: resumo });
    var itens = [];
    function linha(qtd, motivo, exemplos) {
      if (!qtd) return;
      var li = el('li', {}, [C.num(qtd) + ' ' + motivo]);
      if (exemplos && exemplos.length) li.appendChild(el('ul', {}, exemplos.map(function (x) { return el('li', { texto: x }); })));
      itens.push(li);
    }
    linha(ig.saldo, 'linhas de saldo (saldo anterior, saldo do dia, saldo final): saldo não é lançamento', r.exemplos.saldo);
    linha(ig.total, 'linhas de total', r.exemplos.total);
    linha(ig.semData, 'linhas sem data que dê para entender', r.exemplos.semData);
    linha(ig.zero, 'linhas com valor zero ou sem valor', r.exemplos.zero);
    return el('details', { class: 'vol-ignoradas' }, [el('summary', { texto: resumo + ' Ver por quê' }), el('ul', {}, itens)]);
  }

  function itemPronto(it) {
    if (it.erro) return false;
    if (it.tipo === 'ofx') return it.ofx.contadas > 0;
    return it.prep && it.prep.escolha.data >= 0 && it.prep.contagem.contadas > 0;
  }

  function renderPendentes() {
    var alvo = $('pendentes');
    alvo.innerHTML = '';
    pendentes.forEach(function (it) { alvo.appendChild(blocoPendente(it)); });
    renderBotaoGuardar();
  }
  function blocoPendente(it) {
    var caixa = el('div', { class: 'vol-arquivo' + (it.erro ? ' com-erro' : '') });
    var tirar = el('button', { type: 'button', class: 'btn', texto: 'Tirar da lista', onclick: function () {
      pendentes = pendentes.filter(function (p) { return p !== it; });
      renderPendentes();
    } });
    caixa.appendChild(el('div', { class: 'vol-arquivo-topo' }, [el('b', { texto: it.nome }), tirar]));
    if (it.erro) { caixa.appendChild(el('div', { class: 'nota erro', texto: it.erro })); return caixa; }

    if (it.tipo === 'ofx') {
      var n = it.ofx.contas.length;
      caixa.appendChild(el('p', { class: 'vol-dica', texto: 'Arquivo OFX do banco com ' + n + (n === 1 ? ' conta.' : ' contas (cada conta conta como uma conta bancária).') }));
      it.ofx.contas.forEach(function (c) {
        if (n > 1) caixa.appendChild(el('p', { class: 'vol-dica', texto: 'Conta ' + c.conta + ':' }));
        caixa.appendChild(textoMeses(c.porMes));
      });
      caixa.appendChild(blocoIgnoradas(it.ofx));
      return caixa;
    }

    // planilha
    var campos = el('div', { class: 'linha-campos' });
    if (it.abas.length > 1) {
      var selAba = el('select', { 'aria-label': 'Aba da planilha' }, it.abas.map(function (a, i) { return el('option', { value: String(i), texto: a.nome }); }));
      selAba.value = String(it.abaIdx);
      selAba.addEventListener('change', function () {
        it.abaIdx = Number(selAba.value);
        it.prep = V.prepararAba(it.abas[it.abaIdx].linhas);
        renderPendentes();
      });
      campos.appendChild(el('label', { class: 'campo' }, [el('span', { texto: 'Aba usada' }), selAba]));
    }
    var linhas = it.abas[it.abaIdx].linhas;
    var inCab = el('input', { type: 'number', min: '1', max: String(linhas.length), value: String(it.prep.inicio + 1), inputmode: 'numeric' });
    inCab.addEventListener('change', function () {
      var n = Math.max(1, Math.min(linhas.length, Math.round(Number(inCab.value) || 1))) - 1;
      var cab = (linhas[n] || []).map(function (v) { return String(v == null ? '' : v); });
      var escolha = C.detectarColunas(cab, V.CAMPOS);
      it.prep = { inicio: n, cabecalho: cab, escolha: escolha, contagem: V.contarLinhas(linhas, n, escolha) };
      renderPendentes();
    });
    campos.appendChild(el('label', { class: 'campo' }, [el('span', { texto: 'Linha dos títulos das colunas' }), inCab]));
    caixa.appendChild(campos);

    var mapa = el('div');
    var resultado = el('div');
    caixa.appendChild(el('p', { class: 'vol-dica', texto: 'Confira as colunas que eu achei. A Data é obrigatória.' }));
    caixa.appendChild(mapa);
    caixa.appendChild(resultado);
    function atualizar() {
      it.prep.contagem = V.contarLinhas(linhas, it.prep.inicio, it.prep.escolha);
      resultado.innerHTML = '';
      if (it.prep.escolha.data < 0) {
        resultado.appendChild(el('div', { class: 'nota erro', texto: 'Escolha qual coluna tem a data de cada lançamento. Sem ela não dá para contar por mês.' }));
      } else {
        resultado.appendChild(textoMeses(it.prep.contagem.porMes));
        resultado.appendChild(blocoIgnoradas(it.prep.contagem));
        if (!it.prep.contagem.contadas) resultado.appendChild(el('div', { class: 'nota atencao', texto: 'Nenhuma linha foi contada. Confira se a coluna Data e a linha dos títulos estão certas.' }));
      }
      renderBotaoGuardar();
    }
    var exemplo = linhas.slice(it.prep.inicio + 1, it.prep.inicio + 6);
    U.mapeador(mapa, it.prep.cabecalho, V.CAMPOS, it.prep.escolha, exemplo, function () { atualizar(); });
    atualizar();
    return caixa;
  }

  function renderBotaoGuardar() {
    var bloco = $('guardar-bloco');
    bloco.hidden = !pendentes.length;
    if (!pendentes.length) return;
    var ruins = pendentes.filter(function (p) { return !itemPronto(p); });
    var semCli = !cliente($('cliente-arquivos').value);
    $('btn-guardar').disabled = !!ruins.length || semCli;
    var c = cliente($('cliente-arquivos').value);
    $('btn-guardar').textContent = c ? 'Guardar a contagem em "' + c.nome + '"' : 'Guardar a contagem no cliente';
    $('guardar-motivo').textContent = semCli ? 'Escolha o cliente.' : ruins.length ? 'Falta acertar ' + (ruins.length === 1 ? '1 arquivo' : ruins.length + ' arquivos') + ' (ou tire da lista).' : '';
  }
  $('cliente-arquivos').addEventListener('change', renderBotaoGuardar);
  $('btn-limpar').addEventListener('click', function () { pendentes = []; renderPendentes(); });
  $('btn-guardar').addEventListener('click', function () {
    var c = cliente($('cliente-arquivos').value);
    if (!c) return;
    var trocados = 0, total = 0, meses = {};
    var jaTem = {};
    Object.keys(c.meses).forEach(function (m) { Object.keys(c.meses[m].fontes || {}).forEach(function (f) { jaTem[f] = true; }); });
    pendentes.filter(itemPronto).forEach(function (it) {
      var fontes = it.tipo === 'ofx' ? V.fontesDoOFX(it.nome, it.ofx) : [{ nome: it.nome, porMes: it.prep.contagem.porMes }];
      fontes.forEach(function (f) {
        if (jaTem[f.nome]) trocados++;
        V.registrarFonte(c, f.nome, f.porMes);
        Object.keys(f.porMes).forEach(function (m) { meses[m] = true; total += f.porMes[m]; });
      });
    });
    pendentes = [];
    salvar();
    selecionado = c.id;
    renderPendentes();
    renderTudo();
    U.avisar(C.num(total) + ' lançamentos guardados em "' + c.nome + '" (' + Object.keys(meses).length + ' meses)' + (trocados ? '. ' + trocados + ' arquivo(s) já existiam e a contagem foi trocada.' : '.'), 'ok');
    var d = $('detalhe'); if (d.scrollIntoView) d.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // ---------- premissas ----------
  var CAMPOS_P = { 'p-lancamento': 'lancamento', 'p-nota': 'nota', 'p-funcionario': 'funcionario', 'p-conta': 'conta' };
  function renderPremissas() {
    Object.keys(CAMPOS_P).forEach(function (id) { $(id).value = String(estado.premissas[CAMPOS_P[id]]); });
    $('p-limite').value = String(Math.round(estado.limite * 1000) / 10);
  }
  Object.keys(CAMPOS_P).forEach(function (id) {
    $(id).addEventListener('change', function () {
      var v = V.numOuNulo($(id).value);
      if (v == null || v < 0) { U.avisar('Use um número de minutos (zero ou mais).', 'erro'); renderPremissas(); return; }
      estado.premissas[CAMPOS_P[id]] = v;
      salvar(); renderPainel(); renderDetalhe();
    });
  });
  $('p-limite').addEventListener('change', function () {
    var v = V.numOuNulo($('p-limite').value);
    if (v == null || v <= 0) { U.avisar('O limite precisa ser maior que zero.', 'erro'); renderPremissas(); return; }
    estado.limite = v / 100;
    salvar(); renderPainel(); renderDetalhe();
  });

  // ---------- painel ----------
  function seta(v) {
    if (v == null) return '';
    var cls = v > 0.0001 ? 'vol-sobe' : v < -0.0001 ? 'vol-desce' : '';
    return '<span class="' + cls + '">' + (v > 0 ? '+' : '') + esc(C.pct(v)) + '</span>';
  }
  function celulaInd(ind) {
    if (!ind) return '<td class="n"></td>';
    var b = ind.base == null ? 'não inf.' : C.num(ind.base), a = ind.agora == null ? 'não inf.' : C.num(ind.agora);
    var s = esc(b) + ' &rarr; <b>' + esc(a) + '</b>';
    if (ind.variacao != null) s += ' ' + seta(ind.variacao);
    else if (ind.novo) s += ' <span class="vol-sobe">novo</span>';
    if (ind.varAnterior != null) s += '<small>mês anterior: ' + seta(ind.varAnterior) + '</small>';
    return '<td class="n">' + s + '</td>';
  }
  function selo(r) {
    if (r.status === 'revisar') return '<span class="selo ruim">Revisar preço</span>';
    if (r.status === 'ok') return '<span class="selo bom">ok</span>';
    if (r.status === 'precisa') return '<span class="selo meio">Precisa de mais um mês para comparar</span>';
    return '<span class="selo meio">Sem dados</span>';
  }
  function renderPainel() {
    var alvo = $('painel');
    if (!estado.clientes.length) {
      alvo.innerHTML = '<div class="nota info">Nenhum cliente ainda. Cadastre no passo 1, ou use <b>Restaurar backup</b> com o arquivo de exemplo da pasta exemplos/volume para ver como fica.</div>';
      return;
    }
    var lista = V.resumos(estado);
    var nRev = lista.filter(function (r) { return r.status === 'revisar'; }).length;
    var topo = '<div class="cartoes"><div class="cartao' + (nRev ? ' ruim' : ' bom') + '"><small>Revisar preço</small><b>' + nRev + '</b><span>de ' + lista.length + ' clientes</span></div>' +
      '<div class="cartao"><small>Limite de alerta</small><b>' + esc(C.pct(estado.limite)) + '</b><span>de crescimento contra o mês base</span></div></div>';
    var h = '<div class="tabela-rolagem" style="margin-top:12px"><table class="vol-painel"><thead><tr>' +
      '<th>Cliente</th><th>Situação</th><th class="n">Honorário atual</th><th>Mês base x último</th><th class="n">Lançamentos</th><th class="n">Contas</th><th class="n">Funcionários</th><th class="n">Notas</th>' +
      '<th class="n">Horas de referência</th><th class="n">Honorário por hora</th><th class="n">Honorário proporcional ao volume</th></tr></thead><tbody>';
    lista.forEach(function (r) {
      var i = r.indicadores;
      h += '<tr class="' + (r.status === 'revisar' ? 'alerta' : '') + '">';
      h += '<td><button type="button" class="vol-nome" data-abrir="' + esc(r.id) + '">' + esc(r.nome) + '</button></td>';
      h += '<td>' + selo(r) + '</td>';
      h += '<td class="n">' + (r.honorario ? esc(C.brl(r.honorario)) : '<small>informe</small>') + '</td>';
      if (r.status === 'vazio') { h += '<td colspan="8"><small>Traga um extrato ou digite os números do mês.</small></td></tr>'; return; }
      h += '<td>' + esc(C.mesCurto(r.mesBase)) + ' x ' + esc(C.mesCurto(r.ultimo)) + (r.anterior ? '<small>anterior: ' + esc(C.mesCurto(r.anterior)) + '</small>' : '') + '</td>';
      if (r.status === 'precisa') {
        h += '<td class="n">' + esc(C.num(i.lancamentos.agora)) + '</td><td class="n">' + esc(C.num(i.contas.agora)) + '</td><td class="n">' + esc(i.funcionarios.agora == null ? '' : C.num(i.funcionarios.agora)) + '</td><td class="n">' + esc(i.notas.agora == null ? '' : C.num(i.notas.agora)) + '</td>';
        h += '<td class="n">' + esc(C.num(r.horasAgora, 1)) + ' h</td><td class="n">' + esc(r.hhAgora == null ? '' : C.brl(r.hhAgora)) + '</td><td class="n"><small>Precisa de mais um mês para comparar</small></td></tr>';
        return;
      }
      h += celulaInd(i.lancamentos) + celulaInd(i.contas) + celulaInd(i.funcionarios) + celulaInd(i.notas);
      h += '<td class="n">' + esc(C.num(r.horasBase, 1)) + ' &rarr; <b>' + esc(C.num(r.horasAgora, 1)) + ' h</b> ' + seta(r.varHoras) + '</td>';
      h += '<td class="n">' + (r.hhBase == null ? '' : esc(C.brl(r.hhBase)) + ' &rarr; <b>' + esc(r.hhAgora == null ? '' : C.brl(r.hhAgora)) + '</b>') + '</td>';
      h += '<td class="n">' + (r.proporcional == null ? '' : '<b>' + esc(C.brl(r.proporcional)) + '</b>' + (r.diferenca ? '<small>' + (r.diferenca > 0 ? '+' : '') + esc(C.brl(r.diferenca)) + ' por mês</small>' : '')) + '</td>';
      h += '</tr>';
    });
    h += '</tbody></table></div>';
    h += '<p class="vol-dica" style="margin-top:8px">O honorário proporcional mantém o mesmo valor por hora de quando o preço foi combinado. Clique no nome do cliente para ver o detalhe, corrigir números e gerar o texto para ele.</p>';
    alvo.innerHTML = topo + h;
    Array.prototype.forEach.call(alvo.querySelectorAll('[data-abrir]'), function (b) {
      b.addEventListener('click', function () { abrir(b.getAttribute('data-abrir')); });
    });
  }
  function abrir(id) {
    selecionado = id;
    $('cliente-arquivos').value = id;
    renderBotaoGuardar();
    renderDetalhe();
    var d = $('detalhe'); if (d.scrollIntoView) d.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- detalhe do cliente ----------
  function renderDetalhe() {
    var alvo = $('detalhe');
    var c = cliente(selecionado);
    alvo.innerHTML = '';
    alvo.hidden = !c;
    if (!c) return;
    var r = V.resumo(c, estado.premissas, estado.limite);
    var meses = V.mesesOrdenados(c);

    alvo.appendChild(el('div', { class: 'vol-detalhe-topo' }, [
      el('h2', { texto: c.nome }),
      el('span', { html: selo(r) }),
      el('button', { type: 'button', class: 'btn nao-imprimir', texto: 'Fechar', onclick: function () { selecionado = null; renderDetalhe(); } })
    ]));

    // dados do cliente
    var inNome = el('input', { value: c.nome, maxlength: '80' });
    var inHon = el('input', { value: c.honorario == null ? '' : C.num(c.honorario, 2), inputmode: 'decimal', placeholder: 'Ex.: 1.500,00' });
    var selBase = el('select', {}, [el('option', { value: '', texto: 'Primeiro mês com dados' })].concat(
      meses.map(function (m) { return el('option', { value: m, texto: C.mesLongo(m) }); })));
    if (c.mesBase && meses.indexOf(c.mesBase) < 0) selBase.appendChild(el('option', { value: c.mesBase, texto: C.mesLongo(c.mesBase) + ' (sem dados)' }));
    selBase.value = c.mesBase || '';
    inNome.addEventListener('change', function () {
      var n = inNome.value.trim();
      if (!n) { inNome.value = c.nome; return; }
      c.nome = n; salvar(); renderTudo();
    });
    inHon.addEventListener('change', function () {
      var t = inHon.value.trim(), v = t ? C.valor(t) : null;
      if (t && v == null) { U.avisar('Não entendi o honorário. Escreva só o número, por exemplo 1.500,00.', 'erro'); inHon.value = c.honorario == null ? '' : C.num(c.honorario, 2); return; }
      c.honorario = v; salvar(); renderTudo();
    });
    selBase.addEventListener('change', function () { c.mesBase = selBase.value; salvar(); renderTudo(); });
    alvo.appendChild(el('div', { class: 'linha-campos vol-form nao-imprimir' }, [
      el('label', { class: 'campo' }, [el('span', { texto: 'Nome' }), inNome]),
      el('label', { class: 'campo' }, [el('span', { texto: 'Honorário por mês (R$)' }), inHon]),
      el('label', { class: 'campo' }, [el('span', { texto: 'Mês em que o preço foi combinado' }), selBase])
    ]));

    // cartões
    if (r.status === 'revisar' || r.status === 'ok') {
      var il = r.indicadores.lancamentos;
      alvo.appendChild(el('div', { class: 'cartoes vol-cartoes', html:
        '<div class="cartao"><small>Lançamentos</small><b>' + esc(C.num(il.base)) + ' &rarr; ' + esc(C.num(il.agora)) + '</b><span>' + esc(C.mesCurto(r.mesBase)) + ' x ' + esc(C.mesCurto(r.ultimo)) + (il.variacao != null ? ', ' + esc((il.variacao > 0 ? '+' : '') + C.pct(il.variacao)) : '') + '</span></div>' +
        '<div class="cartao"><small>Horas de referência</small><b>' + esc(C.num(r.horasBase, 1)) + ' &rarr; ' + esc(C.num(r.horasAgora, 1)) + '</b><span>por mês</span></div>' +
        '<div class="cartao"><small>Honorário por hora</small><b>' + esc(r.hhAgora == null ? '' : C.brl(r.hhAgora)) + '</b><span>' + (r.hhBase == null ? '' : 'era ' + esc(C.brl(r.hhBase))) + '</span></div>' +
        '<div class="cartao' + (r.status === 'revisar' ? ' ruim' : '') + '"><small>Proporcional ao volume</small><b>' + esc(r.proporcional == null ? '' : C.brl(r.proporcional)) + '</b><span>' + (c.honorario ? 'hoje ' + esc(C.brl(c.honorario)) : 'informe o honorário') + '</span></div>' }));
    }
    if (r.avisos.length) alvo.appendChild(el('div', { class: 'nota atencao' }, [el('ul', {}, r.avisos.map(function (a) { return el('li', { texto: a }); }))]));

    // gráfico
    if (meses.length) {
      var valores = meses.map(function (m) { return V.lancamentosDoMes(c.meses[m]); });
      var svg = U.graficoBarras({ categorias: meses.map(C.mesCurto), series: [{ nome: 'Lançamentos', cor: '#5E9BD6', valores: valores }] }, { titulo: 'Lançamentos por mês de ' + c.nome, altura: 220 });
      // o gráfico comum mostra R$ na dica; aqui são quantidades
      svg = svg.replace(/(<title>[^<]*?)R\$ ([\d.]+),00(<\/title>)/g, '$1$2 lançamentos$3');
      alvo.appendChild(el('div', { class: 'vol-grafico' }, [el('h3', { texto: 'Lançamentos por mês' }), el('div', { html: svg })]));
    }

    // tabela editável
    alvo.appendChild(el('h3', { texto: 'Números por mês', style: 'margin-top:16px' }));
    alvo.appendChild(el('p', { class: 'vol-dica', texto: 'Lançamentos e contas vêm dos arquivos. Pode digitar por cima (fica amarelo); apague o número para voltar à contagem dos arquivos. Funcionários e notas fiscais você digita.' }));
    var tbody = el('tbody');
    meses.forEach(function (mes) {
      var m = c.meses[mes], ind = V.indicadoresMes(m);
      function entrada(campo, valorAtual, manual, auto) {
        var inp = el('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', value: valorAtual == null ? '' : String(valorAtual), class: manual ? 'manual' : null,
          'aria-label': campo + ' em ' + C.mesLongo(mes), placeholder: auto != null ? String(auto) : '', title: manual ? 'Digitado à mão. Apague para voltar à contagem dos arquivos.' : '' });
        inp.addEventListener('change', function () {
          var t = inp.value.trim();
          if (t !== '' && (V.numOuNulo(t) == null || V.numOuNulo(t) < 0)) { U.avisar('Use um número inteiro, zero ou mais.', 'erro'); renderDetalhe(); return; }
          V.definirValor(c, mes, campo, t === '' ? null : t);
          salvar(); renderPainel(); renderDetalhe();
        });
        return el('td', { class: 'n' }, [inp]);
      }
      var somaArq = Object.keys(m.fontes || {}).reduce(function (s, f) { return s + m.fontes[f]; }, 0);
      var nArq = Object.keys(m.fontes || {}).length;
      var fontes = el('td', { class: 'fontes' }, Object.keys(m.fontes || {}).map(function (f) {
        return el('div', { class: 'vol-fonte' }, [el('span', { texto: f + ': ' + C.num(m.fontes[f]) }),
          el('button', { type: 'button', class: 'nao-imprimir', title: 'Tirar este arquivo deste mês', 'aria-label': 'Tirar ' + f + ' de ' + C.mesLongo(mes), texto: 'x', onclick: function () {
            if (!window.confirm('Tirar a contagem do arquivo "' + f + '" de ' + C.mesLongo(mes) + '?')) return;
            V.removerFonte(c, mes, f); salvar(); renderTudo();
          } })]);
      }));
      if (!nArq) fontes.appendChild(el('span', { texto: 'digitado à mão' }));
      tbody.appendChild(el('tr', {}, [
        el('td', { texto: C.mesLongo(mes) + (mes === r.mesBase ? ' (base)' : '') }),
        entrada('lancamentos', ind.lancamentos, m.lancManual != null, somaArq),
        entrada('contas', ind.contas, !!m.contasManual, nArq),
        entrada('funcionarios', ind.funcionarios, false, null),
        entrada('notas', ind.notas, false, null),
        el('td', { class: 'n', texto: C.num(V.horas(ind, estado.premissas), 1) + ' h' }),
        fontes,
        el('td', {}, [el('button', { type: 'button', class: 'vol-x nao-imprimir', title: 'Excluir este mês', 'aria-label': 'Excluir ' + C.mesLongo(mes), texto: 'Excluir', onclick: function () {
          if (!window.confirm('Excluir ' + C.mesLongo(mes) + ' de ' + c.nome + '? Os números desse mês saem do monitor.')) return;
          V.excluirMes(c, mes); salvar(); renderTudo();
        } })])
      ]));
    });
    if (!meses.length) tbody.appendChild(el('tr', {}, [el('td', { colspan: '8', class: 'vol-vazio', texto: 'Nenhum mês ainda. Traga um extrato no passo 2 ou adicione um mês abaixo.' })]));
    var tabela = el('table', { class: 'vol-tabela' }, [
      el('thead', { html: '<tr><th>Mês</th><th class="n">Lançamentos</th><th class="n">Contas bancárias</th><th class="n">Funcionários</th><th class="n">Notas fiscais</th><th class="n">Horas de referência</th><th>Arquivos</th><th></th></tr>' }),
      tbody
    ]);
    alvo.appendChild(el('div', { class: 'tabela-rolagem' }, [tabela]));

    var inMes = el('input', { type: 'month', 'aria-label': 'Mês para adicionar' });
    alvo.appendChild(el('div', { class: 'linha-campos vol-add-mes nao-imprimir' }, [
      el('label', { class: 'campo' }, [el('span', { texto: 'Adicionar um mês para digitar' }), inMes]),
      el('div', { class: 'campo vol-campo-botao' }, [el('button', { type: 'button', class: 'btn', texto: 'Adicionar mês', onclick: function () {
        if (!V.mesValido(inMes.value)) { U.avisar('Escolha o mês e o ano.', 'erro'); return; }
        if (c.meses[inMes.value]) { U.avisar('Esse mês já está na tabela.'); return; }
        V.adicionarMes(c, inMes.value); salvar(); renderTudo();
      } })])
    ]));

    // texto para o cliente
    var blocoTexto = el('div', { class: 'vol-texto-bloco' });
    var inContato = el('input', { placeholder: 'Ex.: Maria', maxlength: '60' });
    var saida = el('div');
    function gerar() {
      saida.innerHTML = '';
      var r2 = V.resumo(c, estado.premissas, estado.limite);
      var t = V.textoCliente(c, r2, { contato: inContato.value });
      if (!t) { saida.appendChild(el('div', { class: 'nota atencao', texto: 'Precisa de pelo menos dois meses (o mês base e um mês depois dele) para montar o texto.' })); return; }
      if (r2.status !== 'revisar') saida.appendChild(el('div', { class: 'nota info', texto: 'O volume deste cliente não passou do limite. O texto abaixo fala que está estável.' }));
      var area = el('textarea', { class: 'vol-texto', 'aria-label': 'Texto para o cliente' });
      area.value = t;
      var copiar = el('button', { type: 'button', class: 'btn btn-forte', texto: 'Copiar texto', onclick: function () {
        function manual() { area.focus(); area.select(); U.avisar('Texto selecionado. Aperte Ctrl+C (ou segure e copie, no celular).'); }
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(area.value).then(function () { U.avisar('Texto copiado. É só colar no WhatsApp ou no e-mail.', 'ok'); }, manual);
        } else manual();
      } });
      saida.appendChild(area);
      saida.appendChild(el('div', { class: 'botoes', style: 'margin-top:8px' }, [copiar]));
      saida.appendChild(el('p', { class: 'vol-dica', style: 'margin-top:6px', texto: 'É um rascunho: leia, ajuste do seu jeito e envie.' }));
    }
    blocoTexto.appendChild(el('h3', { texto: 'Texto para o cliente', style: 'margin-top:18px' }));
    blocoTexto.appendChild(el('div', { class: 'linha-campos vol-form' }, [
      el('label', { class: 'campo' }, [el('span', { texto: 'Nome de quem vai ler (opcional)' }), inContato]),
      el('div', { class: 'campo vol-campo-botao' }, [el('button', { type: 'button', class: 'btn btn-forte', texto: 'Texto para o cliente', onclick: gerar })])
    ]));
    blocoTexto.appendChild(saida);
    alvo.appendChild(blocoTexto);

    alvo.appendChild(el('div', { class: 'botoes nao-imprimir', style: 'margin-top:18px' }, [
      el('button', { type: 'button', class: 'btn btn-perigo', texto: 'Excluir cliente', onclick: function () {
        if (!window.confirm('Excluir "' + c.nome + '" e todo o histórico dele? Isso não tem volta (a não ser por um backup).')) return;
        estado.clientes = estado.clientes.filter(function (x) { return x.id !== c.id; });
        selecionado = null; salvar(); renderTudo();
        U.avisar('Cliente excluído.');
      } })
    ]));
  }

  // ---------- backup e Excel ----------
  function hoje() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1) + '-' + (d.getDate() < 10 ? '0' : '') + d.getDate(); }
  $('btn-backup').addEventListener('click', function () {
    estado.ultimoBackup = new Date().toISOString();
    salvar();
    U.baixar('backup-monitor-de-volume-' + hoje() + '.json', JSON.stringify(V.criarBackup(estado), null, 2), 'application/json');
    renderAvisos();
    U.avisar('Backup baixado. Guarde o arquivo num lugar seguro (Drive, OneDrive, e-mail).', 'ok');
  });
  $('btn-restaurar').addEventListener('click', function () {
    U.escolherArquivo('.json,application/json').then(function (arq) {
      if (!arq) return;
      return U.lerJSON(arq).then(function (obj) {
        var novo = V.lerBackup(obj);
        if (estado.clientes.length && !window.confirm('Restaurar o backup troca os dados de agora (' + estado.clientes.length + ' clientes) pelos do arquivo (' + novo.clientes.length + ' clientes). Continuar?')) return;
        estado = novo;
        selecionado = null; pendentes = [];
        salvar(); renderPremissas(); renderPendentes(); renderTudo();
        U.avisar('Backup restaurado: ' + novo.clientes.length + ' clientes.', 'ok');
      });
    }).catch(function (e) { U.avisar(e.message, 'erro'); });
  });
  $('btn-excel').addEventListener('click', function () {
    if (!estado.clientes.length) { U.avisar('Ainda não tem clientes para baixar.', 'erro'); return; }
    var painel = V.linhasPainel(estado);
    U.baixarExcel('monitor-de-volume-' + hoje() + '.xlsx', [
      { nome: 'Painel', linhas: painel, larguras: painel[0].map(function (t, i) { return i === 0 ? 28 : i === 1 ? 22 : 14; }),
        formatoMoeda: [2, 20, 21, 22], formatoPct: [7, 10, 13, 16, 19, 24] },
      { nome: 'Histórico por mês', linhas: V.linhasHistorico(estado), larguras: [28, 10, 13, 15, 13, 13, 18, 60, 22] }
    ]);
  });

  function renderTudo() {
    if (selecionado && !cliente(selecionado)) selecionado = null;
    renderAvisos();
    renderSelectClientes();
    renderPainel();
    renderDetalhe();
  }

  renderPremissas();
  renderTudo();
})();

/* Recorrentes para o Conta Azul, a tela. Precisa de xlsx, comum.js, ui.js, volume-logica.js e onboarding-logica.js antes. */
(function () {
  'use strict';
  var C = window.Comum, U = window.UI, V = window.Volume, O = window.Onboarding;
  var el = U.el;
  var $ = function (id) { return document.getElementById(id); };

  var estado = O.normalizar(C.recuperar(O.CHAVE, null));
  var guarda = U.navegadorGuarda();
  var arquivos = [];   // extratos lidos nesta sessão (não ficam guardados)
  var achado = null;   // resultado de acharRecorrentes
  var mod = null;      // modelo de importação carregado

  function salvar() {
    if (!C.guardar(O.CHAVE, estado) && guarda) U.avisar('Não consegui salvar neste navegador. Salve um backup.', 'erro');
  }
  function clienteAtual() {
    return estado.clientes.filter(function (c) { return c.id === estado.clienteAtual; })[0] || null;
  }
  function hoje() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1) + '-' + (d.getDate() < 10 ? '0' : '') + d.getDate(); }
  function plural(n, um, varios) { return C.num(n) + ' ' + (n === 1 ? um : varios); }

  // ---------- avisos do topo ----------
  function renderAvisos() {
    var alvo = $('avisos-topo');
    alvo.innerHTML = '';
    if (!guarda) alvo.appendChild(el('div', { class: 'nota erro', html: '<b>Este navegador não está guardando os dados</b> (modo anônimo ou bloqueado). As regras de cada cliente e o mapeamento do modelo somem quando fechar a página. Use <b>Salvar backup</b> antes de sair.' }));
    var temRegra = estado.clientes.some(function (c) { return Object.keys(c.regras).length; });
    if (temRegra) {
      var dias = O.diasDesde(estado.ultimoBackup);
      if (dias == null) alvo.appendChild(el('div', { class: 'nota info', texto: 'Dica: você ainda não salvou nenhum backup. Ele guarda as regras de cada cliente num arquivo, para não perder se o navegador for limpo.' }));
      else if (dias > 7) alvo.appendChild(el('div', { class: 'nota info', texto: 'Seu último backup foi há ' + dias + ' dias. Vale salvar um novo.' }));
    }
  }

  // ---------- passo 1: cliente ----------
  function renderListaClientes() {
    var dl = $('lista-clientes');
    dl.innerHTML = '';
    estado.clientes.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); }).forEach(function (c) {
      dl.appendChild(el('option', { value: c.nome }));
    });
    var c = clienteAtual();
    if (c && !$('cliente-nome').value) $('cliente-nome').value = c.nome;
  }
  $('cliente-nome').addEventListener('change', function () {
    var nome = $('cliente-nome').value.trim();
    if (!nome) return;
    var c = O.garantirCliente(estado, nome);
    $('cliente-nome').value = c.nome;
    salvar(); renderListaClientes(); recalcular();
    var n = Object.keys(c.regras).length;
    if (n) U.avisar('Cliente "' + c.nome + '": usei ' + plural(n, 'regra lembrada', 'regras lembradas') + '.');
  });
  function garantirClienteDoCampo() {
    var nome = $('cliente-nome').value.trim();
    if (!nome) return null;
    var c = O.garantirCliente(estado, nome);
    salvar(); renderListaClientes();
    return c;
  }

  // ---------- passo 1: extratos ----------
  var area = U.areaArquivo({
    titulo: 'Arraste os extratos aqui',
    dica: 'ou clique para escolher. Excel (.xlsx, .xls), CSV ou OFX do banco. Pode ser mais de um, de contas diferentes.',
    varios: true,
    aoReceber: receberArquivos
  });
  var inputArq = area.querySelector('input');
  if (inputArq) inputArq.setAttribute('accept', '.xlsx,.xls,.csv,.txt,.ofx,.qfx');
  $('area-extratos').appendChild(area);

  function lerTexto(arquivo) {
    return new Promise(function (ok, falha) {
      var r = new FileReader();
      r.onload = function () { try { ok(C.decodificar(new Uint8Array(r.result))); } catch (e) { falha(e); } };
      r.onerror = function () { falha(new Error('Não consegui ler o arquivo.')); };
      r.readAsArrayBuffer(arquivo);
    });
  }
  function semExtensao(nome) { return String(nome).replace(/\.[^.]+$/, ''); }

  function receberArquivos(lista) {
    if (!garantirClienteDoCampo()) { U.avisar('Escreva o apelido do cliente antes de trazer os extratos.', 'erro'); $('cliente-nome').focus(); return; }
    Promise.all(lista.map(function (arq) {
      var it = { chave: C.id(), nome: arq.name, conta: semExtensao(arq.name) };
      if (/\.(ofx|qfx)$/i.test(arq.name)) {
        return lerTexto(arq).then(function (texto) {
          if (!V.pareceOFX(texto)) throw new Error('"' + arq.name + '" não parece um arquivo OFX de banco.');
          it.tipo = 'ofx'; it.texto = texto; it.lido = O.lerOFX(texto, it.conta);
          if (!it.lido.movs.length) it.erro = 'Não achei lançamentos dentro deste OFX.';
          return it;
        }).catch(function (e) { it.erro = e.message; return it; });
      }
      return U.lerArquivo(arq).then(function (abas) {
        if (!abas.length) throw new Error('"' + arq.name + '" está vazio.');
        it.tipo = 'planilha'; it.abas = abas; it.abaIdx = O.melhorAba(abas);
        it.prep = O.prepararAba(abas[it.abaIdx].linhas);
        lerPlanilhaItem(it);
        return it;
      }).catch(function (e) {
        return lerTexto(arq).then(function (texto) {
          if (V.pareceOFX(texto)) { it.tipo = 'ofx'; it.texto = texto; it.lido = O.lerOFX(texto, it.conta); return it; }
          it.erro = e.message; return it;
        }).catch(function () { it.erro = e.message; return it; });
      });
    })).then(function (itens) {
      itens.forEach(function (it) {
        arquivos = arquivos.filter(function (p) { return p.nome !== it.nome; });
        arquivos.push(it);
      });
      renderArquivos(); recalcular();
    });
  }
  function lerPlanilhaItem(it) {
    it.lido = O.lerMovimentos(it.abas[it.abaIdx].linhas, it.prep.inicio, it.prep.escolha, it.conta);
  }
  function itemPronto(it) { return !it.erro && it.lido && it.lido.movs.length > 0 && (it.tipo === 'ofx' || !O.faltandoExtrato(it.prep.escolha).length); }

  function blocoIgnoradas(r) {
    var ig = r.ignoradas, tot = ig.saldo + ig.total + ig.semData + ig.semHistorico + ig.zero;
    var datas = r.movs.map(function (m) { return m.data; }).sort();
    var periodo = datas.length ? ' de ' + C.dataBR(datas[0]) + ' a ' + C.dataBR(datas[datas.length - 1]) : '';
    var resumo = 'Li ' + plural(r.lidas, 'linha', 'linhas') + ': ' + plural(r.movs.length, 'lançamento', 'lançamentos') + periodo + ' e ' + plural(tot, 'ignorada', 'ignoradas') + '.';
    if (!tot) return el('p', { class: 'onb-dica', texto: resumo });
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
    linha(ig.semHistorico, 'linhas sem histórico', r.exemplos.semHistorico);
    linha(ig.zero, 'linhas com valor zero ou sem valor', r.exemplos.zero);
    return el('details', { class: 'onb-det' }, [el('summary', { texto: resumo + ' Ver por quê' }), el('ul', {}, itens)]);
  }

  function renderArquivos() {
    var alvo = $('arquivos');
    alvo.innerHTML = '';
    arquivos.forEach(function (it) { alvo.appendChild(blocoArquivo(it)); });
    renderResumoExtratos();
  }
  function blocoArquivo(it) {
    var caixa = el('div', { class: 'onb-arquivo' + (it.erro ? ' com-erro' : '') });
    caixa.appendChild(el('div', { class: 'onb-arquivo-topo' }, [el('b', { texto: it.nome }), el('button', { type: 'button', class: 'btn', texto: 'Tirar da lista', onclick: function () {
      arquivos = arquivos.filter(function (p) { return p !== it; });
      renderArquivos(); recalcular();
    } })]));
    if (it.erro) { caixa.appendChild(el('div', { class: 'nota erro', texto: it.erro })); return caixa; }

    var campos = el('div', { class: 'linha-campos' });
    var inConta = el('input', { value: it.conta, maxlength: '60' });
    inConta.addEventListener('change', function () {
      it.conta = inConta.value.trim() || semExtensao(it.nome);
      if (it.tipo === 'ofx') it.lido = O.lerOFX(it.texto, it.conta); else lerPlanilhaItem(it);
      recalcular();
    });
    campos.appendChild(el('label', { class: 'campo' }, [el('span', { texto: 'Nome da conta' }), inConta]));

    if (it.tipo === 'ofx') {
      caixa.appendChild(campos);
      caixa.appendChild(el('p', { class: 'onb-dica', texto: 'Arquivo OFX do banco com ' + plural(it.lido.contas.length, 'conta', 'contas') + '.' }));
      caixa.appendChild(blocoIgnoradas(it.lido));
      return caixa;
    }
    if (it.abas.length > 1) {
      var selAba = el('select', { 'aria-label': 'Aba da planilha' }, it.abas.map(function (a, i) { return el('option', { value: String(i), texto: a.nome }); }));
      selAba.value = String(it.abaIdx);
      selAba.addEventListener('change', function () {
        it.abaIdx = Number(selAba.value);
        it.prep = O.prepararAba(it.abas[it.abaIdx].linhas);
        lerPlanilhaItem(it); renderArquivos(); recalcular();
      });
      campos.appendChild(el('label', { class: 'campo' }, [el('span', { texto: 'Aba usada' }), selAba]));
    }
    var linhas = it.abas[it.abaIdx].linhas;
    var inCab = el('input', { type: 'number', min: '1', max: String(linhas.length), value: String(it.prep.inicio + 1), inputmode: 'numeric' });
    inCab.addEventListener('change', function () {
      var n = Math.max(1, Math.min(linhas.length, Math.round(Number(inCab.value) || 1))) - 1;
      var cab = (linhas[n] || []).map(function (v) { return String(v == null ? '' : v); });
      it.prep = { inicio: n, cabecalho: cab, escolha: C.detectarColunas(cab, O.CAMPOS) };
      lerPlanilhaItem(it); renderArquivos(); recalcular();
    });
    campos.appendChild(el('label', { class: 'campo' }, [el('span', { texto: 'Linha dos títulos das colunas' }), inCab]));
    caixa.appendChild(campos);

    var mapa = el('div'), resultado = el('div');
    caixa.appendChild(el('p', { class: 'onb-dica', texto: 'Confira as colunas que eu achei. Data e Histórico são obrigatórias, e precisa do Valor (ou de Crédito e Débito).' }));
    caixa.appendChild(mapa);
    caixa.appendChild(resultado);
    function atualizar() {
      lerPlanilhaItem(it);
      resultado.innerHTML = '';
      var falta = O.faltandoExtrato(it.prep.escolha);
      if (falta.length) {
        resultado.appendChild(el('div', { class: 'nota erro', texto: 'Falta escolher: ' + falta.join(', ') + '. Sem isso não dá para achar os recorrentes.' }));
      } else {
        resultado.appendChild(blocoIgnoradas(it.lido));
        if (!it.lido.movs.length) resultado.appendChild(el('div', { class: 'nota atencao', texto: 'Nenhum lançamento foi lido. Confira as colunas e a linha dos títulos.' }));
        if (it.lido.todosPositivos) resultado.appendChild(el('div', { class: 'nota atencao', texto: 'Todos os valores vieram positivos: não sei o que é saída e o que é entrada. Se o extrato tem colunas separadas de Crédito e Débito, ou uma coluna com D e C, escolha acima.' }));
      }
    }
    U.mapeador(mapa, it.prep.cabecalho, O.CAMPOS, it.prep.escolha, linhas.slice(it.prep.inicio + 1, it.prep.inicio + 6), function () { atualizar(); recalcular(); });
    atualizar();
    return caixa;
  }

  function movimentos() {
    var out = [];
    arquivos.forEach(function (it) { if (itemPronto(it)) out = out.concat(it.lido.movs); });
    return out;
  }
  function renderResumoExtratos() {
    var alvo = $('resumo-extratos');
    alvo.innerHTML = '';
    var prontos = arquivos.filter(itemPronto);
    if (!prontos.length) return;
    var movs = movimentos();
    var meses = {};
    movs.forEach(function (m) { meses[m.data.slice(0, 7)] = true; });
    var lista = Object.keys(meses).sort();
    var n = lista.length ? O.mesIdx(lista[lista.length - 1]) - O.mesIdx(lista[0]) + 1 : 0;
    alvo.appendChild(el('div', { class: 'nota ok', texto: plural(prontos.length, 'arquivo pronto', 'arquivos prontos') + ': ' + plural(movs.length, 'lançamento', 'lançamentos') + ' de ' + (lista.length ? C.mesLongo(lista[0]) + ' a ' + C.mesLongo(lista[lista.length - 1]) : '') + ' (' + plural(n, 'mês', 'meses') + ').' }));
    if (n && n < 6) alvo.appendChild(el('div', { class: 'nota atencao', texto: 'Com poucos meses de extrato fica difícil ver o que se repete (e o anual quase nunca aparece). O ideal são 12 meses.' }));
    // mesmo extrato duas vezes (ex.: o Excel e o OFX da mesma conta)
    var vistos = {}, repetidos = {};
    prontos.forEach(function (it) {
      it.lido.movs.forEach(function (m) {
        var k = m.data + '|' + m.valor + '|' + C.simples(m.historico);
        if (vistos[k] && vistos[k] !== it.nome) repetidos[it.nome] = (repetidos[it.nome] || 0) + 1;
        else vistos[k] = it.nome;
      });
    });
    prontos.forEach(function (it) {
      if ((repetidos[it.nome] || 0) > it.lido.movs.length * 0.3) {
        alvo.appendChild(el('div', { class: 'nota atencao', texto: 'O arquivo "' + it.nome + '" tem muitos lançamentos iguais aos de outro arquivo. Se for o mesmo extrato em dois formatos, tire um da lista para não contar em dobro.' }));
      }
    });
  }

  // ---------- passo 2: revisar ----------
  $('min-meses').value = estado.minMeses;
  $('min-meses').addEventListener('change', function () {
    var n = Math.round(Number($('min-meses').value));
    if (!(n >= 2 && n <= 12)) { n = O.MIN_MESES_PADRAO; }
    $('min-meses').value = n;
    estado.minMeses = n; salvar(); recalcular();
  });

  function recalcular() {
    var movs = movimentos();
    if (!movs.length) { achado = null; renderRevisao(); renderGerar(); return; }
    achado = O.acharRecorrentes(movs, { minMeses: estado.minMeses });
    var c = clienteAtual();
    if (c) O.aplicarRegras(achado.itens, c.regras);
    achado.itens.forEach(function (it) { it.situacao = it.situacao || []; });
    renderRevisao(); renderGerar();
  }

  var NOMES_PERIODO = ['mensal', 'bimestral', 'trimestral', 'semestral', 'anual'];
  function renderRevisao() {
    var alvo = $('revisao');
    alvo.innerHTML = '';
    if (!achado) { alvo.appendChild(el('div', { class: 'nota info', texto: 'Traga os extratos no passo 1 para ver a lista.' })); return; }
    var itens = achado.itens, marc = itens.filter(function (i) { return i.incluir; });
    var pagar = marc.filter(function (i) { return i.tipo === 'pagar'; }), receber = marc.filter(function (i) { return i.tipo === 'receber'; });
    var somaP = C.soma(pagar, function (i) { return i.valor * 12 / (O.PERIODOS[i.periodicidade] || 1); }) / 12;
    var somaR = C.soma(receber, function (i) { return i.valor * 12 / (O.PERIODOS[i.periodicidade] || 1); }) / 12;
    alvo.appendChild(el('div', { class: 'cartoes onb-cartoes' }, [
      cartao('Recorrentes achados', C.num(itens.length), plural(marc.length, 'marcado', 'marcados') + ' para incluir'),
      cartao('A pagar por mês', C.brl(somaP), plural(pagar.length, 'conta', 'contas') + ' (média mensal)'),
      cartao('A receber por mês', C.brl(somaR), plural(receber.length, 'cliente', 'clientes') + ' (média mensal)'),
      cartao('Período lido', C.mesCurto(achado.mesInicio) + ' a ' + C.mesCurto(achado.mesFinal), plural(achado.totalMovs, 'lançamento', 'lançamentos'))
    ]));
    if (!itens.length) {
      alvo.appendChild(el('div', { class: 'nota atencao', texto: 'Não achei nada que se repita em pelo menos ' + estado.minMeses + ' meses. Confira se os extratos cobrem vários meses, ou baixe o número de meses acima.' }));
    } else {
      var c = clienteAtual();
      var botoes = el('div', { class: 'botoes onb-filtros' }, [
        el('button', { type: 'button', class: 'btn', texto: 'Marcar todos', onclick: function () { marcarTodos(true); } }),
        el('button', { type: 'button', class: 'btn', texto: 'Desmarcar todos', onclick: function () { marcarTodos(false); } }),
        c && Object.keys(c.regras).length ? el('button', { type: 'button', class: 'btn btn-perigo', texto: 'Esquecer o que lembrei deste cliente', onclick: function () {
          if (!window.confirm('Apagar as ' + Object.keys(c.regras).length + ' regras lembradas de "' + c.nome + '" e voltar às sugestões da ferramenta?')) return;
          c.regras = {}; salvar(); recalcular(); renderAvisos();
        } }) : null
      ]);
      alvo.appendChild(botoes);
      alvo.appendChild(tabelaRevisao(itens));
      alvo.appendChild(el('datalist', { id: 'lista-categorias' }, O.LISTA_CATEGORIAS.map(function (n) { return el('option', { value: n }); })));
    }
    if (achado.avulsos.length) {
      var lis = achado.avulsos.slice(0, 40).map(function (a) {
        return el('li', { texto: a.nome + ' (' + (a.tipo === 'pagar' ? 'saída' : 'entrada') + ', ' + plural(a.vezes, 'vez', 'vezes') + ', ' + a.meses.map(C.mesCurto).join(' ') + ', total ' + C.brl(a.total) + ')' });
      });
      if (achado.avulsos.length > 40) lis.push(el('li', { texto: 'e mais ' + (achado.avulsos.length - 40) + '.' }));
      alvo.appendChild(el('details', { class: 'onb-det' }, [
        el('summary', { texto: 'Ver o que ficou de fora (' + plural(achado.avulsos.length, 'favorecido avulso', 'favorecidos avulsos') + ')' }),
        el('p', { class: 'onb-dica', texto: 'Aparece em poucos meses ou sem ritmo. Se algo daqui é recorrente, baixe o número de meses acima.' }),
        el('ul', {}, lis)
      ]));
    }
  }
  function cartao(t, v, s) { return el('div', { class: 'cartao' }, [el('small', { texto: t }), el('b', { texto: v }), el('span', { texto: s })]); }
  function marcarTodos(v) {
    var c = clienteAtual();
    achado.itens.forEach(function (it) { if (c) O.lembrar(c.regras, it, 'incluir', v); else it.incluir = v; });
    salvar(); renderRevisao(); renderGerar();
  }
  function mudar(it, campo, valor, tr) {
    var c = clienteAtual();
    if (c) { O.lembrar(c.regras, it, campo, valor); salvar(); } else it[campo] = valor;
    if (tr) {
      tr.classList.toggle('fora', !it.incluir);
      tr.classList.toggle('erro-linha', it.incluir && O.validarItem(it).length > 0);
    }
    renderGerar();
    if (campo === 'incluir' || campo === 'valor' || campo === 'tipo' || campo === 'periodicidade') atualizarCartoes();
  }
  function atualizarCartoes() {
    // refaz só os cartões, sem perder o foco da tabela
    var velho = document.querySelector('#revisao .onb-cartoes');
    if (!velho) return;
    var marc = achado.itens.filter(function (i) { return i.incluir; });
    var pagar = marc.filter(function (i) { return i.tipo === 'pagar'; }), receber = marc.filter(function (i) { return i.tipo === 'receber'; });
    var f = function (i) { return i.valor * 12 / (O.PERIODOS[i.periodicidade] || 1); };
    var novos = el('div', { class: 'cartoes onb-cartoes' }, [
      cartao('Recorrentes achados', C.num(achado.itens.length), plural(marc.length, 'marcado', 'marcados') + ' para incluir'),
      cartao('A pagar por mês', C.brl(C.soma(pagar, f) / 12), plural(pagar.length, 'conta', 'contas') + ' (média mensal)'),
      cartao('A receber por mês', C.brl(C.soma(receber, f) / 12), plural(receber.length, 'cliente', 'clientes') + ' (média mensal)'),
      cartao('Período lido', C.mesCurto(achado.mesInicio) + ' a ' + C.mesCurto(achado.mesFinal), plural(achado.totalMovs, 'lançamento', 'lançamentos'))
    ]);
    velho.parentNode.replaceChild(novos, velho);
  }

  function tabelaRevisao(itens) {
    var corpo = el('tbody');
    itens.forEach(function (it) {
      var tr = el('tr', { class: (it.incluir ? '' : 'fora') + (it.incluir && O.validarItem(it).length ? ' erro-linha' : '') });
      var ck = el('input', { type: 'checkbox', 'aria-label': 'Incluir ' + it.nome });
      ck.checked = !!it.incluir;
      ck.addEventListener('change', function () { mudar(it, 'incluir', ck.checked, tr); });
      var tipo = el('select', { 'aria-label': 'Tipo' }, [el('option', { value: 'pagar', texto: 'Pagar' }), el('option', { value: 'receber', texto: 'Receber' })]);
      tipo.value = it.tipo;
      tipo.addEventListener('change', function () { mudar(it, 'tipo', tipo.value, tr); });
      function texto(campo, classe, rot, attrs) {
        var i = el('input', Object.assign({ type: 'text', class: classe, value: it[campo] == null ? '' : String(it[campo]), 'aria-label': rot, maxlength: '120' }, attrs || {}));
        i.addEventListener('change', function () { mudar(it, campo, i.value.trim(), tr); });
        return i;
      }
      var dia = el('input', { type: 'text', class: 'i-dia', inputmode: 'numeric', value: String(it.dia), 'aria-label': 'Dia do vencimento' });
      dia.addEventListener('change', function () {
        var n = Math.round(Number(dia.value));
        if (!(n >= 1 && n <= 31)) { U.avisar('O dia vai de 1 a 31. Para o último dia do mês, use 31.', 'erro'); dia.value = it.dia; return; }
        dia.value = n; mudar(it, 'dia', n, tr);
      });
      var valor = el('input', { type: 'text', class: 'i-valor', inputmode: 'decimal', value: C.num(it.valor, 2), 'aria-label': 'Valor' });
      valor.addEventListener('change', function () {
        var n = C.valor(valor.value);
        if (n == null || n <= 0) { U.avisar('Não entendi o valor. Escreva só o número, por exemplo 1.500,00.', 'erro'); valor.value = C.num(it.valor, 2); return; }
        n = Math.abs(n); valor.value = C.num(n, 2); mudar(it, 'valor', n, tr);
      });
      var per = el('select', { 'aria-label': 'Periodicidade' }, NOMES_PERIODO.map(function (p) { return el('option', { value: p, texto: p.charAt(0).toUpperCase() + p.slice(1) }); }));
      per.value = it.periodicidade;
      per.addEventListener('change', function () { mudar(it, 'periodicidade', per.value, tr); });
      var info = el('td', { class: 'info' });
      info.appendChild(el('div', {}, [el('b', { texto: plural(it.vezes, 'vez', 'vezes') }), ' em ' + plural(it.meses.length, 'mês', 'meses') + ': ' + it.meses.map(C.mesCurto).join(' ')]));
      info.appendChild(el('div', { texto: 'Último ' + C.brl(it.ultimoValor) + ', média ' + C.brl(it.media) + (it.variavel ? ', últimos 3: ' + C.brl(it.mediaUlt3) : '') }));
      if (it.doc) info.appendChild(el('div', { texto: (it.doc.length === 14 ? 'CNPJ ' : 'CPF ') + O.formatarDoc(it.doc) }));
      it.situacao.forEach(function (s) { info.appendChild(el('div', { class: 'alerta', texto: s })); });
      info.appendChild(el('div', { title: it.exemplos.join('\n'), texto: 'No banco: ' + (it.exemplos[it.exemplos.length - 1] || '').slice(0, 70) }));
      [ck, tipo, texto('nome', 'i-nome', 'Fornecedor ou cliente'), texto('descricao', 'i-desc', 'Descrição'),
        texto('categoria', 'i-cat', 'Categoria', { list: 'lista-categorias' }), dia, valor, per].forEach(function (x) { tr.appendChild(el('td', {}, [x])); });
      tr.appendChild(info);
      corpo.appendChild(tr);
    });
    var cab = el('tr', {}, ['Incluir', 'Tipo', 'Fornecedor ou cliente', 'Descrição', 'Categoria', 'Dia', 'Valor', 'Periodicidade', 'O que eu vi no extrato'].map(function (t, i) {
      return el('th', { class: i === 5 || i === 6 ? 'n' : null, texto: t });
    }));
    return el('div', { class: 'tabela-rolagem' }, [el('table', { class: 'onb-tabela' }, [el('thead', {}, [cab]), corpo])]);
  }

  // ---------- passo 3: modelo ----------
  $('mes-inicial').value = O.mesQueVem(hoje());
  $('meses-gerar').value = estado.mesesGerar;
  $('meses-gerar').addEventListener('change', function () {
    var n = Math.round(Number($('meses-gerar').value));
    if (!(n >= 1 && n <= 36)) n = O.MESES_GERAR_PADRAO;
    $('meses-gerar').value = n; estado.mesesGerar = n; salvar(); renderGerar();
  });
  $('mes-inicial').addEventListener('change', renderGerar);
  $('gerar-tipos').addEventListener('change', renderGerar);

  var areaModelo = U.areaArquivo({
    titulo: 'Arraste aqui o modelo de importação do Conta Azul',
    dica: 'ou clique para escolher. É o arquivo (Excel ou CSV) que o Conta Azul do cliente oferece para importar contas.',
    aoReceber: function (lista) { receberModelo(lista[0]); }
  });
  $('area-modelo').appendChild(areaModelo);

  function receberModelo(arq) {
    var r = new FileReader();
    r.onload = function () {
      try {
        var modelo = O.lerModelo(window.XLSX, new Uint8Array(r.result), arq.name);
        var abaIdx = O.melhorAbaModelo(modelo);
        mod = { modelo: modelo, abaIdx: abaIdx };
        prepararModelo();
        if (mod.analise.linhaCab < 0) { U.avisar('Não achei a linha com os títulos das colunas neste arquivo. Ele é o modelo de importação?', 'erro'); }
        renderModelo(); renderGerar();
      } catch (e) {
        mod = null; renderModelo(); renderGerar();
        U.avisar('Não consegui abrir "' + arq.name + '". Ele é mesmo Excel (.xlsx) ou CSV?', 'erro');
      }
    };
    r.onerror = function () { U.avisar('Não consegui ler o arquivo.', 'erro'); };
    r.readAsArrayBuffer(arq);
  }
  function prepararModelo() {
    var aba = mod.modelo.abas[mod.abaIdx];
    mod.analise = O.analisarAbaModelo(aba);
    if (mod.linhaManual != null) {
      var n = mod.linhaManual;
      var cab = (aba.linhas[n] || []).map(function (v) { return String(v == null ? '' : v).trim(); });
      while (cab.length && !cab[cab.length - 1]) cab.pop();
      mod.analise = O.completarAnalise(aba, n, cab, 0);
    }
    mod.assinatura = O.assinatura(mod.analise.cabecalho);
    var guardado = estado.mapas[mod.assinatura];
    mod.lembrado = !!(guardado && guardado.colunas.length === mod.analise.cabecalho.length);
    mod.mapa = mod.lembrado ? JSON.parse(JSON.stringify(guardado.colunas)) : O.detectarMapaModelo(mod.analise.cabecalho);
    var colTipo = -1;
    mod.mapa.forEach(function (m, i) { if (m.modo === 'campo' && m.campo === 'tipo') colTipo = i; });
    mod.textosTipo = mod.lembrado && guardado.textosTipo ? guardado.textosTipo : O.detectarTextosTipo(mod.analise.exemplo && colTipo >= 0 ? mod.analise.exemplo[colTipo] : null);
    mod.formatos = O.formatosDoModelo(mod.mapa, mod.analise, mod.modelo.tipo === 'csv' ? mod.modelo.sep : null);
    mod.abasPR = O.abasPagarReceber(mod.modelo);
    mod.contaAzul = !!mod.analise.contaAzul;
    if (mod.limpar == null || mod.contaAzul) mod.limpar = mod.contaAzul;
    if (!mod.competencia) mod.competencia = 'vencimento';
  }
  function opcoesLinhas() { return { competencia: mod.competencia, limpar: !!mod.limpar, contagem: { limpos: 0 } }; }
  function guardarMapa() {
    if (!mod || !mod.assinatura) return;
    estado.mapas[mod.assinatura] = { colunas: JSON.parse(JSON.stringify(mod.mapa)), textosTipo: mod.textosTipo };
    salvar();
  }

  function renderModelo() {
    var alvo = $('modelo');
    alvo.innerHTML = '';
    if (!mod) return;
    var modelo = mod.modelo, an = mod.analise;
    var caixa = el('div', { class: 'onb-arquivo' });
    caixa.appendChild(el('div', { class: 'onb-arquivo-topo' }, [el('b', { texto: modelo.nomeArquivo }), el('button', { type: 'button', class: 'btn', texto: 'Tirar o modelo', onclick: function () { mod = null; renderModelo(); renderGerar(); } })]));
    var campos = el('div', { class: 'linha-campos' });
    if (modelo.abas.length > 1) {
      var sel = el('select', { 'aria-label': 'Aba do modelo' }, modelo.abas.map(function (a, i) { return el('option', { value: String(i), texto: a.nome }); }));
      sel.value = String(mod.abaIdx);
      sel.addEventListener('change', function () { mod.abaIdx = Number(sel.value); mod.linhaManual = null; prepararModelo(); renderModelo(); renderGerar(); });
      campos.appendChild(el('label', { class: 'campo' }, [el('span', { texto: 'Aba que recebe os lançamentos' }), sel]));
    }
    var linhasAba = modelo.abas[mod.abaIdx].linhas;
    var inCab = el('input', { type: 'number', min: '1', max: String(Math.max(1, linhasAba.length)), value: String(an.linhaCab + 1), inputmode: 'numeric' });
    inCab.addEventListener('change', function () {
      mod.linhaManual = Math.max(1, Math.min(linhasAba.length, Math.round(Number(inCab.value) || 1))) - 1;
      prepararModelo(); renderModelo(); renderGerar();
    });
    campos.appendChild(el('label', { class: 'campo' }, [el('span', { texto: 'Linha dos títulos no modelo' }), inCab]));
    caixa.appendChild(campos);
    if (an.linhaCab < 0 || !an.cabecalho.length) {
      caixa.appendChild(el('div', { class: 'nota erro', texto: 'Não reconheci as colunas deste modelo. Escolha acima a linha que tem os títulos (Vencimento, Valor, Descrição...).' }));
      alvo.appendChild(caixa); return;
    }
    var infos = [];
    if (mod.contaAzul) {
      infos.push('Reconheci o modelo de importação do Conta Azul pelos títulos das colunas. O arquivo sai no mesmo formato (' + O.extensaoSaida(modelo) + '), com as mesmas abas, o mesmo cabeçalho e as linhas de exemplo do Conta Azul apagadas.');
      infos.push('Contas a pagar saem com valor negativo e contas a receber com valor positivo, no mesmo arquivo. A Data de Pagamento fica vazia: são contas futuras, em aberto.');
    }
    infos.push('Aba "' + modelo.abas[mod.abaIdx].nome + '", títulos na linha ' + (an.linhaCab + 1) + (an.linhaCab ? ': as ' + plural(an.linhaCab, 'linha', 'linhas') + ' de cima ficam como estão' : '') + '.');
    if (an.exemplo) infos.push('O modelo tem ' + plural(an.exemplos.length, 'linha', 'linhas') + ' de exemplo abaixo dos títulos: copiei delas o formato da data e do valor, e elas são apagadas e trocadas pelos lançamentos.');
    else infos.push('Sem linha de exemplo: as datas saem como dd/mm/aaaa e o valor como número.');
    if (mod.lembrado) infos.push('Já vi este modelo antes: usei o mesmo mapeamento da última vez.');
    caixa.appendChild(el('div', { class: 'nota info' }, [el('ul', {}, infos.map(function (t) { return el('li', { texto: t }); }))]));
    caixa.appendChild(el('p', { class: 'onb-dica', texto: 'Para cada coluna do modelo, diga o que vai nela. "Valor fixo" repete o mesmo texto em todas as linhas (por exemplo a forma de pagamento ou a conta).' }));
    caixa.appendChild(mapaModelo());
    var extras = el('div', { class: 'linha-campos', style: 'margin-top:10px' });
    if (mod.mapa.some(function (m) { return m.modo === 'campo' && m.campo === 'competencia'; })) {
      var selComp = el('select', {}, [el('option', { value: 'vencimento', texto: 'Igual à data de vencimento' }), el('option', { value: 'dia1', texto: 'Dia 1 do mês do vencimento' })]);
      selComp.value = mod.competencia;
      selComp.addEventListener('change', function () { mod.competencia = selComp.value; renderGerar(); });
      extras.appendChild(el('label', { class: 'campo' }, [el('span', { texto: 'Data de competência' }), selComp]));
    }
    var ckLimpar = el('input', { type: 'checkbox' });
    ckLimpar.checked = !!mod.limpar;
    ckLimpar.disabled = mod.contaAzul;
    ckLimpar.addEventListener('change', function () { mod.limpar = ckLimpar.checked; renderGerar(); });
    extras.appendChild(el('label', { class: 'campo onb-check' }, [el('span', { texto: 'Caracteres especiais' }), el('span', { class: 'onb-check-linha' }, [ckLimpar, mod.contaAzul ? ' Tirar sempre (exigência do Conta Azul)' : ' Tirar caracteres especiais dos textos']) ]));
    caixa.appendChild(extras);
    if (O.temColunaTipo(mod.mapa)) {
      var tp = el('div', { class: 'linha-campos', style: 'margin-top:10px' });
      ['pagar', 'receber'].forEach(function (k) {
        var i = el('input', { value: mod.textosTipo[k], maxlength: '40' });
        i.addEventListener('change', function () { mod.textosTipo[k] = i.value.trim() || (k === 'pagar' ? 'Pagar' : 'Receber'); guardarMapa(); renderGerar(); });
        tp.appendChild(el('label', { class: 'campo' }, [el('span', { texto: 'Na coluna Tipo, ' + (k === 'pagar' ? 'contas a pagar' : 'contas a receber') + ' saem como' }), i]));
      });
      caixa.appendChild(tp);
    }
    alvo.appendChild(caixa);
  }
  function mapaModelo() {
    var grade = el('div', { class: 'onb-mapa' });
    var ex = mod.analise.exemplo;
    mod.analise.cabecalho.forEach(function (nome, i) {
      var m = mod.mapa[i] || (mod.mapa[i] = { modo: 'branco' });
      var sel = el('select', { 'aria-label': 'O que vai na coluna ' + (nome || i + 1) });
      sel.appendChild(el('option', { value: 'branco', texto: '(deixar em branco)' }));
      O.CAMPOS_MODELO.forEach(function (c) { sel.appendChild(el('option', { value: 'campo:' + c.chave, texto: c.rotulo })); });
      sel.appendChild(el('option', { value: 'fixo', texto: 'Valor fixo (digitar)' }));
      sel.value = m.modo === 'campo' ? 'campo:' + m.campo : m.modo;
      var fixo = el('input', { value: m.modo === 'fixo' ? m.valor || '' : '', placeholder: 'Digite o valor fixo', maxlength: '80', 'aria-label': 'Valor fixo da coluna ' + nome });
      fixo.hidden = m.modo !== 'fixo';
      var exTxt = ex && ex[i] && !C.vazio(ex[i].v) ? 'Exemplo no modelo: ' + String(ex[i].w || ex[i].v).slice(0, 40) : '';
      var bloco = el('label', { class: 'onb-col' + (m.modo !== 'branco' ? ' usada' : '') }, [el('b', { texto: nome || 'Coluna ' + (i + 1) }), sel, fixo,
        exTxt ? el('small', { texto: exTxt }) : null,
        m.reconhecido === 'periodicidade' ? el('small', { texto: 'Deixei em branco: a ferramenta já gera uma linha por vencimento. Se preencher, o Conta Azul pode repetir de novo.' }) : null]);
      sel.addEventListener('change', function () {
        var v = sel.value;
        if (v === 'branco') mod.mapa[i] = { modo: 'branco' };
        else if (v === 'fixo') mod.mapa[i] = { modo: 'fixo', valor: fixo.value };
        else mod.mapa[i] = { modo: 'campo', campo: v.slice(6) };
        fixo.hidden = v !== 'fixo';
        bloco.classList.toggle('usada', v !== 'branco');
        mod.formatos = O.formatosDoModelo(mod.mapa, mod.analise, mod.modelo.tipo === 'csv' ? mod.modelo.sep : null);
        guardarMapa();
        if (v === 'campo:tipo' || mod.mapa.length) renderGerar();
        if (v === 'fixo') fixo.focus();
        if (v === 'campo:tipo') renderModelo();
      });
      fixo.addEventListener('change', function () { mod.mapa[i] = { modo: 'fixo', valor: fixo.value }; guardarMapa(); renderGerar(); });
      grade.appendChild(bloco);
    });
    return grade;
  }

  // ---------- passo 3: o que gerar e baixar ----------
  function opcoesGerar() {
    var ops = [];
    if (mod && mod.abasPR) ops.push(['abas', 'Pagar e receber nas abas do modelo']);
    if (mod && O.temColunaTipo(mod.mapa)) ops.push(['juntos', 'Pagar e receber no mesmo arquivo']);
    else if (mod && O.sinalSeparaTipos(mod.mapa, mod.formatos)) ops.push(['juntos', 'Pagar e receber no mesmo arquivo (pelo sinal do valor)']);
    ops.push(['separados', 'Pagar e receber em dois arquivos'], ['pagar', 'Só contas a pagar'], ['receber', 'Só contas a receber']);
    return ops;
  }
  function renderOpcoesGerar() {
    var sel = $('gerar-tipos'), atual = sel.value, ops = opcoesGerar();
    sel.innerHTML = '';
    ops.forEach(function (o) { sel.appendChild(el('option', { value: o[0], texto: o[1] })); });
    sel.value = ops.some(function (o) { return o[0] === atual; }) && sel.dataset.escolhido ? atual : ops[0][0];
  }
  $('gerar-tipos').addEventListener('change', function () { $('gerar-tipos').dataset.escolhido = '1'; });

  function ocorrencias(tipos) {
    if (!achado) return [];
    var mi = $('mes-inicial').value;
    if (!O.mesValido(mi)) mi = O.mesQueVem(hoje());
    return O.gerarOcorrencias(achado.itens, mi, estado.mesesGerar, tipos);
  }
  function problemasItens() {
    if (!achado) return ['traga os extratos no passo 1'];
    var marc = achado.itens.filter(function (i) { return i.incluir; });
    if (!marc.length) return ['marque pelo menos um recorrente no passo 2'];
    var ruins = marc.filter(function (i) { return O.validarItem(i).length; });
    return ruins.length ? ['acerte ' + plural(ruins.length, 'linha marcada', 'linhas marcadas') + ' no passo 2 (nome, valor ou dia)'] : [];
  }
  function renderGerar() {
    renderOpcoesGerar();
    var prob = problemasItens();
    var faltaModelo = !mod ? ['traga o modelo do Conta Azul'] : mod.analise.linhaCab < 0 ? ['escolha a linha dos títulos do modelo'] : O.faltandoModelo(mod.mapa).map(function (f) { return 'diga qual coluna do modelo recebe ' + f; });
    $('btn-gerar').disabled = !!(prob.length || faltaModelo.length);
    $('btn-simples').disabled = !!prob.length;
    $('btn-lista').disabled = !achado || !achado.itens.length;
    $('gerar-motivo').textContent = prob.concat(faltaModelo).length ? 'Para baixar a planilha preenchida: ' + prob.concat(faltaModelo).join('; ') + '.' : '';
    renderPrevia();
  }
  function renderPrevia() {
    var alvo = $('previa');
    alvo.innerHTML = '';
    if (problemasItens().length) return;
    var modo = $('gerar-tipos').value, tipos = modo === 'pagar' ? ['pagar'] : modo === 'receber' ? ['receber'] : null;
    var oc = ocorrencias(tipos);
    var p = oc.filter(function (o) { return o.item.tipo === 'pagar'; }).length, r = oc.length - p;
    var ultimo = oc.length ? oc[oc.length - 1].vencimento : null;
    alvo.appendChild(el('div', { class: 'nota ok', texto: 'Vai gerar ' + plural(oc.length, 'linha', 'linhas') + ' (' + plural(p, 'conta a pagar', 'contas a pagar') + ' e ' + plural(r, 'conta a receber', 'contas a receber') + ')' + (oc.length ? ', de ' + C.dataBR(oc[0].vencimento) + ' a ' + C.dataBR(ultimo) : '') + '.' }));
    if (mod && mod.analise.linhaCab >= 0 && !O.faltandoModelo(mod.mapa).length) {
      var op = opcoesLinhas();
      O.montarLinhasModelo(oc, mod.mapa, mod.formatos, mod.textosTipo, op);
      if (op.contagem.limpos) alvo.appendChild(el('div', { class: 'nota info', texto: plural(op.contagem.limpos, 'texto foi limpo', 'textos foram limpos') + ' (tirei caracteres especiais ou espaços sobrando' + (mod.contaAzul ? ', como o Conta Azul pede' : '') + ').' }));
      if (mod.contaAzul) alvo.appendChild(el('div', { class: 'nota atencao', texto: 'A Categoria precisa ter exatamente o mesmo nome do plano de categorias do Conta Azul do cliente, senão a importação recusa ou cria outra. Confira na tabela do passo 2 antes de baixar.' }));
    }
    if (!oc.length) return;
    var corpo = el('tbody', {}, oc.slice(0, 8).map(function (o) {
      return el('tr', {}, [el('td', { texto: C.dataBR(o.vencimento) }), el('td', { texto: o.item.tipo === 'pagar' ? 'Pagar' : 'Receber' }), el('td', { texto: o.item.nome }),
        el('td', { texto: o.item.categoria }), el('td', { class: 'n', texto: C.brl(o.valor) }), el('td', { texto: o.parcela })]);
    }));
    alvo.appendChild(el('details', { class: 'onb-det onb-previa' }, [el('summary', { texto: 'Ver as primeiras linhas' }),
      el('div', { class: 'tabela-rolagem' }, [el('table', {}, [el('thead', {}, [el('tr', {}, ['Vencimento', 'Tipo', 'Fornecedor ou cliente', 'Categoria', 'Valor', 'Parcela'].map(function (t, i) { return el('th', { class: i === 4 ? 'n' : null, texto: t }); }))]), corpo])])]));
  }

  function nomeBase() {
    var c = clienteAtual();
    return 'recorrentes-' + U.nomeArquivo(c ? c.nome : 'cliente');
  }
  function baixarGerado(nome, conteudo) {
    if (typeof conteudo === 'string') U.baixar(nome, conteudo, 'text/csv;charset=utf-8');
    else U.baixar(nome, new Blob([conteudo], { type: /[.]xls$/i.test(nome) ? 'application/vnd.ms-excel' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }
  $('btn-gerar').addEventListener('click', function () {
    if ($('btn-gerar').disabled || !mod) return;
    guardarMapa();
    var modo = $('gerar-tipos').value, X = window.XLSX, an = mod.analise, ext = '.' + O.extensaoSaida(mod.modelo);
    var mi = $('mes-inicial').value || O.mesQueVem(hoje());
    function linhasDe(tipos, mapa, formatos) { return O.montarLinhasModelo(ocorrencias(tipos), mapa, formatos, mod.textosTipo, opcoesLinhas()); }
    try {
      if (modo === 'abas' && mod.abasPR) {
        var partes = ['pagar', 'receber'].map(function (t) {
          var idx = mod.abasPR[t], a = idx === mod.abaIdx ? an : O.analisarAbaModelo(mod.modelo.abas[idx]);
          var mesma = O.assinatura(a.cabecalho) === mod.assinatura;
          var mapa = mesma ? mod.mapa : O.detectarMapaModelo(a.cabecalho);
          return { abaIdx: idx, linhaCab: a.linhaCab, linhas: linhasDe([t], mapa, O.formatosDoModelo(mapa, a, null)) };
        });
        baixarGerado(nomeBase() + '-' + mi + ext, O.gerarArquivoModelo(X, mod.modelo, partes));
      } else if (modo === 'juntos') {
        baixarGerado(nomeBase() + '-' + mi + ext, O.gerarArquivoModelo(X, mod.modelo, [{ abaIdx: mod.abaIdx, linhaCab: an.linhaCab, linhas: linhasDe(null, mod.mapa, mod.formatos) }]));
      } else {
        var tipos = modo === 'separados' ? ['pagar', 'receber'] : [modo];
        var feitos = 0;
        tipos.forEach(function (t, k) {
          var l = linhasDe([t], mod.mapa, mod.formatos);
          if (!l.length) return;
          feitos++;
          var conteudo = O.gerarArquivoModelo(X, mod.modelo, [{ abaIdx: mod.abaIdx, linhaCab: an.linhaCab, linhas: l }]);
          setTimeout(function () { baixarGerado(nomeBase() + (t === 'pagar' ? '-a-pagar-' : '-a-receber-') + mi + ext, conteudo); }, k * 700);
        });
        if (!feitos) { U.avisar('Não tem nenhuma conta desse tipo marcada.', 'erro'); return; }
        if (feitos > 1) U.avisar('Baixei dois arquivos: contas a pagar e contas a receber. Se o navegador perguntar, permita baixar os dois.', 'ok');
      }
    } catch (e) {
      U.avisar('Não consegui montar a planilha: ' + e.message, 'erro');
    }
  });
  $('btn-simples').addEventListener('click', function () {
    if ($('btn-simples').disabled) return;
    var modo = $('gerar-tipos').value, tipos = modo === 'pagar' ? ['pagar'] : modo === 'receber' ? ['receber'] : null;
    var linhas = O.linhasSimples(ocorrencias(tipos));
    U.baixarExcel(nomeBase() + '-planilha-simples.xlsx', [
      { nome: 'Lançamentos', linhas: linhas, larguras: [34, 30, 24, 12, 13, 9], formatoMoeda: [4] },
      { nome: 'Leia antes', linhas: [['Esta planilha NÃO é o modelo oficial de importação do Conta Azul.'], ['Use para conferir ou para copiar as colunas para o modelo que você baixa no Conta Azul do cliente.'], ['Confira categorias e nomes de fornecedores e clientes com os já cadastrados antes de importar.']], larguras: [100] }
    ]);
    U.avisar('Planilha simples baixada. Lembre: não é o modelo oficial do Conta Azul.', 'ok');
  });
  $('btn-lista').addEventListener('click', function () {
    if (!achado || !achado.itens.length) return;
    var linhas = O.linhasLista(achado.itens);
    var av = [['Fornecedor ou cliente', 'Tipo', 'Vezes', 'Meses', 'Total', 'Exemplo de histórico']].concat(achado.avulsos.map(function (a) {
      return [a.nome, a.tipo === 'pagar' ? 'Saída' : 'Entrada', a.vezes, a.meses.map(C.mesCurto).join(', '), a.total, a.exemplo];
    }));
    U.baixarExcel(nomeBase() + '-lista-para-conferir.xlsx', [
      { nome: 'Recorrentes', linhas: linhas, larguras: [8, 9, 28, 30, 24, 5, 12, 13, 9, 13, 13, 13, 7, 40, 50, 20, 50], formatoMoeda: [7, 9, 10, 11] },
      { nome: 'Avulsos (ficaram de fora)', linhas: av, larguras: [30, 9, 7, 40, 13, 50], formatoMoeda: [4] }
    ]);
  });

  // ---------- backup ----------
  $('btn-backup').addEventListener('click', function () {
    estado.ultimoBackup = new Date().toISOString();
    salvar();
    U.baixar('backup-recorrentes-' + hoje() + '.json', JSON.stringify(O.criarBackup(estado), null, 2), 'application/json');
    renderAvisos();
    U.avisar('Backup baixado. Ele guarda os clientes, o que você excluiu ou renomeou e o mapeamento do modelo. Os extratos não vão no backup.', 'ok');
  });
  $('btn-restaurar').addEventListener('click', function () {
    U.escolherArquivo('.json,application/json').then(function (arq) {
      if (!arq) return;
      return U.lerJSON(arq).then(function (obj) {
        var novo = O.lerBackup(obj);
        if (estado.clientes.length && !window.confirm('Restaurar o backup troca os dados de agora (' + estado.clientes.length + ' clientes) pelos do arquivo (' + novo.clientes.length + ' clientes). Continuar?')) return;
        estado = novo; salvar();
        $('cliente-nome').value = ''; $('min-meses').value = estado.minMeses; $('meses-gerar').value = estado.mesesGerar;
        renderListaClientes(); renderAvisos();
        if (mod) { prepararModelo(); renderModelo(); }
        recalcular();
        U.avisar('Backup restaurado: ' + plural(novo.clientes.length, 'cliente', 'clientes') + '.', 'ok');
      });
    }).catch(function (e) { U.avisar(e.message, 'erro'); });
  });

  renderAvisos();
  renderListaClientes();
  renderRevisao();
  renderGerar();
})();

/* Conciliação inteligente, a tela. Precisa de xlsx, comum.js, ui.js, volume-logica.js e conciliar-logica.js antes. */
(function () {
  'use strict';
  var C = window.Comum, U = window.UI, K = window.Conciliar;
  var el = U.el;
  var $ = function (id) { return document.getElementById(id); };

  var estado = K.normalizar(C.recuperar(K.CHAVE, null));
  var guarda = U.navegadorGuarda();
  // arquivos desta sessão (não ficam guardados: arraste de novo a cada vez)
  var arquivos = { extrato: [], receber: [], pagar: [], pagadores: [] };
  var decisoes = {};     // por empresa: {idLancamento: {tipo, ids}}
  var aprender = {};     // idLancamento: true quando a caixa "Aprender" está aberta
  var escolhendo = {};   // idLancamento: true quando a lista "Escolher outro" está aberta
  var resultado = null;
  var filtro = 'todos';
  var jaConciliou = false;

  function salvar() {
    if (!C.guardar(K.CHAVE, estado) && guarda) U.avisar('Não consegui salvar neste navegador. Salve um backup.', 'erro');
  }
  function empresa() { return estado.empresas.filter(function (e) { return e.id === estado.selecionada; })[0] || null; }
  function decisoesDa() { var e = empresa(); if (!e) return {}; return (decisoes[e.id] = decisoes[e.id] || {}); }
  function hoje() { var d = new Date(); return d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1) + '-' + (d.getDate() < 10 ? '0' : '') + d.getDate(); }

  // ---------- avisos ----------
  function renderAvisos() {
    var alvo = $('avisos-topo');
    alvo.innerHTML = '';
    if (!guarda) alvo.appendChild(el('div', { class: 'nota erro', html: '<b>Este navegador não está guardando os dados</b> (modo anônimo ou bloqueado). Os pagadores e as regras somem quando você fechar a página. Use <b>Salvar backup</b> antes de sair.' }));
    var e = empresa();
    if (e && (e.pagadores.length || e.regras.length)) {
      var dias = K.diasDesde(estado.ultimoBackup);
      if (dias == null) alvo.appendChild(el('div', { class: 'nota info', texto: 'Dica: você ainda não salvou nenhum backup. Ele guarda empresas, pagadores e regras num arquivo, para não perder se o navegador for limpo.' }));
      else if (dias > 7) alvo.appendChild(el('div', { class: 'nota info', texto: 'Seu último backup foi há ' + dias + ' dias. Vale salvar um novo.' }));
    }
  }

  // ---------- passo 1: empresa ----------
  function renderEmpresas() {
    var sel = $('empresa');
    sel.innerHTML = '';
    var lista = estado.empresas.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
    if (!lista.length) sel.appendChild(el('option', { value: '', texto: 'Cadastre a primeira empresa ao lado' }));
    lista.forEach(function (e) { sel.appendChild(el('option', { value: e.id, texto: e.nome })); });
    sel.value = estado.selecionada || '';
    sel.disabled = !lista.length;
    $('acoes-empresa').hidden = !lista.length;
    $('opcoes').hidden = !lista.length;
    renderOpcoes();
  }
  $('empresa').addEventListener('change', function () {
    estado.selecionada = $('empresa').value || null;
    salvar(); aprender = {}; escolhendo = {};
    renderTudo();
  });
  $('form-empresa').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var nome = $('nova-empresa').value.trim();
    if (!nome) { U.avisar('Escreva o nome (ou apelido) da empresa.', 'erro'); return; }
    var e = K.novaEmpresa(nome);
    estado.empresas.push(e);
    estado.selecionada = e.id;
    salvar();
    $('nova-empresa').value = '';
    renderTudo();
    U.avisar('Empresa "' + e.nome + '" cadastrada. Agora traga o extrato e as contas a receber.', 'ok');
  });
  $('btn-renomear').addEventListener('click', function () {
    var e = empresa(); if (!e) return;
    var n = window.prompt('Novo nome da empresa:', e.nome);
    if (n == null || !n.trim()) return;
    e.nome = n.trim().slice(0, 80);
    salvar(); renderTudo();
  });
  $('btn-excluir').addEventListener('click', function () {
    var e = empresa(); if (!e) return;
    if (!window.confirm('Excluir "' + e.nome + '" com ' + e.pagadores.length + ' pagadores e ' + e.regras.length + ' regras? Isso não tem volta (a não ser por um backup).')) return;
    estado.empresas = estado.empresas.filter(function (x) { return x !== e; });
    estado.selecionada = estado.empresas[0] ? estado.empresas[0].id : null;
    delete decisoes[e.id];
    salvar(); renderTudo();
  });

  function renderOpcoes() {
    var e = empresa();
    var o = e ? e.opcoes : K.OPCOES_PADRAO;
    $('op-tol').value = C.num(o.tolerancia, 2);
    $('op-antes').value = String(o.diasAntes);
    $('op-depois').value = String(o.diasDepois);
    $('op-saidas').checked = !!o.saidas;
    $('bloco-pagar').hidden = !o.saidas;
  }
  ['op-tol', 'op-antes', 'op-depois', 'op-saidas'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      var e = empresa(); if (!e) return;
      var tol = C.valor($('op-tol').value);
      if (tol == null || tol < 0) { U.avisar('A diferença aceita precisa ser um valor, por exemplo 0,05.', 'erro'); renderOpcoes(); return; }
      e.opcoes = K.normalizarOpcoes({ tolerancia: tol, diasAntes: $('op-antes').value, diasDepois: $('op-depois').value, saidas: $('op-saidas').checked });
      salvar(); renderOpcoes(); reconciliar();
    });
  });

  // ---------- leitura de arquivos ----------
  function lerTexto(arquivo) {
    return new Promise(function (ok, falha) {
      var r = new FileReader();
      r.onload = function () { try { ok(C.decodificar(new Uint8Array(r.result))); } catch (e) { falha(e); } };
      r.onerror = function () { falha(new Error('Não consegui ler o arquivo.')); };
      r.readAsArrayBuffer(arquivo);
    });
  }
  var TIPOS = {
    extrato: { campos: K.CAMPOS_EXTRATO, alvo: 'lista-extrato', ofx: true, nomeItens: 'lançamentos' },
    receber: { campos: K.CAMPOS_TITULOS, alvo: 'lista-titulos', nomeItens: 'títulos' },
    pagar: { campos: K.CAMPOS_TITULOS, alvo: 'lista-pagar', nomeItens: 'títulos' },
    pagadores: { campos: K.CAMPOS_PAGADORES, alvo: 'lista-pagadores-arq', nomeItens: 'pagadores' }
  };
  function lerItem(qual, it) {
    var linhas = it.abas[it.abaIdx].linhas, p = it.prep;
    if (qual === 'extrato') return K.lerExtrato(linhas, p.inicio, p.escolha, it.nome);
    if (qual === 'receber') return K.lerTitulos(linhas, p.inicio, p.escolha, 'receber', it.nome);
    if (qual === 'pagar') return K.lerTitulos(linhas, p.inicio, p.escolha, 'pagar', it.nome);
    return K.lerPagadores(linhas, p.inicio, p.escolha);
  }
  function faltam(qual, escolha) {
    if (qual === 'extrato') return K.faltandoExtrato(escolha);
    return C.faltando(escolha, TIPOS[qual].campos).map(function (c) { return c.rotulo; });
  }
  function itensDe(qual, lido) {
    if (!lido) return [];
    return qual === 'extrato' ? lido.lancamentos : qual === 'pagadores' ? lido.pagadores : lido.titulos;
  }
  function receber(qual, lista) {
    if (!empresa()) { U.avisar('Cadastre a empresa no passo 1 primeiro.', 'erro'); return; }
    Promise.all(lista.map(function (arq) {
      var it = { nome: arq.name };
      if (TIPOS[qual].ofx && /\.(ofx|qfx)$/i.test(arq.name)) {
        return lerTexto(arq).then(function (texto) {
          if (!K.pareceOFX(texto)) throw new Error('"' + arq.name + '" não parece um arquivo OFX de banco.');
          it.tipo = 'ofx'; it.lido = K.lerOFX(texto, arq.name);
          if (!it.lido.lancamentos.length) it.erro = 'Não achei lançamentos dentro deste OFX.';
          return it;
        }).catch(function (e) { it.erro = e.message; return it; });
      }
      return U.lerArquivo(arq).then(function (abas) {
        if (!abas.length) throw new Error('"' + arq.name + '" está vazio.');
        it.tipo = 'planilha'; it.abas = abas;
        it.abaIdx = K.melhorAba(abas, TIPOS[qual].campos);
        it.prep = K.preparar(abas[it.abaIdx].linhas, TIPOS[qual].campos);
        it.lido = lerItem(qual, it);
        return it;
      }).catch(function (e) {
        if (!TIPOS[qual].ofx) { it.erro = e.message; return it; }
        return lerTexto(arq).then(function (texto) {
          if (K.pareceOFX(texto)) { it.tipo = 'ofx'; it.lido = K.lerOFX(texto, arq.name); return it; }
          it.erro = e.message; return it;
        }).catch(function () { it.erro = e.message; return it; });
      });
    })).then(function (itens) {
      itens.forEach(function (it) {
        arquivos[qual] = arquivos[qual].filter(function (p) { return p.nome !== it.nome; });
        arquivos[qual].push(it);
      });
      renderArquivos(qual);
      if (qual !== 'pagadores') reconciliar();
    });
  }
  function pronto(qual, it) {
    if (it.erro) return false;
    if (it.tipo === 'ofx') return it.lido.lancamentos.length > 0;
    return !faltam(qual, it.prep.escolha).length && itensDe(qual, it.lido).length > 0;
  }
  function blocoIgnoradas(qual, lido) {
    var ig = lido.ignoradas, tot = Object.keys(ig).reduce(function (s, k) { return s + ig[k]; }, 0);
    var n = itensDe(qual, lido).length;
    var resumo = 'Li ' + C.num(lido.lidas) + ' linhas: ' + C.num(n) + ' ' + TIPOS[qual].nomeItens + ' e ' + C.num(tot) + ' ignoradas.';
    var MOTIVOS = { saldo: 'linhas de saldo (saldo não é lançamento)', total: 'linhas de total', semData: 'linhas sem data que dê para entender', zero: 'linhas com valor zero ou sem valor',
      semValor: 'linhas sem valor', semCliente: 'linhas sem cliente', semNome: 'linhas sem nome do pagador', semVinculo: 'linhas sem cliente e sem processo' };
    var caixa = el('div', { class: 'con-lido' });
    caixa.appendChild(el('p', { class: 'con-dica', texto: resumo }));
    if (tot) {
      var itens = [];
      Object.keys(ig).forEach(function (k) {
        if (!ig[k]) return;
        var li = el('li', {}, [C.num(ig[k]) + ' ' + (MOTIVOS[k] || k)]);
        if (lido.exemplos[k] && lido.exemplos[k].length) li.appendChild(el('ul', {}, lido.exemplos[k].map(function (x) { return el('li', { texto: x }); })));
        itens.push(li);
      });
      caixa.appendChild(el('details', { class: 'con-detalhes' }, [el('summary', { texto: 'Ver as linhas ignoradas e por quê' }), el('ul', {}, itens)]));
    }
    var lidos = itensDe(qual, lido);
    if (lidos.length) {
      var amostra = lidos.slice(0, 60).map(function (x) {
        var t = qual === 'extrato' ? C.dataBR(x.data) + '  ' + C.brl(x.valor) + '  ' + x.historico :
          qual === 'pagadores' ? x.nome + (x.papel ? ' (' + x.papel + ')' : '') + ' paga por ' + (x.processo ? 'processo ' + x.processo : x.cliente) :
          C.dataBR(x.vencimento) + '  ' + C.brl(x.valor) + '  ' + x.cliente + (x.documento ? ' | ' + x.documento : '') + (x.parcela ? ' | parcela ' + x.parcela : '');
        return el('li', { texto: t });
      });
      if (lidos.length > 60) amostra.push(el('li', { texto: 'e mais ' + (lidos.length - 60) + '...' }));
      caixa.appendChild(el('details', { class: 'con-detalhes' }, [el('summary', { texto: 'Ver o que foi lido' }), el('ul', {}, amostra)]));
    }
    return caixa;
  }
  function renderArquivos(qual) {
    var alvo = $(TIPOS[qual].alvo);
    alvo.innerHTML = '';
    arquivos[qual].forEach(function (it) { alvo.appendChild(blocoArquivo(qual, it)); });
    if (qual === 'pagadores') renderBotaoPagadoresArq();
    if (qual === 'receber' || qual === 'pagar') renderListaClientes();
    renderBotaoConciliar();
  }
  function blocoArquivo(qual, it) {
    var caixa = el('div', { class: 'con-arquivo' + (it.erro ? ' com-erro' : '') });
    var tirar = el('button', { type: 'button', class: 'btn', texto: 'Tirar', onclick: function () {
      arquivos[qual] = arquivos[qual].filter(function (p) { return p !== it; });
      renderArquivos(qual);
      if (qual !== 'pagadores') reconciliar();
    } });
    caixa.appendChild(el('div', { class: 'con-arquivo-topo' }, [el('b', { texto: it.nome }), tirar]));
    if (it.erro) { caixa.appendChild(el('div', { class: 'nota erro', texto: it.erro })); return caixa; }
    if (it.tipo === 'ofx') {
      caixa.appendChild(el('p', { class: 'con-dica', texto: 'Arquivo OFX do banco com ' + it.lido.contas.length + (it.lido.contas.length === 1 ? ' conta.' : ' contas.') }));
      caixa.appendChild(blocoIgnoradas(qual, it.lido));
      return caixa;
    }
    var campos = el('div', { class: 'linha-campos' });
    if (it.abas.length > 1) {
      var selAba = el('select', { 'aria-label': 'Aba da planilha' }, it.abas.map(function (a, i) { return el('option', { value: String(i), texto: a.nome }); }));
      selAba.value = String(it.abaIdx);
      selAba.addEventListener('change', function () {
        it.abaIdx = Number(selAba.value);
        it.prep = K.preparar(it.abas[it.abaIdx].linhas, TIPOS[qual].campos);
        it.lido = lerItem(qual, it);
        renderArquivos(qual); if (qual !== 'pagadores') reconciliar();
      });
      campos.appendChild(el('label', { class: 'campo' }, [el('span', { texto: 'Aba usada' }), selAba]));
    }
    var linhas = it.abas[it.abaIdx].linhas;
    var inCab = el('input', { type: 'number', min: '1', max: String(linhas.length), value: String(it.prep.inicio + 1), inputmode: 'numeric' });
    inCab.addEventListener('change', function () {
      var n = Math.max(1, Math.min(linhas.length, Math.round(Number(inCab.value) || 1))) - 1;
      var cab = (linhas[n] || []).map(function (v) { return String(v == null ? '' : v); });
      it.prep = { inicio: n, cabecalho: cab, escolha: C.detectarColunas(cab, TIPOS[qual].campos) };
      it.lido = lerItem(qual, it);
      renderArquivos(qual); if (qual !== 'pagadores') reconciliar();
    });
    campos.appendChild(el('label', { class: 'campo' }, [el('span', { texto: 'Linha dos títulos das colunas' }), inCab]));
    caixa.appendChild(campos);
    caixa.appendChild(el('p', { class: 'con-dica', texto: 'Confira as colunas que eu achei.' }));
    var mapa = el('div'), res = el('div');
    caixa.appendChild(mapa); caixa.appendChild(res);
    function atualizar() {
      it.lido = lerItem(qual, it);
      res.innerHTML = '';
      var f = faltam(qual, it.prep.escolha);
      if (f.length) res.appendChild(el('div', { class: 'nota erro', texto: 'Falta escolher: ' + f.join(', ') + '. Sem isso não dá para seguir.' }));
      else {
        res.appendChild(blocoIgnoradas(qual, it.lido));
        if (!itensDe(qual, it.lido).length) res.appendChild(el('div', { class: 'nota atencao', texto: 'Nada foi lido. Confira as colunas e a linha dos títulos.' }));
      }
      if (qual === 'pagadores') renderBotaoPagadoresArq();
      renderBotaoConciliar();
    }
    var exemplo = linhas.slice(it.prep.inicio + 1, it.prep.inicio + 6);
    U.mapeador(mapa, it.prep.cabecalho, TIPOS[qual].campos, it.prep.escolha, exemplo, function () {
      atualizar();
      if (qual !== 'pagadores') reconciliar();
    });
    atualizar();
    return caixa;
  }
  function area(qual, idAlvo, titulo, dica, aceita) {
    var a = U.areaArquivo({ titulo: titulo, dica: dica, varios: true, aoReceber: function (l) { receber(qual, l); } });
    var inp = a.querySelector('input');
    if (inp && aceita) inp.setAttribute('accept', aceita);
    $(idAlvo).appendChild(a);
  }
  area('extrato', 'area-extrato', 'Arraste o extrato aqui', 'ou clique para escolher. Excel, CSV ou OFX. Pode ser mais de uma conta.', '.xlsx,.xls,.csv,.txt,.ofx,.qfx');
  area('receber', 'area-titulos', 'Arraste as contas a receber aqui', 'ou clique para escolher. Excel (.xlsx, .xls) ou CSV.');
  area('pagar', 'area-pagar', 'Arraste as contas a pagar aqui', 'ou clique para escolher. Excel (.xlsx, .xls) ou CSV.');
  area('pagadores', 'area-pagadores', 'Arraste a planilha de pagadores', 'ou clique para escolher. Excel (.xlsx, .xls) ou CSV.');

  // ---------- passo 4: pagadores e regras ----------
  $('pg-papel').innerHTML = '';
  K.PAPEIS.forEach(function (p) { $('pg-papel').appendChild(el('option', { value: p, texto: p })); });
  function titulosCarregados() {
    var out = [];
    ['receber', 'pagar'].forEach(function (q) {
      arquivos[q].forEach(function (it) { if (pronto(q, it)) out = out.concat(it.lido.titulos); });
    });
    return out;
  }
  function lancamentosCarregados() {
    var out = [];
    arquivos.extrato.forEach(function (it) { if (pronto('extrato', it)) out = out.concat(it.lido.lancamentos); });
    return out;
  }
  function renderListaClientes() {
    var dl = $('lista-clientes'), vistos = {};
    dl.innerHTML = '';
    titulosCarregados().forEach(function (t) {
      var k = K.chaveNome(t.cliente);
      if (vistos[k]) return;
      vistos[k] = true;
      dl.appendChild(el('option', { value: t.cliente }));
    });
  }
  $('form-pagador').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var e = empresa();
    if (!e) { U.avisar('Cadastre a empresa no passo 1 primeiro.', 'erro'); return; }
    var p = K.novoPagador({ nome: $('pg-nome').value, papel: $('pg-papel').value, cliente: $('pg-cliente').value, processo: $('pg-processo').value, cpf: $('pg-cpf').value });
    if (!$('pg-nome').value.trim()) { U.avisar('Escreva o nome do pagador.', 'erro'); return; }
    if (!p) { U.avisar('Diga por qual cliente ou por qual processo essa pessoa paga.', 'erro'); return; }
    e.pagadores.push(p);
    salvar();
    ['pg-nome', 'pg-cliente', 'pg-processo', 'pg-cpf'].forEach(function (id) { $(id).value = ''; });
    renderPagadores(); renderAvisos(); reconciliar();
    U.avisar('Pagador "' + p.nome + '" cadastrado.', 'ok');
  });
  function renderBotaoPagadoresArq() {
    var alvo = $('lista-pagadores-arq');
    var velho = alvo.querySelector('.con-add-pag');
    if (velho) velho.remove();
    var novos = [];
    arquivos.pagadores.forEach(function (it) { if (pronto('pagadores', it)) novos = novos.concat(it.lido.pagadores); });
    if (!arquivos.pagadores.length) return;
    var b = el('button', { type: 'button', class: 'btn btn-forte', texto: novos.length ? 'Adicionar ' + novos.length + ' pagadores na empresa' : 'Nada para adicionar ainda', onclick: function () {
      var e = empresa(); if (!e || !novos.length) return;
      var r = K.importarRegras(e, { ferramenta: 'conciliacao-regras', pagadores: novos, regras: [] });
      arquivos.pagadores = [];
      salvar(); renderArquivos('pagadores'); renderPagadores(); renderAvisos(); reconciliar();
      U.avisar(r.pagadores + ' pagadores adicionados' + (r.repetidos ? ', ' + r.repetidos + ' já existiam' : '') + '.', 'ok');
    } });
    b.disabled = !novos.length;
    alvo.appendChild(el('div', { class: 'botoes con-add-pag' }, [b]));
  }
  function renderPagadores() {
    var e = empresa(), alvo = $('pagadores'), alvoR = $('regras');
    alvo.innerHTML = ''; alvoR.innerHTML = '';
    if (!e) return;
    if (!e.pagadores.length) alvo.appendChild(el('p', { class: 'con-vazio', texto: 'Nenhum pagador cadastrado.' }));
    else {
      var tb = el('tbody');
      e.pagadores.forEach(function (p) {
        tb.appendChild(el('tr', {}, [
          el('td', { class: 'quebra', texto: p.nome }), el('td', { texto: p.papel || '' }),
          el('td', { class: 'quebra', texto: p.processo ? 'processo ' + p.processo : p.cliente }),
          el('td', { texto: p.cpf || '' }),
          el('td', {}, [el('button', { type: 'button', class: 'con-x', 'aria-label': 'Excluir ' + p.nome, texto: 'Excluir', onclick: function () {
            e.pagadores = e.pagadores.filter(function (x) { return x !== p; });
            salvar(); renderPagadores(); reconciliar();
          } })])
        ]));
      });
      alvo.appendChild(el('div', { class: 'tabela-rolagem con-tabela' }, [el('table', {}, [
        el('thead', {}, [el('tr', {}, ['Pagador', 'Quem é', 'Paga por', 'CPF/CNPJ', ''].map(function (t) { return el('th', { texto: t }); }))]), tb])]));
    }
    if (!e.regras.length) alvoR.appendChild(el('p', { class: 'con-vazio', texto: 'Nenhuma regra ainda. Ao confirmar um lançamento na revisão, use "Aprender" para criar uma.' }));
    else {
      var tr = el('tbody');
      e.regras.forEach(function (r) {
        tr.appendChild(el('tr', {}, [
          el('td', { class: 'quebra' }, ['Quando o histórico contém ', el('b', { texto: r.texto })]),
          el('td', { class: 'quebra', texto: r.processo ? 'processo ' + r.processo : r.cliente }),
          el('td', { texto: C.dataBR(r.criadaEm) }),
          el('td', {}, [el('button', { type: 'button', class: 'con-x', 'aria-label': 'Excluir regra ' + r.texto, texto: 'Excluir', onclick: function () {
            e.regras = e.regras.filter(function (x) { return x !== r; });
            salvar(); renderPagadores(); reconciliar();
          } })])
        ]));
      });
      alvoR.appendChild(el('div', { class: 'tabela-rolagem con-tabela' }, [el('table', {}, [
        el('thead', {}, [el('tr', {}, ['Regra', 'É de', 'Criada em', ''].map(function (t) { return el('th', { texto: t }); }))]), tr])]));
    }
  }

  // ---------- passo 5: conciliar e revisar ----------
  function motivoBloqueio() {
    if (!empresa()) return 'Cadastre a empresa no passo 1.';
    var ruins = [];
    ['extrato', 'receber', 'pagar'].forEach(function (q) {
      if (q === 'pagar' && !empresa().opcoes.saidas) return;
      arquivos[q].forEach(function (it) { if (!pronto(q, it)) ruins.push(it.nome); });
    });
    if (ruins.length) return 'Falta acertar: ' + ruins.join(', ') + ' (ou tire da lista).';
    if (!lancamentosCarregados().length) return 'Traga o extrato no passo 2.';
    if (!titulosCarregados().length) return 'Traga as contas a receber em aberto no passo 3.';
    return '';
  }
  function renderBotaoConciliar() {
    var m = motivoBloqueio();
    $('btn-conciliar').disabled = !!m;
    $('conciliar-motivo').textContent = m;
  }
  $('btn-conciliar').addEventListener('click', function () {
    jaConciliou = true;
    reconciliar();
    var s = $('passo-conciliar'); if (s.scrollIntoView) s.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  function reconciliar() {
    renderBotaoConciliar();
    if (!jaConciliou || motivoBloqueio()) { resultado = null; renderRevisao(); renderResultado(); return; }
    var e = empresa();
    var tits = titulosCarregados().filter(function (t) { return t.tipo === 'receber' || e.opcoes.saidas; });
    resultado = K.conciliar(lancamentosCarregados(), tits, e, decisoesDa());
    renderRevisao(); renderResultado();
  }

  var FILTROS = [['todos', 'Todos'], ['conferir', 'A conferir'], ['certo', 'Certos'], ['sempar', 'Sem par'], ['feitos', 'Já decididos']];
  var CLASSE = { certo: 'bom', confirmado: 'bom', provavel: 'meio', conferir: 'meio', sempar: 'ruim', nao: '' };
  function passaFiltro(it) {
    if (filtro === 'todos') return true;
    if (filtro === 'conferir') return it.status === 'provavel' || it.status === 'conferir';
    if (filtro === 'feitos') return it.status === 'confirmado' || it.status === 'nao';
    return it.status === filtro;
  }
  function renderRevisao() {
    var alvo = $('revisao');
    alvo.innerHTML = '';
    if (!resultado) {
      if (jaConciliou) alvo.appendChild(el('div', { class: 'nota atencao', texto: motivoBloqueio() }));
      else alvo.appendChild(el('p', { class: 'con-dica', texto: 'Quando o extrato e as contas a receber estiverem lidos, clique em Conciliar agora.' }));
      return;
    }
    var t = resultado.totais;
    alvo.appendChild(el('div', { class: 'cartoes con-cartoes' }, [
      cartao('Certos', t.certo + t.confirmado, 'bom', 'entram nas baixas'),
      cartao('A conferir', t.conferir, t.conferir ? 'meio' : '', t.provavel + ' prováveis e ' + t.conferirSo + ' com opções'),
      cartao('Sem par', t.semPar, t.semPar ? 'ruim' : '', C.brl(t.valorSemPar)),
      cartao('Não é de cliente', t.nao, '', 'marcados por você')
    ]));
    if (resultado.saidasFora) alvo.appendChild(el('p', { class: 'con-dica', texto: resultado.saidasFora + ' saídas do extrato ficaram de fora (para incluir, ligue a opção de conciliar saídas no passo 1).' }));
    var barra = el('div', { class: 'botoes con-filtros', role: 'group', 'aria-label': 'Mostrar' });
    FILTROS.forEach(function (f) {
      barra.appendChild(el('button', { type: 'button', class: 'btn' + (filtro === f[0] ? ' btn-forte' : ''), 'aria-pressed': filtro === f[0] ? 'true' : 'false', texto: f[1], onclick: function () { filtro = f[0]; renderRevisao(); } }));
    });
    if (t.provavel) barra.appendChild(el('button', { type: 'button', class: 'btn', texto: 'Confirmar todos os prováveis', onclick: function () {
      var d = decisoesDa(), n = 0;
      resultado.itens.forEach(function (it) { if (it.status === 'provavel' && it.sugestao) { d[it.lanc.id] = { tipo: 'confirmar', ids: it.sugestao.ids.slice() }; n++; } });
      reconciliar(); U.avisar(n + ' prováveis confirmados.', 'ok');
    } }));
    alvo.appendChild(barra);
    var lista = resultado.itens.filter(passaFiltro);
    if (!lista.length) { alvo.appendChild(el('p', { class: 'con-vazio', texto: 'Nada neste filtro.' })); return; }
    var ordem = { conferir: 0, provavel: 1, sempar: 2, certo: 3, confirmado: 4, nao: 5 };
    lista.slice().sort(function (a, b) { return ordem[a.status] - ordem[b.status] || (a.lanc.data < b.lanc.data ? -1 : a.lanc.data > b.lanc.data ? 1 : 0); })
      .forEach(function (it) { alvo.appendChild(cartaoItem(it)); });
  }
  function cartao(titulo, valor, cls, sub) {
    return el('div', { class: 'cartao ' + (cls || '') }, [el('small', { texto: titulo }), el('b', { texto: C.num(valor) }), el('span', { texto: sub })]);
  }
  function linhaTitulos(c) {
    return el('div', { class: 'con-titulos' }, c.titulos.map(function (t) { return el('div', { texto: K.rotuloTitulo(t) }); }));
  }
  function confirmar(it, ids) {
    decisoesDa()[it.lanc.id] = { tipo: 'confirmar', ids: ids.slice() };
    escolhendo[it.lanc.id] = false;
    aprender[it.lanc.id] = true;
    reconciliar();
  }
  function cartaoItem(it) {
    var l = it.lanc, ent = l.valor > 0;
    var card = el('article', { class: 'con-item st-' + it.status });
    card.appendChild(el('div', { class: 'con-item-topo' }, [
      el('span', { class: 'con-data', texto: C.dataBR(l.data) }),
      el('b', { class: 'con-valor' + (ent ? '' : ' neg'), texto: C.brl(l.valor) }),
      el('span', { class: 'selo ' + CLASSE[it.status], texto: K.ROTULO_STATUS[it.status] })
    ]));
    card.appendChild(el('div', { class: 'con-hist', texto: l.historico || '(sem histórico)' }));
    card.appendChild(el('div', { class: 'con-conta', texto: l.conta }));
    if (it.sugestao) card.appendChild(linhaTitulos(it.sugestao));
    card.appendChild(el('p', { class: 'con-motivo-item', texto: 'Por quê: ' + it.motivo }));
    var botoes = el('div', { class: 'botoes con-botoes' });
    var marcado = { ids: null };
    if (it.status === 'conferir' && it.candidatos.length) {
      var grupo = el('div', { class: 'con-opcoes-lista', role: 'radiogroup' });
      it.candidatos.forEach(function (c, i) {
        var r = el('input', { type: 'radio', name: 'op-' + l.id, value: String(i) });
        r.addEventListener('change', function () { marcado.ids = c.ids; btnOp.disabled = false; });
        grupo.appendChild(el('label', { class: 'con-opcao' }, [r, el('span', {}, [
          el('b', { texto: c.titulos.map(K.rotuloTitulo).join(' + ') }), el('small', { texto: c.motivo })])]));
      });
      card.appendChild(grupo);
      var btnOp = el('button', { type: 'button', class: 'btn btn-forte', texto: 'Confirmar a opção marcada', onclick: function () { if (marcado.ids) confirmar(it, marcado.ids); } });
      btnOp.disabled = true;
      botoes.appendChild(btnOp);
    }
    if ((it.status === 'certo' || it.status === 'provavel') && it.sugestao) {
      botoes.appendChild(el('button', { type: 'button', class: 'btn btn-forte', texto: 'Confirmar', onclick: function () { confirmar(it, it.sugestao.ids); } }));
    }
    if (it.status === 'confirmado' || it.status === 'nao') {
      botoes.appendChild(el('button', { type: 'button', class: 'btn', texto: 'Desfazer', onclick: function () {
        delete decisoesDa()[l.id]; aprender[l.id] = false; reconciliar();
      } }));
    }
    if ((it.status === 'certo' || it.status === 'confirmado') && !aprender[l.id]) {
      botoes.appendChild(el('button', { type: 'button', class: 'btn', texto: 'Aprender', onclick: function () { aprender[l.id] = true; renderRevisao(); } }));
    }
    if (it.status !== 'confirmado' && it.status !== 'nao') {
      botoes.appendChild(el('button', { type: 'button', class: 'btn', texto: it.status === 'sempar' ? 'Escolher um título' : 'Escolher outro', onclick: function () { escolhendo[l.id] = !escolhendo[l.id]; renderRevisao(); } }));
      botoes.appendChild(el('button', { type: 'button', class: 'btn', texto: ent ? 'Não é recebimento de cliente' : 'Não é conta a pagar', onclick: function () {
        decisoesDa()[l.id] = { tipo: 'nao' }; escolhendo[l.id] = false; reconciliar();
      } }));
    }
    card.appendChild(botoes);
    if (escolhendo[l.id] && it.status !== 'confirmado') card.appendChild(caixaEscolher(it));
    if (aprender[l.id] && (it.status === 'confirmado' || it.status === 'certo') && it.sugestao) card.appendChild(caixaAprender(it));
    return card;
  }
  function caixaEscolher(it) {
    var alvoV = Math.abs(it.lanc.valor), tipo = it.lanc.valor > 0 ? 'receber' : 'pagar';
    var proprios = it.sugestao ? it.sugestao.ids : [];
    var opcoes = resultado.abertos.filter(function (t) { return t.tipo === tipo && (!resultado.sugeridos[t.id] || proprios.indexOf(t.id) >= 0); })
      .sort(function (a, b) { return Math.abs(a.valor - alvoV) - Math.abs(b.valor - alvoV) || (a.vencimento < b.vencimento ? -1 : 1); });
    var sel = el('select', { 'aria-label': 'Título em aberto' });
    sel.appendChild(el('option', { value: '', texto: opcoes.length ? 'Escolha o título (os de valor mais perto vêm primeiro)' : 'Nenhum título livre' }));
    opcoes.slice(0, 300).forEach(function (t) { sel.appendChild(el('option', { value: t.id, texto: K.rotuloTitulo(t) })); });
    var b = el('button', { type: 'button', class: 'btn btn-forte', texto: 'Confirmar este título', onclick: function () { if (sel.value) confirmar(it, [sel.value]); } });
    return el('div', { class: 'con-escolher' }, [el('label', { class: 'campo' }, [el('span', { texto: 'Qual título este lançamento paga?' }), sel]), b]);
  }
  function caixaAprender(it) {
    var c = it.sugestao, t0 = c.titulos[0], e = empresa();
    var inp = el('input', { value: K.sugerirRegra(it.lanc, c), maxlength: '80', 'aria-label': 'Texto da regra' });
    var temProc = c.titulos.length === 1 && t0.documento;
    var rCli = el('input', { type: 'radio', name: 'ap-' + it.lanc.id, value: 'cliente', checked: 'checked' });
    var rProc = el('input', { type: 'radio', name: 'ap-' + it.lanc.id, value: 'processo' });
    var alvos = el('div', { class: 'con-opcoes-lista' }, [
      el('label', { class: 'con-opcao' }, [rCli, el('span', { texto: 'é do cliente ' + t0.cliente })]),
      temProc ? el('label', { class: 'con-opcao' }, [rProc, el('span', { texto: 'é só do processo ou documento ' + t0.documento })]) : null
    ]);
    var criar = el('button', { type: 'button', class: 'btn btn-forte', texto: 'Criar regra', onclick: function () {
      var porProc = temProc && rProc.checked;
      var r = K.novaRegra({ texto: inp.value, cliente: porProc ? '' : t0.cliente, processo: porProc ? t0.documento : '' });
      if (!r) { U.avisar('Escreva um pedaço do histórico com pelo menos 3 letras.', 'erro'); return; }
      if (!K.contemTexto(it.lanc.historico, r.texto)) { U.avisar('Esse texto não aparece no histórico deste lançamento. Use um pedaço dele.', 'erro'); return; }
      e.regras.push(r);
      aprender[it.lanc.id] = false;
      salvar(); renderPagadores(); renderAvisos(); reconciliar();
      U.avisar('Regra criada: quando o histórico contém "' + r.texto + '".', 'ok');
    } });
    var nao = el('button', { type: 'button', class: 'btn', texto: 'Agora não', onclick: function () { aprender[it.lanc.id] = false; renderRevisao(); } });
    return el('div', { class: 'con-aprender' }, [
      el('b', { texto: 'Aprender para a próxima vez' }),
      el('p', { class: 'con-dica', texto: 'Quando o histórico do banco contém este texto (pode editar, use um pedaço que se repete todo mês):' }),
      inp, alvos, el('div', { class: 'botoes' }, [criar, nao])
    ]);
  }

  // ---------- passo 6: resultado ----------
  function renderResultado() {
    var sec = $('passo-resultado'), alvo = $('resultado');
    sec.hidden = !resultado;
    alvo.innerHTML = '';
    if (!resultado) return;
    var t = resultado.totais;
    alvo.appendChild(el('div', { class: 'cartoes' }, [
      el('div', { class: 'cartao bom' }, [el('small', { texto: 'Conciliados' }), el('b', { texto: C.brl(t.valorConciliado) }), el('span', { texto: t.conciliados + ' lançamentos' })]),
      el('div', { class: 'cartao' + (t.conferir ? ' meio' : '') }, [el('small', { texto: 'A conferir' }), el('b', { texto: C.brl(t.valorConferir) }), el('span', { texto: t.conferir + ' lançamentos' })]),
      el('div', { class: 'cartao' + (t.semPar ? ' ruim' : '') }, [el('small', { texto: 'Sem par' }), el('b', { texto: C.brl(t.valorSemPar) }), el('span', { texto: t.semPar + ' lançamentos' })]),
      el('div', { class: 'cartao' }, [el('small', { texto: 'Títulos ainda em aberto' }), el('b', { texto: C.brl(t.valorAbertos) }), el('span', { texto: t.abertos + ' títulos' })])
    ]));
    alvo.appendChild(el('div', { class: 'botoes con-baixar' }, [el('button', { type: 'button', class: 'btn btn-forte', texto: 'Baixar em Excel', onclick: function () {
      var e = empresa();
      U.baixarExcel('conciliacao-' + U.nomeArquivo(e ? e.nome : 'empresa') + '-' + hoje() + '.xlsx', K.planilhaResultado(resultado, e ? e.nome : ''));
    } })]));
    alvo.appendChild(el('div', { class: 'nota info', texto: 'A aba Baixas tem só os certos e os que você confirmou: data do crédito, valor, cliente, título e motivo. A baixa no Conta Azul (ou no sistema da empresa) é feita por você; a ferramenta só aponta o par. Os prováveis ficam na aba A conferir até você confirmar.' }));
  }

  // ---------- backup e regras ----------
  $('btn-backup').addEventListener('click', function () {
    estado.ultimoBackup = new Date().toISOString();
    salvar();
    U.baixar('backup-conciliacao-' + hoje() + '.json', JSON.stringify(K.criarBackup(estado), null, 2), 'application/json');
    renderAvisos();
    U.avisar('Backup baixado. Guarde o arquivo num lugar seguro (Drive, OneDrive, e-mail).', 'ok');
  });
  $('btn-restaurar').addEventListener('click', function () {
    U.escolherArquivo('.json,application/json').then(function (arq) {
      if (!arq) return;
      return U.lerJSON(arq).then(function (obj) {
        var novo = K.lerBackup(obj);
        if (estado.empresas.length && !window.confirm('Restaurar o backup troca os dados de agora (' + estado.empresas.length + ' empresas) pelos do arquivo (' + novo.empresas.length + ' empresas). Continuar?')) return;
        estado = novo; decisoes = {}; aprender = {}; escolhendo = {};
        salvar(); renderTudo(); reconciliar();
        U.avisar('Backup restaurado: ' + novo.empresas.length + ' empresas.', 'ok');
      });
    }).catch(function (e) { U.avisar(e.message, 'erro'); });
  });
  $('btn-exportar').addEventListener('click', function () {
    var e = empresa(); if (!e) return;
    U.baixar('regras-conciliacao-' + U.nomeArquivo(e.nome) + '.json', JSON.stringify(K.exportarRegras(e), null, 2), 'application/json');
    U.avisar('Arquivo com ' + e.pagadores.length + ' pagadores e ' + e.regras.length + ' regras baixado. Quem receber usa Importar regras.', 'ok');
  });
  $('btn-importar').addEventListener('click', function () {
    var e = empresa(); if (!e) return;
    U.escolherArquivo('.json,application/json').then(function (arq) {
      if (!arq) return;
      return U.lerJSON(arq).then(function (obj) {
        if (obj && obj.ferramenta === 'conciliacao-inteligente') throw new Error('Esse arquivo é um backup completo. Use Restaurar backup.');
        var r = K.importarRegras(e, obj);
        salvar(); renderPagadores(); renderAvisos(); reconciliar();
        U.avisar('Importado em "' + e.nome + '": ' + r.pagadores + ' pagadores e ' + r.regras + ' regras' + (r.repetidos ? ' (' + r.repetidos + ' já existiam)' : '') + '.', 'ok');
      });
    }).catch(function (err) { U.avisar(err.message, 'erro'); });
  });

  function renderTudo() {
    renderAvisos();
    renderEmpresas();
    renderPagadores();
    renderListaClientes();
    reconciliar();
  }
  renderTudo();
})();

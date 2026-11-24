/* Painel da coordenação, a tela. Precisa de xlsx, comum.js, ui.js e coordenacao-logica.js antes. */
(function () {
  'use strict';
  var C = window.Comum, U = window.UI, K = window.Coordenacao;
  var el = U.el, esc = U.esc;
  var $ = function (id) { return document.getElementById(id); };

  var estado = K.normalizar(C.recuperar(K.CHAVE, null));
  var guarda = U.navegadorGuarda();
  var ref = K.hojeIso();
  var filtro = { assistenteId: '', situacao: '' };
  var aberta = null;      // empresa aberta no detalhe
  var pendentes = [];     // arquivos lidos esperando para guardar
  var carteira = null;    // planilha da carteira esperando para importar

  function salvar() {
    if (!C.guardar(K.CHAVE, estado) && guarda) U.avisar('Não consegui salvar neste navegador. Salve um backup.', 'erro');
  }
  function nomeAssistente(id) { var a = id ? K.assistente(estado, id) : null; return a ? a.nome : ''; }
  function porNome(a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); }
  function plural(n, um, varios) { return C.num(n) + ' ' + (n === 1 ? um : varios); }
  function opcoesAssistente(sel, atual, textoVazio) {
    sel.innerHTML = '';
    sel.appendChild(el('option', { value: '', texto: textoVazio || 'Sem responsável' }));
    estado.assistentes.slice().sort(porNome).forEach(function (a) { sel.appendChild(el('option', { value: a.id, texto: a.nome })); });
    sel.value = atual && K.assistente(estado, atual) ? atual : '';
  }

  // ---------- avisos do topo ----------
  function renderAvisos() {
    var alvo = $('avisos-topo');
    alvo.innerHTML = '';
    if (!guarda) {
      alvo.appendChild(el('div', { class: 'nota erro', html: '<b>Este navegador não está guardando os dados</b> (modo anônimo ou bloqueado). Nada fica salvo quando você fechar a página. Use <b>Salvar backup</b> antes de sair.' }));
    }
    if (estado.empresas.length) {
      var dias = K.diasDesde(estado.ultimoBackup);
      if (dias == null) alvo.appendChild(el('div', { class: 'nota info', texto: 'Dica: você ainda não salvou nenhum backup. Ele guarda tudo num arquivo, para não perder se o navegador for limpo, e serve para passar o painel para outra pessoa.' }));
      else if (dias > 7) alvo.appendChild(el('div', { class: 'nota info', texto: 'Seu último backup foi há ' + dias + ' dias. Vale salvar um novo.' }));
    }
  }

  // ---------- passo 1: equipe e carteira ----------
  $('form-assistente').addEventListener('submit', function (e) {
    e.preventDefault();
    var nome = $('nova-assistente').value.trim();
    if (!nome) { U.avisar('Escreva o nome da assistente.', 'erro'); return; }
    if (estado.assistentes.some(function (a) { return C.simples(a.nome) === C.simples(nome); })) { U.avisar('"' + nome + '" já está na equipe.'); return; }
    var a = K.adicionarAssistente(estado, nome);
    salvar();
    $('nova-assistente').value = '';
    renderTudo();
    $('nova-empresa-assistente').value = a.id;
    U.avisar('Assistente "' + a.nome + '" cadastrada.', 'ok');
  });
  $('form-empresa').addEventListener('submit', function (e) {
    e.preventDefault();
    try {
      var emp = K.adicionarEmpresa(estado, $('nova-empresa').value, $('nova-empresa-assistente').value || null);
      salvar();
      $('nova-empresa').value = '';
      renderTudo();
      U.avisar('Empresa "' + emp.nome + '" cadastrada.', 'ok');
    } catch (err) { U.avisar(err.message, 'erro'); }
  });

  function renderEquipe() {
    var sel = $('nova-empresa-assistente');
    opcoesAssistente(sel, sel.value, 'Sem responsável por enquanto');
    $('resumo-carteira').textContent = 'Ver e editar a equipe e a carteira (' + plural(estado.assistentes.length, 'assistente', 'assistentes') + ', ' + plural(estado.empresas.length, 'empresa', 'empresas') + ')';
    var alvo = $('lista-equipe');
    alvo.innerHTML = '';

    alvo.appendChild(el('h3', { texto: 'Equipe' }));
    var eq = el('div', { class: 'co-equipe' });
    if (!estado.assistentes.length) eq.appendChild(el('p', { class: 'co-dica', texto: 'Nenhuma assistente ainda.' }));
    estado.assistentes.slice().sort(porNome).forEach(function (a) {
      var n = estado.empresas.filter(function (e) { return e.assistenteId === a.id; }).length;
      var inp = el('input', { value: a.nome, maxlength: '80', 'aria-label': 'Nome da assistente ' + a.nome });
      inp.addEventListener('change', function () {
        var t = inp.value.replace(/\s+/g, ' ').trim();
        if (!t) { inp.value = a.nome; return; }
        if (estado.assistentes.some(function (x) { return x !== a && C.simples(x.nome) === C.simples(t); })) { U.avisar('Já tem uma assistente com esse nome.', 'erro'); inp.value = a.nome; return; }
        a.nome = t; salvar(); renderTudo();
      });
      eq.appendChild(el('div', { class: 'co-pessoa' }, [inp, el('small', { texto: plural(n, 'empresa', 'empresas') }),
        el('button', { type: 'button', class: 'co-x', texto: 'Excluir', 'aria-label': 'Excluir ' + a.nome, onclick: function () {
          if (!window.confirm('Excluir "' + a.nome + '" da equipe?' + (n ? ' As ' + plural(n, 'empresa', 'empresas') + ' dela ficam sem responsável.' : ''))) return;
          K.excluirAssistente(estado, a.id);
          if (filtro.assistenteId === a.id) filtro.assistenteId = '';
          salvar(); renderTudo();
        } })]));
    });
    alvo.appendChild(eq);

    alvo.appendChild(el('h3', { texto: 'Carteira' }));
    if (!estado.empresas.length) { alvo.appendChild(el('p', { class: 'co-dica', texto: 'Nenhuma empresa ainda.' })); return; }
    var tbody = el('tbody');
    estado.empresas.slice().sort(porNome).forEach(function (emp) {
      var inp = el('input', { value: emp.nome, maxlength: '80', 'aria-label': 'Apelido de ' + emp.nome });
      inp.addEventListener('change', function () {
        var t = inp.value.replace(/\s+/g, ' ').trim();
        if (!t) { inp.value = emp.nome; return; }
        var outra = K.acharEmpresaPorNome(estado, t);
        if (outra && outra !== emp) { U.avisar('Já tem uma empresa com esse nome.', 'erro'); inp.value = emp.nome; return; }
        emp.nome = t; salvar(); renderTudo();
      });
      var sel = el('select', { 'aria-label': 'Assistente de ' + emp.nome });
      opcoesAssistente(sel, emp.assistenteId);
      sel.addEventListener('change', function () { emp.assistenteId = sel.value || null; salvar(); renderTudo(); });
      tbody.appendChild(el('tr', {}, [el('td', {}, [inp]), el('td', {}, [sel]),
        el('td', {}, [el('button', { type: 'button', class: 'co-x', texto: 'Excluir', 'aria-label': 'Excluir ' + emp.nome, onclick: function () {
          if (!window.confirm('Excluir "' + emp.nome + '" e os relatórios guardados dela? Isso não tem volta (a não ser por um backup).')) return;
          K.excluirEmpresa(estado, emp.id);
          if (aberta === emp.id) aberta = null;
          salvar(); renderTudo();
        } })])]));
    });
    alvo.appendChild(el('div', { class: 'tabela-rolagem' }, [el('table', { class: 'co-carteira' }, [
      el('thead', { html: '<tr><th>Empresa</th><th>Assistente</th><th></th></tr>' }), tbody])]));
  }

  // importar carteira
  $('area-carteira').appendChild(U.areaArquivo({
    titulo: 'Arraste a planilha da carteira aqui',
    dica: 'ou clique para escolher. Excel (.xlsx, .xls) ou CSV com as colunas Empresa e Assistente.',
    aoReceber: function (lista) {
      var arq = lista[0];
      U.lerArquivo(arq).then(function (abas) {
        if (!abas.length) throw new Error('"' + arq.name + '" está vazio.');
        var melhor = 0;
        abas.forEach(function (a, i) { if (a.linhas.length > abas[melhor].linhas.length) melhor = i; });
        var linhas = abas[melhor].linhas, lc = K.lerCarteira(linhas);
        carteira = { nome: arq.name, linhas: linhas, inicio: lc.inicio, cabecalho: lc.cabecalho, escolha: lc.escolha };
        renderCarteira();
      }).catch(function (e) { U.avisar(e.message, 'erro'); });
    }
  }));
  function renderCarteira() {
    var alvo = $('carteira-pendente');
    alvo.innerHTML = '';
    if (!carteira) return;
    var caixa = el('div', { class: 'co-arquivo' });
    caixa.appendChild(el('div', { class: 'co-arquivo-topo' }, [el('b', { texto: carteira.nome }),
      el('button', { type: 'button', class: 'btn', texto: 'Cancelar', onclick: function () { carteira = null; renderCarteira(); } })]));
    var inCab = el('input', { type: 'number', min: '1', max: String(carteira.linhas.length), value: String(carteira.inicio + 1), inputmode: 'numeric' });
    inCab.addEventListener('change', function () {
      var n = Math.max(1, Math.min(carteira.linhas.length, Math.round(Number(inCab.value) || 1))) - 1;
      carteira.inicio = n;
      carteira.cabecalho = (carteira.linhas[n] || []).map(function (v) { return String(v == null ? '' : v); });
      carteira.escolha = C.detectarColunas(carteira.cabecalho, K.CAMPOS_CARTEIRA);
      renderCarteira();
    });
    caixa.appendChild(el('div', { class: 'linha-campos' }, [el('label', { class: 'campo' }, [el('span', { texto: 'Linha dos títulos das colunas' }), inCab])]));
    var mapa = el('div'), res = el('div', { class: 'co-resultado' });
    caixa.appendChild(mapa); caixa.appendChild(res);
    var botao = el('button', { type: 'button', class: 'btn btn-forte', texto: 'Importar a carteira' });
    caixa.appendChild(el('div', { class: 'botoes', style: 'margin-top:10px' }, [botao]));
    function linhasValidas() {
      return C.linhasComCampos(carteira.linhas, carteira.inicio, carteira.escolha).filter(function (o) { return !C.vazio(o.empresa) && !C.pareceTotal([o.empresa]); });
    }
    function atualizar() {
      res.innerHTML = '';
      var falta = C.faltando(carteira.escolha, K.CAMPOS_CARTEIRA);
      botao.disabled = !!falta.length;
      if (falta.length) { res.appendChild(el('div', { class: 'nota erro', texto: 'Escolha qual coluna tem o nome da empresa.' })); return; }
      var ls = linhasValidas();
      var novas = ls.filter(function (o) { return !K.acharEmpresaPorNome(estado, o.empresa); }).length;
      res.appendChild(el('p', { class: 'co-dica', texto: 'Achei ' + plural(ls.length, 'empresa', 'empresas') + ' (' + plural(novas, 'nova', 'novas') + '). ' +
        (carteira.escolha.assistente < 0 ? 'Sem coluna de assistente: as empresas entram sem responsável.' : '') }));
      if (ls.length) res.appendChild(el('details', { class: 'co-ignoradas' }, [el('summary', { texto: 'Ver a lista' }),
        el('ul', {}, ls.slice(0, 200).map(function (o) { return el('li', { texto: String(o.empresa) + (C.vazio(o.assistente) ? '' : ': ' + o.assistente) }); }))]));
      botao.disabled = !ls.length;
    }
    U.mapeador(mapa, carteira.cabecalho, K.CAMPOS_CARTEIRA, carteira.escolha, carteira.linhas.slice(carteira.inicio + 1, carteira.inicio + 6), atualizar);
    atualizar();
    botao.addEventListener('click', function () {
      var r = K.importarCarteira(estado, linhasValidas());
      carteira = null;
      salvar(); renderCarteira(); renderTudo();
      $('bloco-carteira').open = true;
      U.avisar('Carteira importada: ' + plural(r.novas, 'empresa nova', 'empresas novas') + ', ' + plural(r.atualizadas, 'troca de responsável', 'trocas de responsável') + ', ' + plural(r.novasAssistentes, 'assistente nova', 'assistentes novas') + '.', 'ok');
    });
    alvo.appendChild(caixa);
  }

  // ---------- passo 2: relatórios ----------
  $('area-arquivos').appendChild(U.areaArquivo({
    titulo: 'Arraste os relatórios aqui',
    dica: 'ou clique para escolher. Excel (.xlsx, .xls) ou CSV. Pode ser mais de um, de empresas diferentes.',
    varios: true,
    aoReceber: receberArquivos
  }));
  function receberArquivos(lista) {
    if (!estado.empresas.length) { U.avisar('Cadastre as empresas no passo 1 primeiro.', 'erro'); return; }
    Promise.all(lista.map(function (arq) {
      var item = { chave: C.id(), nome: arq.name };
      return U.lerArquivo(arq).then(function (abas) {
        if (!abas.length) throw new Error('"' + arq.name + '" está vazio.');
        var p = K.prepararArquivo(abas, arq.name, estado.empresas);
        item.abas = abas; item.abaIdx = p.abaIdx; item.prep = p.prep; item.empresaId = p.empresaId;
        return item;
      }).catch(function (e) { item.erro = e.message; return item; });
    })).then(function (itens) {
      itens.forEach(function (it) {
        pendentes = pendentes.filter(function (p) { return p.nome !== it.nome; });
        pendentes.push(it);
      });
      renderPendentes();
    });
  }
  function faltam(it) { return it.prep.tipo ? K.faltandoColunas(it.prep.escolha, it.prep.tipo) : []; }
  function contagem(it) { var r = it.prep.resultado; return r.pagar.length + r.receber.length + r.conc.pendentes + r.conc.conciliados; }
  function motivoNaoPronto(it) {
    if (it.erro) return 'erro';
    if (!it.empresaId || !K.empresa(estado, it.empresaId)) return 'Escolha a empresa.';
    if (!it.prep.tipo) return 'Diga se é contas a pagar ou a receber.';
    if (faltam(it).length) return 'Escolha a coluna: ' + faltam(it).join(', ') + '.';
    if (!contagem(it) && it.prep.resultado.lidas === 0) return 'Não achei linhas neste arquivo.';
    return '';
  }
  function itemPronto(it) { return !motivoNaoPronto(it); }

  function renderPendentes() {
    var alvo = $('pendentes');
    alvo.innerHTML = '';
    pendentes.forEach(function (it) { alvo.appendChild(blocoPendente(it)); });
    renderBotaoGuardar();
  }
  function rotuloTipo(t) { return K.TIPOS[t]; }
  function blocoPendente(it) {
    var caixa = el('div', { class: 'co-arquivo' + (it.erro ? ' com-erro' : '') });
    caixa.appendChild(el('div', { class: 'co-arquivo-topo' }, [el('b', { texto: it.nome }),
      el('button', { type: 'button', class: 'btn', texto: 'Tirar da lista', onclick: function () {
        pendentes = pendentes.filter(function (p) { return p !== it; });
        renderPendentes();
      } })]));
    if (it.erro) { caixa.appendChild(el('div', { class: 'nota erro', texto: it.erro })); return caixa; }
    var linhas = it.abas[it.abaIdx].linhas;

    var campos = el('div', { class: 'linha-campos' });
    var selEmp = el('select', { 'aria-label': 'Empresa do arquivo ' + it.nome });
    selEmp.appendChild(el('option', { value: '', texto: 'Escolha a empresa' }));
    estado.empresas.slice().sort(porNome).forEach(function (e) { selEmp.appendChild(el('option', { value: e.id, texto: e.nome })); });
    selEmp.value = it.empresaId && K.empresa(estado, it.empresaId) ? it.empresaId : '';
    selEmp.addEventListener('change', function () { it.empresaId = selEmp.value || null; renderPendentes(); });
    campos.appendChild(el('label', { class: 'campo' }, [el('span', { texto: 'Empresa' + (it.empresaId ? '' : ' (não reconheci pelo nome)') }), selEmp]));

    var selTipo = el('select', { 'aria-label': 'O que é o arquivo ' + it.nome });
    selTipo.appendChild(el('option', { value: '', texto: 'Escolha' }));
    Object.keys(K.TIPOS).forEach(function (t) { selTipo.appendChild(el('option', { value: t, texto: K.TIPOS[t] })); });
    selTipo.value = it.prep.tipo || '';
    selTipo.addEventListener('change', function () { it.prep = K.refazer(it.prep, linhas, null, selTipo.value || null); renderPendentes(); });
    campos.appendChild(el('label', { class: 'campo' }, [el('span', { texto: 'O que é este arquivo' }), selTipo]));

    if (it.abas.length > 1) {
      var selAba = el('select', { 'aria-label': 'Aba da planilha' }, it.abas.map(function (a, i) { return el('option', { value: String(i), texto: a.nome }); }));
      selAba.value = String(it.abaIdx);
      selAba.addEventListener('change', function () {
        it.abaIdx = Number(selAba.value);
        it.prep = K.prepararAba(it.abas[it.abaIdx].linhas, it.nome, it.prep.tipo);
        renderPendentes();
      });
      campos.appendChild(el('label', { class: 'campo' }, [el('span', { texto: 'Aba usada' }), selAba]));
    }
    var inCab = el('input', { type: 'number', min: '1', max: String(linhas.length), value: String(it.prep.inicio + 1), inputmode: 'numeric' });
    inCab.addEventListener('change', function () {
      var n = Math.max(1, Math.min(linhas.length, Math.round(Number(inCab.value) || 1))) - 1;
      it.prep = K.refazer(it.prep, linhas, n);
      renderPendentes();
    });
    campos.appendChild(el('label', { class: 'campo' }, [el('span', { texto: 'Linha dos títulos das colunas' }), inCab]));
    caixa.appendChild(campos);

    if (!it.prep.tipo) {
      caixa.appendChild(el('div', { class: 'nota atencao', texto: 'Não consegui saber pelo nome do arquivo se é contas a pagar ou a receber. Escolha acima em "O que é este arquivo".' }));
      return caixa;
    }
    var mapa = el('div'), resultado = el('div', { class: 'co-resultado' });
    caixa.appendChild(el('p', { class: 'co-dica', texto: it.prep.tipo === 'conciliacao' ? 'Confira a coluna da situação da conciliação.' : 'Confira as colunas que eu achei. Vencimento e Valor são obrigatórias.' }));
    caixa.appendChild(mapa);
    caixa.appendChild(resultado);
    function atualizar() {
      it.prep.resultado = K.processar(linhas, it.prep.inicio, it.prep.escolha, it.prep.tipo);
      resultado.innerHTML = '';
      caixa.classList.toggle('pronto', itemPronto(it));
      var f = faltam(it);
      if (f.length) {
        resultado.appendChild(el('div', { class: 'nota erro', texto: 'Escolha a coluna ' + f.join(' e ') + '. Sem ela não dá para montar o painel.' }));
        renderBotaoGuardar();
        return;
      }
      resultado.appendChild(resumoArquivo(it));
      renderBotaoGuardar();
    }
    U.mapeador(mapa, it.prep.cabecalho, K.camposDoTipo(it.prep.tipo), it.prep.escolha, linhas.slice(it.prep.inicio + 1, it.prep.inicio + 6), atualizar);
    atualizar();
    return caixa;
  }
  function resumoArquivo(it) {
    var r = it.prep.resultado, t = it.prep.tipo, box = el('div');
    var emp = K.empresa(estado, it.empresaId);
    if (t === 'conciliacao') {
      box.appendChild(el('div', { class: 'nota ' + (r.conc.pendentes ? 'atencao' : 'ok'), texto: plural(r.conc.pendentes, 'lançamento pendente', 'lançamentos pendentes') + ' de conciliação e ' + plural(r.conc.conciliados, 'conciliado', 'conciliados') + '. Ao guardar, o número de pendências da empresa passa a ser ' + C.num(r.conc.pendentes) + '.' }));
    } else {
      var lis = [];
      (t === 'ambos' ? ['pagar', 'receber'] : [t]).forEach(function (k) {
        var lista = r[k], venc = lista.filter(function (x) { return x.venc < ref; });
        var soma = C.soma(venc, function (x) { return x.valor; });
        lis.push(el('li', { texto: plural(lista.length, 'conta ' + (k === 'pagar' ? 'a pagar' : 'a receber') + ' em aberto', 'contas ' + (k === 'pagar' ? 'a pagar' : 'a receber') + ' em aberto') +
          (venc.length ? ', ' + plural(venc.length, 'vencida', 'vencidas') + ' em ' + C.dataBR(ref) + ' (' + C.brl(soma) + ')' : ', nenhuma vencida em ' + C.dataBR(ref)) }));
        if (emp && emp.cargas[k]) lis.push(el('li', { texto: 'Vai substituir o relatório de ' + (k === 'pagar' ? 'contas a pagar' : 'contas a receber') + ' guardado em ' + C.dataBR(emp.cargas[k].atualizadoEm) + '.' }));
      });
      box.appendChild(el('div', { class: 'nota ok' }, [el('ul', {}, lis)]));
      if (r.semSituacao) box.appendChild(el('div', { class: 'nota atencao', texto: 'Não achei a coluna Situação (Pago, Em aberto...). Considerei tudo em aberto' + (r.usaAberto ? ', menos o que tem Valor em aberto zerado' : '') + '. Se o relatório já veio só com as contas em aberto, está certo. Se não, escolha a coluna Situação acima.' }));
      var desc = Object.keys(r.desconhecidas);
      if (desc.length) box.appendChild(el('div', { class: 'nota atencao', texto: 'Situações que eu não conheço e considerei em aberto: ' + desc.map(function (d) { return '"' + d + '" (' + r.desconhecidas[d] + ')'; }).join(', ') + '.' }));
    }
    box.appendChild(blocoIgnoradas(r, t));
    // outro arquivo da mesma empresa e tipo na lista
    var dup = pendentes.filter(function (p) { return p !== it && !p.erro && p.empresaId && p.empresaId === it.empresaId && p.prep && (p.prep.tipo === t || (p.prep.tipo === 'ambos' && t !== 'conciliacao') || (t === 'ambos' && p.prep.tipo !== 'conciliacao' && p.prep.tipo)); });
    if (dup.length) box.appendChild(el('div', { class: 'nota atencao', texto: 'Tem outro arquivo do mesmo tipo para esta empresa na lista (' + dup.map(function (d) { return d.nome; }).join(', ') + '). Só o último da lista fica guardado. Tire o que não for usar.' }));
    return box;
  }
  function blocoIgnoradas(r, tipo) {
    var ig = r.ignoradas, guardadas = r.pagar.length + r.receber.length;
    var tot = Object.keys(ig).reduce(function (s, k) { return s + ig[k]; }, 0);
    var resumo = 'Li ' + plural(r.lidas, 'linha', 'linhas') + ': ' + (tipo === 'conciliacao' ? C.num(r.conc.pendentes + r.conc.conciliados) + ' contadas' : C.num(guardadas) + ' guardadas') + ' e ' + C.num(tot) + ' ignoradas.';
    if (!tot) return el('p', { class: 'co-dica', texto: resumo });
    var itens = [];
    function linha(qtd, motivo, exemplos) {
      if (!qtd) return;
      var li = el('li', {}, [C.num(qtd) + ' ' + motivo]);
      if (exemplos && exemplos.length) li.appendChild(el('ul', {}, exemplos.map(function (x) { return el('li', { texto: x }); })));
      itens.push(li);
    }
    linha(ig.pago, 'já pagas ou recebidas', r.exemplos.pago);
    linha(ig.cancelado, 'canceladas', r.exemplos.cancelado);
    linha(ig.total, 'linhas de total', r.exemplos.total);
    linha(ig.semData, 'sem vencimento que dê para entender', r.exemplos.semData);
    linha(ig.semValor, 'sem valor ou com valor zero', r.exemplos.semValor);
    linha(ig.semTipo, 'sem dizer se é a pagar ou a receber', r.exemplos.semTipo);
    linha(ig.semConc, 'sem a situação da conciliação', r.exemplos.semConc);
    return el('details', { class: 'co-ignoradas' }, [el('summary', { texto: resumo + ' Ver por quê' }), el('ul', {}, itens)]);
  }
  function renderBotaoGuardar() {
    $('sem-empresa').hidden = estado.empresas.length > 0;
    var bloco = $('guardar-bloco');
    bloco.hidden = !pendentes.length;
    if (!pendentes.length) return;
    var ruins = pendentes.filter(function (p) { return !itemPronto(p); });
    $('btn-guardar').disabled = !!ruins.length;
    $('btn-guardar').textContent = 'Guardar ' + (pendentes.length === 1 ? 'o relatório' : 'os ' + pendentes.length + ' relatórios');
    $('guardar-motivo').textContent = ruins.length ? 'Falta acertar ' + (ruins.length === 1 ? '1 arquivo' : ruins.length + ' arquivos') + ' (ou tire da lista).' : '';
  }
  $('btn-limpar').addEventListener('click', function () { pendentes = []; renderPendentes(); });
  $('btn-guardar').addEventListener('click', function () {
    if (pendentes.some(function (p) { return !itemPronto(p); })) return;
    var hoje = K.hojeIso(), empresas = {}, n = 0;
    pendentes.forEach(function (it) {
      var emp = K.empresa(estado, it.empresaId);
      K.guardarCarga(emp, it.prep.tipo, it.prep.resultado, it.nome, hoje);
      empresas[emp.id] = true; n++;
    });
    pendentes = [];
    salvar();
    renderPendentes();
    renderTudo();
    U.avisar(plural(n, 'relatório guardado', 'relatórios guardados') + ' em ' + plural(Object.keys(empresas).length, 'empresa', 'empresas') + '.', 'ok');
    var p = $('passo-painel'); if (p.scrollIntoView) p.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  // ---------- regras e data de referência ----------
  var CHAVES_REGRAS = Object.keys(K.REGRAS_PADRAO);
  function renderRegras() {
    var rg = K.regrasDe(estado);
    CHAVES_REGRAS.forEach(function (k) { $('r-' + k).value = rg[k] == null ? '' : String(rg[k]); });
  }
  CHAVES_REGRAS.forEach(function (k) {
    $('r-' + k).addEventListener('change', function () {
      var t = $('r-' + k).value.trim();
      var v = t === '' ? null : K.numOuNulo(t);
      if (t !== '' && (v == null || v < 0)) { U.avisar('Use um número, zero ou mais. Deixe vazio para desligar a regra.', 'erro'); renderRegras(); return; }
      estado.regras = K.regrasDe(estado);
      estado.regras[k] = v == null ? null : Math.round(v);
      salvar(); renderPainel(); renderDetalhe();
    });
  });
  $('btn-regras-padrao').addEventListener('click', function () {
    estado.regras = JSON.parse(JSON.stringify(K.REGRAS_PADRAO));
    salvar(); renderRegras(); renderPainel(); renderDetalhe();
  });
  function renderRef() {
    $('data-ref').value = ref;
    var hoje = K.hojeIso();
    $('texto-ref').textContent = ref === hoje ? 'Vencido é o que venceu antes de hoje. Próximos 7 dias: de hoje até ' + C.dataBR(K.somarDias(ref, 7)) + '.'
      : 'Atenção: o painel está olhando para ' + C.dataBR(ref) + ', não para hoje. Próximos 7 dias: até ' + C.dataBR(K.somarDias(ref, 7)) + '.';
    $('btn-hoje').hidden = ref === hoje;
  }
  $('data-ref').addEventListener('change', function () {
    var v = $('data-ref').value;
    ref = v && C.data(v) ? C.data(v) : K.hojeIso();
    renderRef(); renderPendentes(); renderPainel(); renderDetalhe();
  });
  $('btn-hoje').addEventListener('click', function () { ref = K.hojeIso(); renderRef(); renderPendentes(); renderPainel(); renderDetalhe(); });

  // ---------- painel ----------
  var CLASSE_SELO = { urgente: 'ruim', atencao: 'meio', emdia: 'bom' };
  function selo(s) { return '<span class="selo ' + CLASSE_SELO[s] + '">' + esc(K.NOME_SITUACAO[s]) + '</span>'; }
  function cartao(titulo, valor, sub, cls) {
    return '<div class="cartao' + (cls ? ' ' + cls : '') + '"><small>' + esc(titulo) + '</small><b>' + esc(valor) + '</b><span>' + esc(sub || '') + '</span></div>';
  }
  function vencidoCelula(v) {
    if (!v.qtd) return '<span class="verde">nenhum</span>';
    return '<span class="vermelho">' + esc(C.brl(v.valor)) + '</span><small>' + esc(plural(v.qtd, 'conta', 'contas')) + ', a mais antiga há ' + esc(plural(v.maiorAtraso, 'dia', 'dias')) + '</small>';
  }
  function renderPainel() {
    var alvo = $('painel');
    alvo.innerHTML = '';
    if (!estado.empresas.length) {
      alvo.innerHTML = '<div class="nota info">Nenhuma empresa ainda. Cadastre a equipe e a carteira no passo 1, ou use <b>Restaurar backup</b> com o arquivo de exemplo da pasta exemplos/coordenacao para ver como fica.</div>';
      return;
    }
    var todas = K.resumos(estado, ref);
    var g = K.somar(todas, K.regrasDe(estado));
    alvo.appendChild(el('div', { class: 'cartoes', html:
      cartao('Empresas', C.num(g.empresas), g.urgente + ' urgentes, ' + g.atencao + ' em atenção, ' + g.emdia + ' em dia', g.urgente ? 'ruim' : g.atencao ? 'meio' : 'bom') +
      cartao('Vencidos a pagar', C.brl(g.pagarVencido.valor), plural(g.pagarVencido.qtd, 'conta', 'contas'), g.pagarVencido.qtd ? 'ruim' : 'bom') +
      cartao('Vencidos a receber', C.brl(g.receberVencido.valor), plural(g.receberVencido.qtd, 'conta', 'contas'), g.receberVencido.qtd ? 'ruim' : 'bom') +
      cartao('Vencem nos próximos 7 dias', C.num(g.proximos.qtd), C.brl(g.proximos.pagarValor) + ' a pagar, ' + C.brl(g.proximos.receberValor) + ' a receber') +
      cartao('Conciliações pendentes', C.num(g.pendencias), g.empresasComPendencia ? 'lançamentos em ' + plural(g.empresasComPendencia, 'empresa', 'empresas') : 'nenhum lançamento informado', g.pendencias ? 'meio' : 'bom') +
      cartao('Sem atualização', C.num(g.desatualizadas), 'empresas sem relatório novo há mais de ' + g.limiteAtualizacao + ' dias', g.desatualizadas ? 'meio' : 'bom')
    }));

    // por assistente
    var pa = K.porAssistente(estado, ref).filter(function (s) { return s.empresas || s.id !== '_sem'; });
    var h = '<div class="co-secao"><h3>Por assistente</h3><div class="tabela-rolagem"><table class="co-painel"><thead><tr><th>Assistente</th><th class="n">Empresas</th><th>Situação</th>' +
      '<th class="n">A pagar vencido</th><th class="n">A receber vencido</th><th class="n">Próximos 7 dias</th><th class="n">Pendências de conciliação</th><th class="n">Sem atualização</th></tr></thead><tbody>';
    pa.forEach(function (s) {
      h += '<tr class="' + (s.urgente ? 'urgente' : s.atencao ? 'atencao' : '') + '"><td><button type="button" class="co-nome" data-filtrar="' + esc(s.id) + '" title="Ver só as empresas dela">' + esc(s.nome) + '</button></td>' +
        '<td class="n">' + esc(C.num(s.empresas)) + '</td><td>' + (s.urgente ? '<span class="selo ruim">' + s.urgente + ' urgente' + (s.urgente > 1 ? 's' : '') + '</span> ' : '') +
        (s.atencao ? '<span class="selo meio">' + s.atencao + ' atenção</span> ' : '') + (s.emdia ? '<span class="selo bom">' + s.emdia + ' em dia</span>' : '') + (s.empresas ? '' : '<small>sem empresas</small>') + '</td>' +
        '<td class="n">' + (s.pagarVencido.qtd ? '<span class="vermelho">' + esc(C.brl(s.pagarVencido.valor)) + '</span><small>' + esc(plural(s.pagarVencido.qtd, 'conta', 'contas')) + '</small>' : '<span class="verde">nenhum</span>') + '</td>' +
        '<td class="n">' + (s.receberVencido.qtd ? '<span class="vermelho">' + esc(C.brl(s.receberVencido.valor)) + '</span><small>' + esc(plural(s.receberVencido.qtd, 'conta', 'contas')) + '</small>' : '<span class="verde">nenhum</span>') + '</td>' +
        '<td class="n">' + esc(C.num(s.proximos.qtd)) + '</td><td class="n">' + esc(C.num(s.pendencias)) + '</td><td class="n">' + esc(C.num(s.desatualizadas)) + '</td></tr>';
    });
    h += '</tbody></table></div></div>';
    alvo.appendChild(el('div', { html: h }));

    // filtros
    var selA = el('select', { 'aria-label': 'Filtrar por assistente' });
    selA.appendChild(el('option', { value: '', texto: 'Todas' }));
    estado.assistentes.slice().sort(porNome).forEach(function (a) { selA.appendChild(el('option', { value: a.id, texto: a.nome })); });
    if (todas.some(function (r) { return !r.assistenteId; })) selA.appendChild(el('option', { value: '_sem', texto: 'Sem responsável' }));
    selA.value = filtro.assistenteId;
    if (selA.value !== filtro.assistenteId) { filtro.assistenteId = ''; selA.value = ''; }
    var selS = el('select', { 'aria-label': 'Filtrar por situação' }, [el('option', { value: '', texto: 'Todas' }), el('option', { value: 'urgente', texto: 'Urgente' }),
      el('option', { value: 'atencao', texto: 'Atenção' }), el('option', { value: 'emdia', texto: 'Em dia' })]);
    selS.value = filtro.situacao;
    selA.addEventListener('change', function () { filtro.assistenteId = selA.value; renderPainel(); });
    selS.addEventListener('change', function () { filtro.situacao = selS.value; renderPainel(); });
    var lista = K.filtrar(todas, filtro);
    var secao = el('div', { class: 'co-secao' }, [el('h3', { texto: 'Por empresa (das mais graves para as em dia)' }),
      el('div', { class: 'co-filtros nao-imprimir' }, [
        el('label', { class: 'campo' }, [el('span', { texto: 'Assistente' }), selA]),
        el('label', { class: 'campo' }, [el('span', { texto: 'Situação' }), selS]),
        el('span', { class: 'co-conta', texto: 'Mostrando ' + lista.length + ' de ' + todas.length })
      ])]);
    if (filtro.assistenteId || filtro.situacao) secao.appendChild(el('p', { class: 'so-imprimir co-dica', texto: 'Filtro: ' + (filtro.assistenteId ? (filtro.assistenteId === '_sem' ? 'Sem responsável' : nomeAssistente(filtro.assistenteId)) : 'todas as assistentes') + ', ' + (filtro.situacao ? K.NOME_SITUACAO[filtro.situacao] : 'todas as situações') }));

    var tbody = el('tbody');
    lista.forEach(function (r) {
      var emp = K.empresa(estado, r.id);
      var tr = el('tr', { class: r.situacao });
      tr.appendChild(el('td', {}, [el('button', { type: 'button', class: 'co-nome', texto: r.nome, onclick: function () { abrir(r.id); } })]));
      tr.appendChild(el('td', { texto: r.assistente || 'Sem responsável' }));
      var tdS = el('td', { class: 'motivos', html: selo(r.situacao) });
      if (r.motivos.length) tdS.appendChild(el('ul', {}, r.motivos.map(function (m) { return el('li', { texto: m }); })));
      tr.appendChild(tdS);
      if (r.semDados) tr.appendChild(el('td', { colspan: '3', class: 'co-vazio', texto: 'Ainda sem relatório. Traga no passo 2.' }));
      else {
        tr.appendChild(el('td', { class: 'n', html: vencidoCelula(r.pagarVencido) }));
        tr.appendChild(el('td', { class: 'n', html: vencidoCelula(r.receberVencido) }));
        tr.appendChild(el('td', { class: 'n', html: esc(C.num(r.proximos.qtd)) + (r.proximos.qtd ? '<small>' + esc(C.brl(r.proximos.pagarValor)) + ' a pagar</small><small>' + esc(C.brl(r.proximos.receberValor)) + ' a receber</small>' : '') }));
      }
      // conciliação editável
      var inP = el('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', value: r.pendencias == null ? '' : String(r.pendencias), 'aria-label': 'Lançamentos pendentes de conciliação de ' + r.nome, placeholder: 'informe' });
      inP.addEventListener('change', function () {
        try { K.definirConciliacao(emp, 'pendentes', inP.value.trim()); salvar(); renderPainel(); renderDetalhe(); }
        catch (e) { U.avisar(e.message, 'erro'); inP.value = r.pendencias == null ? '' : String(r.pendencias); }
      });
      var origem = emp.conc.origem === 'arquivo' && emp.conc.atualizadoEm ? 'do extrato de ' + C.dataBR(emp.conc.atualizadoEm) : '';
      tr.appendChild(el('td', { class: 'n' }, [inP, el('span', { class: 'so-imprimir', texto: r.pendencias == null ? 'não informado' : C.num(r.pendencias) }), origem ? el('small', { texto: origem }) : null]));
      var inD = el('input', { type: 'date', value: r.ultimaConc || '', 'aria-label': 'Data da última conciliação de ' + r.nome });
      inD.addEventListener('change', function () {
        try { K.definirConciliacao(emp, 'ultima', inD.value); salvar(); renderPainel(); renderDetalhe(); }
        catch (e) { U.avisar(e.message, 'erro'); }
      });
      var dc = r.diasConc == null ? 'não informada' : r.diasConc === 0 ? 'hoje' : 'há ' + plural(r.diasConc, 'dia', 'dias');
      tr.appendChild(el('td', {}, [inD, el('span', { class: 'so-imprimir', texto: r.ultimaConc ? C.dataBR(r.ultimaConc) : '' }), el('small', { class: r.diasConc != null && r.diasConc > (K.regrasDe(estado).atConcDias || 0) ? 'vermelho' : '', texto: dc })]));
      var at = r.atualizacao ? C.dataBR(r.atualizacao) : 'nunca';
      var faltaTipo = !r.semDados && (!r.cargas.pagar || !r.cargas.receber) ? (r.cargas.pagar ? 'só contas a pagar' : 'só contas a receber') : '';
      tr.appendChild(el('td', {}, [el('span', { texto: at }), r.diasAtualizacao != null ? el('small', { texto: r.diasAtualizacao === 0 ? 'hoje' : 'há ' + plural(r.diasAtualizacao, 'dia', 'dias') }) : null, faltaTipo ? el('small', { texto: faltaTipo }) : null]));
      tbody.appendChild(tr);
    });
    if (!lista.length) tbody.appendChild(el('tr', {}, [el('td', { colspan: '9', class: 'co-vazio', texto: 'Nenhuma empresa com esse filtro.' })]));
    secao.appendChild(el('div', { class: 'tabela-rolagem' }, [el('table', { class: 'co-painel' }, [
      el('thead', { html: '<tr><th>Empresa</th><th>Assistente</th><th>Situação</th><th class="n">A pagar vencido</th><th class="n">A receber vencido</th><th class="n">Próximos 7 dias</th><th class="n">Pendências de conciliação</th><th>Última conciliação</th><th>Última atualização</th></tr>' }),
      tbody])]));
    secao.appendChild(el('p', { class: 'co-dica nao-imprimir', style: 'margin-top:8px', texto: 'Clique no nome da empresa para ver as contas vencidas e a vencer. As pendências e a data da última conciliação você digita direto na tabela (ou traz um extrato com a coluna de conciliação no passo 2). Última atualização é a data do relatório mais antigo entre pagar e receber.' }));
    alvo.appendChild(secao);
    Array.prototype.forEach.call(alvo.querySelectorAll('[data-filtrar]'), function (b) {
      b.addEventListener('click', function () { filtro.assistenteId = b.getAttribute('data-filtrar'); filtro.situacao = ''; renderPainel(); });
    });
  }
  function abrir(id) {
    aberta = id;
    renderDetalhe();
    var d = $('detalhe'); if (d.scrollIntoView) d.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------- detalhe da empresa ----------
  function tabelaTitulos(itens, vencidos) {
    if (!itens.length) return el('p', { class: 'co-dica', texto: vencidos ? 'Nenhuma conta vencida.' : 'Nenhuma conta a vencer.' });
    var tbody = el('tbody');
    itens.forEach(function (x) {
      var quando = vencidos ? 'há ' + plural(x.atraso, 'dia', 'dias') : x.atraso === 0 ? 'hoje' : 'em ' + plural(-x.atraso, 'dia', 'dias');
      tbody.appendChild(el('tr', {}, [
        el('td', { texto: x.tipo === 'pagar' ? 'A pagar' : 'A receber' }),
        el('td', { texto: C.dataBR(x.venc) }),
        el('td', { class: vencidos ? 'vermelho' : '', texto: quando }),
        el('td', { class: 'n', texto: C.brl(x.valor) }),
        el('td', { class: 'quebra', texto: x.contato }),
        el('td', { class: 'quebra', texto: x.desc })
      ]));
    });
    return el('div', { class: 'tabela-rolagem' }, [el('table', { class: 'co-painel co-detalhe' }, [
      el('thead', { html: '<tr><th>Tipo</th><th>Vencimento</th><th>' + (vencidos ? 'Atraso' : 'Vence') + '</th><th class="n">Valor</th><th>Contato</th><th>Descrição</th></tr>' }), tbody])]);
  }
  function renderDetalhe() {
    var alvo = $('detalhe');
    var emp = aberta ? K.empresa(estado, aberta) : null;
    alvo.innerHTML = '';
    alvo.hidden = !emp;
    if (!emp) return;
    var a = emp.assistenteId ? K.assistente(estado, emp.assistenteId) : null;
    var r = K.resumoEmpresa(emp, ref, K.regrasDe(estado), a ? a.nome : '');
    alvo.appendChild(el('div', { class: 'co-detalhe-topo' }, [
      el('h2', { texto: emp.nome }), el('span', { html: selo(r.situacao) }),
      el('button', { type: 'button', class: 'btn nao-imprimir', texto: 'Fechar', onclick: function () { aberta = null; renderDetalhe(); } })
    ]));
    alvo.appendChild(el('p', { class: 'co-dica', texto: 'Assistente: ' + (r.assistente || 'sem responsável') + '. Data de referência: ' + C.dataBR(ref) + '.' }));
    if (r.motivos.length) alvo.appendChild(el('div', { class: 'nota ' + (r.situacao === 'urgente' ? 'erro' : 'atencao') }, [el('ul', {}, r.motivos.map(function (m) { return el('li', { texto: m }); }))]));
    else alvo.appendChild(el('div', { class: 'nota ok', texto: 'Tudo em dia nesta empresa.' }));
    var fontes = [];
    ['pagar', 'receber'].forEach(function (t) {
      var cg = emp.cargas[t];
      fontes.push((t === 'pagar' ? 'Contas a pagar: ' : 'Contas a receber: ') + (cg ? (cg.arquivo || 'relatório') + ', guardado em ' + C.dataBR(cg.atualizadoEm) + ' (' + plural(cg.titulos.length, 'conta em aberto', 'contas em aberto') + ')' : 'ainda não veio'));
    });
    if (emp.conc.origem === 'arquivo' && emp.conc.arquivo) fontes.push('Conciliação: pendências contadas no extrato ' + emp.conc.arquivo + (emp.conc.atualizadoEm ? ', em ' + C.dataBR(emp.conc.atualizadoEm) : '') + '.');
    alvo.appendChild(el('ul', { class: 'co-dica', style: 'margin-left:18px' }, fontes.map(function (f) { return el('li', { texto: f }); })));
    alvo.appendChild(el('div', { class: 'cartoes', html:
      cartao('Vencidos a pagar', C.brl(r.pagarVencido.valor), plural(r.pagarVencido.qtd, 'conta', 'contas'), r.pagarVencido.qtd ? 'ruim' : 'bom') +
      cartao('Vencidos a receber', C.brl(r.receberVencido.valor), plural(r.receberVencido.qtd, 'conta', 'contas'), r.receberVencido.qtd ? 'ruim' : 'bom') +
      cartao('Próximos 7 dias', C.num(r.proximos.qtd), C.brl(r.proximos.pagarValor) + ' a pagar, ' + C.brl(r.proximos.receberValor) + ' a receber') +
      cartao('Conciliação', r.pendencias == null ? 'não informado' : plural(r.pendencias, 'pendente', 'pendentes'), r.ultimaConc ? 'última em ' + C.dataBR(r.ultimaConc) : 'sem data da última') }));
    alvo.appendChild(el('h3', { texto: 'Contas vencidas', style: 'margin-top:16px' }));
    alvo.appendChild(tabelaTitulos(r.vencidos, true));
    alvo.appendChild(el('h3', { texto: 'Contas a vencer', style: 'margin-top:16px' }));
    alvo.appendChild(tabelaTitulos(r.aVencer, false));
  }

  // ---------- backup, Excel e impressão ----------
  $('btn-backup').addEventListener('click', function () {
    estado.ultimoBackup = new Date().toISOString();
    salvar();
    U.baixar('backup-painel-coordenacao-' + K.hojeIso() + '.json', JSON.stringify(K.criarBackup(estado), null, 2), 'application/json');
    renderAvisos();
    U.avisar('Backup baixado. Guarde num lugar seguro (Drive, OneDrive, e-mail). Para passar o painel para outra pessoa, mande este arquivo.', 'ok');
  });
  $('btn-restaurar').addEventListener('click', function () {
    U.escolherArquivo('.json,application/json').then(function (arq) {
      if (!arq) return;
      return U.lerJSON(arq).then(function (obj) {
        var novo = K.lerBackup(obj);
        if (estado.empresas.length && !window.confirm('Restaurar o backup troca os dados de agora (' + plural(estado.empresas.length, 'empresa', 'empresas') + ') pelos do arquivo (' + plural(novo.empresas.length, 'empresa', 'empresas') + '). Continuar?')) return;
        estado = novo;
        aberta = null; pendentes = []; carteira = null; filtro = { assistenteId: '', situacao: '' };
        salvar(); renderRegras(); renderPendentes(); renderCarteira(); renderTudo();
        U.avisar('Backup restaurado: ' + plural(novo.assistentes.length, 'assistente', 'assistentes') + ' e ' + plural(novo.empresas.length, 'empresa', 'empresas') + '.', 'ok');
      });
    }).catch(function (e) { U.avisar(e.message, 'erro'); });
  });
  $('btn-excel').addEventListener('click', function () {
    if (!estado.empresas.length) { U.avisar('Ainda não tem empresas para baixar.', 'erro'); return; }
    U.baixarExcel('painel-coordenacao-' + ref + '.xlsx', K.abasExcel(estado, ref));
  });
  $('btn-imprimir').addEventListener('click', function () { window.print(); });

  function renderTudo() {
    if (aberta && !K.empresa(estado, aberta)) aberta = null;
    renderAvisos();
    renderEquipe();
    renderBotaoGuardar();
    renderPainel();
    renderDetalhe();
  }

  renderRef();
  renderRegras();
  renderTudo();
})();

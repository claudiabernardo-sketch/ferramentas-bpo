/* Ferramentas do BPO: DRE gerencial e painel do cliente, a tela.
   Precisa antes: vendor/xlsx.full.min.js, comum.js, ui.js, dre-logica.js */
(function () {
  'use strict';
  var C = window.Comum, U = window.UI, D = window.DRE, el = U.el, esc = U.esc;
  var guarda = U.navegadorGuarda();
  var E = D.carregarEstado(C.recuperar(D.CHAVE, null));
  // R: o que está aberto agora (o arquivo não fica guardado, só as escolhas)
  var R = {
    abas: null, abaIdx: 0, nomeArquivo: '', linhas: null, iCab: 0, cab: [], escolha: null, deMemoria: false,
    soPago: true, proc: null, form: null, modeloAberto: false, conferencia: null, painelFim: null, painelQtd: 3
  };
  var FORMULAS = {
    rl: 'Receitas + Deduções', lb: 'Receita líquida + Custos', ro: 'Lucro bruto + Despesas',
    rliq: 'Resultado operacional + Resultado financeiro', gc: 'Resultado líquido + Abaixo do resultado'
  };

  function $(id) { return document.getElementById(id); }
  function salvar() {
    if (!C.guardar(D.CHAVE, E) && guarda) U.avisar('Não consegui salvar neste navegador (pode estar sem espaço). Faça um backup para não perder.', 'erro');
  }
  function cliente() {
    for (var i = 0; i < E.clientes.length; i++) if (E.clientes[i].id === E.clienteAtual) return E.clientes[i];
    return null;
  }
  function nota(tipo, filhos) { return el('div', { class: 'nota ' + tipo }, Array.isArray(filhos) ? filhos : [filhos]); }
  function botao(texto, aoClicar, classe, extra) {
    var b = el('button', Object.assign({ type: 'button', class: 'btn' + (classe ? ' ' + classe : ''), texto: texto }, extra || {}));
    b.addEventListener('click', aoClicar);
    return b;
  }
  function hoje() {
    var d = new Date();
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  function plural(n, um, varios) { return n + ' ' + (n === 1 ? um : varios); }
  function lancamentos() { return R.proc ? R.proc.lancamentos : []; }
  function nomePainel(c) { return 'painel-financeiro-' + U.nomeArquivo(c.nome); }
  function irPara(id) { var x = $(id); if (x && x.scrollIntoView) x.scrollIntoView({ behavior: 'smooth', block: 'start' }); }

  // ---------- avisos do topo ----------
  function renderAvisos() {
    var a = $('avisos-topo');
    a.innerHTML = '';
    if (!guarda) {
      a.appendChild(nota('atencao', [el('b', { texto: 'Este navegador não está guardando dados' }),
        ' (janela anônima ou bloqueio do navegador). Dá para usar normalmente, mas ao fechar a página os clientes e os modelos somem. Antes de sair, clique em Salvar backup.']));
    }
  }

  // ---------- passo 1: cliente ----------
  function renderCliente() {
    var a = $('area-cliente');
    a.innerHTML = '';
    if (R.form) { a.appendChild(formCliente()); return; }
    if (!E.clientes.length) {
      a.appendChild(el('p', { class: 'dre-dica', texto: 'Cadastre o primeiro cliente. O nome, as cores e o logo aparecem no painel que você manda para ele.' }));
      a.appendChild(el('div', { class: 'botoes' }, [botao('Cadastrar cliente', function () { abrirForm(null); }, 'btn-forte')]));
      return;
    }
    var c = cliente();
    var sel = el('select', { id: 'sel-cliente' });
    E.clientes.slice().sort(function (x, y) { return x.nome.localeCompare(y.nome, 'pt-BR'); }).forEach(function (x) {
      sel.appendChild(el('option', { value: x.id, texto: x.nome }));
    });
    if (!c) { E.clienteAtual = E.clientes[0].id; c = cliente(); }
    sel.value = c.id;
    sel.addEventListener('change', function () {
      E.clienteAtual = sel.value;
      R.conferencia = null; R.painelFim = null;
      salvar();
      if (R.abas) prepararColunas();
      renderTudo();
    });
    a.appendChild(el('div', { class: 'linha-campos dre-cliente-linha' }, [
      el('label', { class: 'campo' }, [el('span', { texto: 'Cliente' }), sel]),
      el('div', { class: 'botoes dre-cliente-botoes' }, [
        botao('Editar', function () { abrirForm(cliente()); }),
        botao('Novo cliente', function () { abrirForm(null); }),
        botao('Excluir', excluirCliente, 'btn-perigo')
      ])
    ]));
    var amostra = el('div', { class: 'dre-amostra' }, [
      el('span', { class: 'dre-cor', style: 'background:' + D.corValida(c.cor1, '#0B1B33'), title: 'Cor principal' }),
      el('span', { class: 'dre-cor', style: 'background:' + D.corValida(c.cor2, '#5E9BD6'), title: 'Cor secundária' }),
      c.logo ? el('img', { src: c.logo, alt: 'Logo de ' + c.nome }) : el('small', { texto: 'sem logo' })
    ]);
    a.appendChild(amostra);
  }
  function abrirForm(c) {
    R.form = c ? { id: c.id, nome: c.nome, cor1: c.cor1, cor2: c.cor2, logo: c.logo || '' } : { id: null, nome: '', cor1: '#0B1B33', cor2: '#5E9BD6', logo: '' };
    renderCliente();
    var i = document.querySelector('#area-cliente input');
    if (i) i.focus();
  }
  function formCliente() {
    var f = R.form;
    var nome = el('input', { maxlength: '80', placeholder: 'Ex.: Ótica Visão Clara', required: 'required' });
    nome.value = f.nome;
    nome.addEventListener('input', function () { f.nome = nome.value; });
    var cor1 = el('input', { type: 'color', value: f.cor1 });
    cor1.addEventListener('input', function () { f.cor1 = cor1.value; });
    var cor2 = el('input', { type: 'color', value: f.cor2 });
    cor2.addEventListener('input', function () { f.cor2 = cor2.value; });
    var arqLogo = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp' });
    var prev = el('div', { class: 'dre-logo-prev' });
    function mostraLogo() {
      prev.innerHTML = '';
      if (!f.logo) { prev.appendChild(el('small', { texto: 'Sem logo (opcional).' })); return; }
      prev.appendChild(el('img', { src: f.logo, alt: 'Logo' }));
      prev.appendChild(botao('Tirar o logo', function () { f.logo = ''; arqLogo.value = ''; mostraLogo(); }));
    }
    arqLogo.addEventListener('change', function () {
      var arq = arqLogo.files[0];
      if (!arq) return;
      U.lerLogo(arq).then(function (d) { f.logo = d; mostraLogo(); }).catch(function (e) { U.avisar(e.message, 'erro'); });
    });
    mostraLogo();
    var form = el('form', { class: 'dre-form-cliente', autocomplete: 'off' }, [
      el('h3', { texto: f.id ? 'Editar cliente' : 'Novo cliente' }),
      el('div', { class: 'linha-campos' }, [
        el('label', { class: 'campo' }, [el('span', { texto: 'Nome do cliente' }), nome]),
        el('label', { class: 'campo' }, [el('span', { texto: 'Cor principal' }), cor1]),
        el('label', { class: 'campo' }, [el('span', { texto: 'Cor secundária' }), cor2]),
        el('label', { class: 'campo' }, [el('span', { texto: 'Logo (opcional)' }), arqLogo])
      ]),
      prev,
      el('p', { class: 'dre-dica', texto: 'Dica: use as cores da marca do cliente. A cor principal fica no topo do painel; a secundária, nos destaques e gráficos.' }),
      el('div', { class: 'botoes' }, [
        el('button', { type: 'submit', class: 'btn btn-forte', texto: 'Salvar cliente' }),
        E.clientes.length ? botao('Cancelar', function () { R.form = null; renderCliente(); }) : null
      ])
    ]);
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var n = f.nome.trim();
      if (!n) { U.avisar('Escreva o nome do cliente.', 'erro'); nome.focus(); return; }
      if (f.id) {
        var c = E.clientes.filter(function (x) { return x.id === f.id; })[0];
        if (c) { c.nome = n.slice(0, 80); c.cor1 = D.corValida(f.cor1, c.cor1); c.cor2 = D.corValida(f.cor2, c.cor2); c.logo = D.logoValido(f.logo); }
      } else {
        var novo = D.novoCliente(n, f.cor1, f.cor2, f.logo);
        E.clientes.push(novo);
        E.clienteAtual = novo.id;
        if (R.abas) prepararColunas();
      }
      R.form = null;
      salvar();
      renderTudo();
      U.avisar('Cliente salvo.');
    });
    return form;
  }
  function excluirCliente() {
    var c = cliente();
    if (!c) return;
    if (!window.confirm('Excluir o cliente "' + c.nome + '"? O modelo da DRE e as ligações de categorias dele serão apagados deste navegador.')) return;
    E.clientes = E.clientes.filter(function (x) { return x.id !== c.id; });
    E.clienteAtual = E.clientes[0] ? E.clientes[0].id : null;
    R.conferencia = null;
    salvar();
    if (R.abas && cliente()) prepararColunas();
    renderTudo();
    U.avisar('Cliente excluído.');
  }

  // ---------- passo 2: relatório ----------
  function receberArquivo(arqs) {
    var arq = arqs[0];
    U.lerArquivo(arq).then(function (abas) {
      if (!abas.length) { U.avisar('O arquivo "' + arq.name + '" está vazio.', 'erro'); return; }
      R.abas = abas; R.nomeArquivo = arq.name; R.abaIdx = D.melhorAba(abas);
      R.painelFim = null; R.conferencia = null;
      prepararColunas();
      renderTudo();
      U.avisar('Relatório lido.');
    }).catch(function (e) { U.avisar(e.message, 'erro'); });
  }
  function prepararColunas() {
    R.linhas = R.abas[R.abaIdx].linhas;
    R.iCab = C.acharCabecalho(R.linhas, D.CAMPOS);
    R.cab = (R.linhas[R.iCab] || []).map(function (v) { return v == null ? '' : String(v); });
    var mem = D.colunasLembradas(cliente(), R.cab);
    if (mem) { R.escolha = mem.escolha; R.soPago = mem.soPago; R.deMemoria = true; }
    else { R.escolha = D.detectar(R.cab); R.soPago = true; R.deMemoria = false; }
    reprocessar();
  }
  function reprocessar() {
    if (!R.linhas || !R.escolha || D.faltam(R.escolha).length) { R.proc = null; return; }
    R.proc = D.processar(R.linhas, R.iCab, R.escolha, { soPago: R.soPago });
    var c = cliente();
    if (c) { D.lembrarColunas(c, R.cab, R.escolha, R.soPago); salvar(); }
  }
  function renderArquivo() {
    var a = $('area-arquivo');
    a.innerHTML = '';
    var c = cliente();
    if (!c) { a.appendChild(nota('info', 'Primeiro escolha ou cadastre o cliente no passo 1.')); return; }
    a.appendChild(el('p', { class: 'dre-dica', texto: 'No sistema do cliente, exporte o relatório de lançamentos ou de movimentações financeiras (o que foi pago e recebido) em Excel ou CSV. Pode ter um mês ou vários.' }));
    a.appendChild(U.areaArquivo({ titulo: 'Arraste aqui o relatório do sistema', aoReceber: receberArquivo }));
    if (!R.abas) return;

    var lido = el('div', { class: 'arquivo-lido dre-lido' }, [el('b', { texto: 'Arquivo lido:' }), el('span', { texto: R.nomeArquivo + ' (' + plural(R.linhas.length, 'linha', 'linhas') + ')' })]);
    if (R.abas.length > 1) {
      var selAba = el('select', { 'aria-label': 'Aba da planilha' });
      R.abas.forEach(function (ab, i) { selAba.appendChild(el('option', { value: String(i), texto: 'Aba: ' + ab.nome })); });
      selAba.value = String(R.abaIdx);
      selAba.addEventListener('change', function () { R.abaIdx = Number(selAba.value); R.conferencia = null; prepararColunas(); renderTudo(); });
      lido.appendChild(selAba);
    }
    a.appendChild(lido);
    if (R.deMemoria) a.appendChild(nota('ok', 'Usei as colunas que você escolheu da última vez para um relatório igual a este. Confira abaixo se continuam certas.'));

    a.appendChild(el('h3', { class: 'dre-h3', texto: 'Colunas do relatório' }));
    a.appendChild(el('p', { class: 'dre-dica', texto: 'Já deixei escolhido o que reconheci. Confira cada uma e troque se precisar.' }));
    var mapa = el('div');
    a.appendChild(mapa);
    U.mapeador(mapa, R.cab, D.camposPara(R.escolha), R.escolha, R.linhas.slice(R.iCab + 1, R.iCab + 8), function (escolha) {
      R.escolha = escolha; R.deMemoria = false; R.conferencia = null;
      reprocessar();
      renderTudo();
    });

    var colData = R.escolha.data >= 0 ? R.cab[R.escolha.data] : '';
    var regime = D.regimeDaColuna(colData);
    if (colData) {
      var txt = regime === 'caixa' ? 'Data escolhida: "' + colData + '". Será uma DRE de caixa (pelo dia em que o dinheiro entrou ou saiu).' :
        regime === 'competencia' ? 'Data escolhida: "' + colData + '". Será uma DRE por competência (pelo mês em que a venda ou a despesa aconteceu).' :
        regime === 'vencimento' ? 'Data escolhida: "' + colData + '". Atenção: vencimento não é o dia do pagamento. Se o relatório tiver data de pagamento ou de competência, prefira uma delas.' :
        'Data escolhida: "' + colData + '". Confira se é a data de pagamento (DRE de caixa) ou de competência (DRE por competência).';
      a.appendChild(nota(regime === 'vencimento' ? 'atencao' : 'info', txt));
    }
    if ((R.escolha.entrada >= 0) !== (R.escolha.saida >= 0)) {
      a.appendChild(nota('atencao', 'Você escolheu só uma das colunas Entrada e Saída. Para usar colunas separadas, escolha as duas. Enquanto isso vale a coluna Valor.'));
    }
    var falta = D.faltam(R.escolha);
    if (falta.length) {
      a.appendChild(nota('erro', 'Para continuar, escolha a coluna de: ' + falta.map(function (f) { return f.rotulo; }).join(', ') + '.'));
      return;
    }
    if (R.escolha.situacao >= 0) {
      var chk = el('input', { type: 'checkbox' });
      chk.checked = R.soPago;
      chk.addEventListener('change', function () { R.soPago = chk.checked; reprocessar(); renderTudo(); });
      a.appendChild(el('label', { class: 'dre-check' }, [chk, el('span', { texto: 'Considerar só o que foi pago ou recebido (ignora em aberto, a vencer, atrasado, previsto e pendente). Cancelado é sempre ignorado.' })]));
    }
    var p = R.proc;
    if (!p) return;
    var grupos = D.resumoIgnoradas(p.ignoradas);
    var caixa = nota(p.lancamentos.length ? 'ok' : 'erro', [
      el('b', { texto: plural(p.lancamentos.length, 'lançamento usado', 'lançamentos usados') }),
      ' de ' + plural(p.lidas, 'linha lida', 'linhas lidas') + (p.ignoradas.length ? '; ' + plural(p.ignoradas.length, 'linha ignorada', 'linhas ignoradas') + ' (' + grupos.map(function (g) { return g.motivo.toLowerCase() + ': ' + g.qtd; }).join('; ') + ').' : '.')
    ]);
    if (!p.lancamentos.length) caixa.appendChild(el('p', { texto: 'Nenhuma linha virou lançamento. Confira se as colunas de data e de valor estão certas.' }));
    if (grupos.length) {
      var det = el('details', { class: 'dre-ignoradas' }, [el('summary', { texto: 'Ver as linhas ignoradas e o motivo' })]);
      grupos.forEach(function (g) {
        det.appendChild(el('p', {}, [el('b', { texto: g.motivo + ': ' }), plural(g.qtd, 'linha', 'linhas')]));
        var ul = el('ul');
        g.itens.slice(0, 100).forEach(function (x) { ul.appendChild(el('li', { texto: 'Linha ' + x.linha + ': ' + x.texto })); });
        if (g.itens.length > 100) ul.appendChild(el('li', { texto: 'e mais ' + (g.itens.length - 100) + '.' }));
        det.appendChild(ul);
      });
      caixa.appendChild(det);
    }
    a.appendChild(caixa);
    a.appendChild(nota('info', D.textoRegra(p)));
    var meses = D.mesesDe(p.lancamentos);
    if (meses.length) {
      a.appendChild(nota('info', 'Período do relatório: ' + C.mesCurto(meses[0]) + (meses.length > 1 ? ' a ' + C.mesCurto(meses[meses.length - 1]) : '') + ' (' + plural(meses.length, 'mês', 'meses') + ').' +
        (meses.length > 12 ? ' A DRE na tela mostra os últimos 12 meses.' : '')));
    }
  }

  // ---------- passo 3: modelo e ligações ----------
  function depoisDeMudarModelo() { salvar(); renderModelo(); renderLigacoes(); renderResultado(); marcarPassos(); }
  function renderModelo() {
    var a = $('area-modelo');
    a.innerHTML = '';
    var c = cliente();
    if (!c) { a.appendChild(nota('info', 'Escolha o cliente no passo 1.')); return; }
    var m = c.modelo;
    a.appendChild(el('p', { class: 'dre-dica', texto: 'O modelo é a lista de linhas da DRE deste cliente. Use os nomes que o cliente usa e já aprovou. Cada categoria do sistema é ligada a uma linha (tabela mais abaixo).' }));
    var det = el('details', { class: 'dre-modelo' });
    det.open = R.modeloAberto;
    det.addEventListener('toggle', function () { R.modeloAberto = det.open; });
    det.appendChild(el('summary', { texto: 'Ver e editar as linhas da DRE: ' + m.nome + ' (' + plural(m.linhas.length, 'linha', 'linhas') + ')' }));

    var nomeModelo = el('input', { maxlength: '80' });
    nomeModelo.value = m.nome;
    nomeModelo.addEventListener('change', function () { var v = nomeModelo.value.trim(); if (v) { m.nome = v.slice(0, 80); depoisDeMudarModelo(); } else nomeModelo.value = m.nome; });
    det.appendChild(el('label', { class: 'campo dre-nome-modelo' }, [el('span', { texto: 'Nome do relatório (aparece no painel)' }), nomeModelo]));

    ['receita', 'deducao', 'custo', 'despesa', 'financeiro', 'abaixo', 'fora'].forEach(function (g) {
      var bloco = el('div', { class: 'dre-grupo' }, [el('h3', { texto: D.NOME_GRUPO[g] })]);
      var ls = D.linhasDoGrupo(m, g);
      if (!ls.length) bloco.appendChild(el('p', { class: 'dre-dica', texto: 'Nenhuma linha neste grupo.' }));
      ls.forEach(function (l, i) {
        var inp = el('input', { maxlength: '120', 'aria-label': 'Nome da linha' });
        inp.value = l.nome;
        inp.addEventListener('change', function () {
          if (D.renomearLinha(m, l.id, inp.value)) depoisDeMudarModelo();
          else inp.value = l.nome;
        });
        bloco.appendChild(el('div', { class: 'dre-linha-modelo' }, [
          inp,
          botao('↑', function () { if (D.moverLinha(m, l.id, -1)) depoisDeMudarModelo(); }, 'dre-mini', { title: 'Subir', 'aria-label': 'Subir a linha ' + l.nome, disabled: i === 0 ? 'disabled' : null }),
          botao('↓', function () { if (D.moverLinha(m, l.id, 1)) depoisDeMudarModelo(); }, 'dre-mini', { title: 'Descer', 'aria-label': 'Descer a linha ' + l.nome, disabled: i === ls.length - 1 ? 'disabled' : null }),
          botao('Excluir', function () {
            if (!window.confirm('Excluir a linha "' + l.nome + '"? As categorias ligadas a ela voltam para "A classificar".')) return;
            var n = D.excluirLinha(c, l.id);
            depoisDeMudarModelo();
            U.avisar('Linha excluída.' + (n ? ' ' + plural(n, 'categoria voltou', 'categorias voltaram') + ' para "A classificar".' : ''));
          }, 'btn-perigo dre-mini')
        ]));
      });
      bloco.appendChild(botao('+ Nova linha aqui', function () {
        var nome = window.prompt('Nome da nova linha em "' + D.NOME_GRUPO[g] + '":');
        if (nome == null) return;
        if (!D.criarLinha(m, g, nome)) { U.avisar('Escreva um nome para a linha.', 'erro'); return; }
        R.modeloAberto = true;
        depoisDeMudarModelo();
      }, 'dre-mais'));
      det.appendChild(bloco);
      D.SUBTOTAIS.forEach(function (s) {
        if (s.depoisDe !== g) return;
        var si = el('input', { maxlength: '80', 'aria-label': 'Nome do subtotal' });
        si.value = m.subtotais[s.chave];
        si.addEventListener('change', function () { if (D.renomearSubtotal(m, s.chave, si.value)) depoisDeMudarModelo(); else si.value = m.subtotais[s.chave]; });
        det.appendChild(el('div', { class: 'dre-subtotal-modelo' }, [el('b', { texto: '=' }), si, el('small', { texto: 'calculado: ' + FORMULAS[s.chave] })]));
      });
    });
    det.appendChild(el('p', { class: 'dre-dica', texto: 'A classificar: as categorias que ainda não têm linha ficam aqui e não entram no resultado até você escolher.' }));

    var botoes = el('div', { class: 'botoes dre-botoes-modelo' });
    var outros = E.clientes.filter(function (x) { return x.id !== c.id; });
    if (outros.length) {
      var selOutro = el('select', { 'aria-label': 'Cliente de onde copiar o modelo' });
      outros.forEach(function (x) { selOutro.appendChild(el('option', { value: x.id, texto: x.nome })); });
      botoes.appendChild(el('span', { class: 'dre-copiar' }, [selOutro, botao('Copiar modelo deste cliente', function () {
        var o = outros.filter(function (x) { return x.id === selOutro.value; })[0];
        if (!o) return;
        if (!window.confirm('Copiar o modelo de "' + o.nome + '" para "' + c.nome + '"? O modelo atual de "' + c.nome + '" será trocado.')) return;
        var comLig = window.confirm('Copiar também as ligações das categorias? Clique OK se os dois clientes usam o mesmo sistema com as mesmas categorias (por exemplo, duas óticas). Clique Cancelar para copiar só as linhas.');
        D.aplicarModelo(c, D.exportarModelo(o), comLig);
        depoisDeMudarModelo();
        U.avisar('Modelo copiado de ' + o.nome + '.');
      })]));
    }
    botoes.appendChild(botao('Exportar modelo', function () {
      U.baixar('modelo-dre-' + U.nomeArquivo(c.nome) + '.json', JSON.stringify(D.exportarModelo(c), null, 1), 'application/json');
    }));
    botoes.appendChild(botao('Importar modelo', importarModelo));
    botoes.appendChild(botao('Voltar ao modelo padrão', function () {
      if (!window.confirm('Voltar ao modelo padrão "DRE gerencial"? Os nomes e as linhas criadas por você neste cliente serão trocados.')) return;
      D.aplicarModelo(c, { modelo: D.modeloPadrao() }, false);
      depoisDeMudarModelo();
    }));
    det.appendChild(botoes);
    a.appendChild(det);
  }
  function importarModelo() {
    var c = cliente();
    if (!c) return;
    U.escolherArquivo('.json,application/json').then(function (arq) {
      if (!arq) return null;
      return U.lerJSON(arq);
    }).then(function (d) {
      if (!d) return;
      if (!d.modelo || !D.validarModelo(d.modelo)) throw new Error('Esse arquivo não é um modelo de DRE.');
      if (!window.confirm('Usar o modelo do arquivo' + (d.origem ? ' (veio de "' + d.origem + '")' : '') + ' em "' + c.nome + '"? O modelo atual será trocado.')) return;
      var temLig = d.ligacoes && typeof d.ligacoes === 'object' && Object.keys(d.ligacoes).length > 0;
      var comLig = temLig && window.confirm('O arquivo também traz as ligações das categorias. Usar também? (OK se for o mesmo sistema com as mesmas categorias.)');
      D.aplicarModelo(c, d, comLig);
      depoisDeMudarModelo();
      U.avisar('Modelo importado.');
    }).catch(function (e) { U.avisar(e.message, 'erro'); });
  }

  function opcoesLinhas(modelo) {
    var sel = el('select', { 'aria-label': 'Linha da DRE' });
    D.GRUPOS.forEach(function (g) {
      var ls = D.linhasDoGrupo(modelo, g);
      if (!ls.length) return;
      var og = el('optgroup', { label: D.NOME_GRUPO[g] });
      ls.forEach(function (l) { og.appendChild(el('option', { value: l.id, texto: l.nome })); });
      sel.appendChild(og);
    });
    sel.appendChild(el('option', { value: D.CLASSIFICAR, texto: 'A classificar' }));
    return sel;
  }
  function renderLigacoes() {
    var a = $('area-ligacoes');
    a.innerHTML = '';
    var c = cliente();
    if (!c) return;
    if (!lancamentos().length) {
      a.appendChild(nota('info', 'Quando o relatório for lido no passo 2, as categorias dele aparecem aqui para você ligar às linhas da DRE.'));
      return;
    }
    var cc = D.classificarCategorias(lancamentos(), c);
    var sug = cc.lista.filter(function (x) { return x.status === 'sugestao'; }).length;
    var sem = cc.lista.filter(function (x) { return x.linha === D.CLASSIFICAR; }).length;
    var novas = cc.lista.filter(function (x) { return x.nova; }).length;
    a.appendChild(el('h3', { class: 'dre-h3', texto: 'Ligação de cada categoria do sistema com uma linha da DRE' }));
    var partes = [plural(cc.lista.length, 'categoria encontrada.', 'categorias encontradas.')];
    if (sug) partes.push(plural(sug, 'tem sugestão automática', 'têm sugestão automática') + ' (marcadas "sugestão"): confira e confirme.');
    if (sem) partes.push(plural(sem, 'está', 'estão') + ' a classificar.');
    if (novas) partes.push(plural(novas, 'categoria é nova', 'categorias são novas') + ' desde a última vez (em destaque).');
    if (!sug && !sem) partes.push('Tudo ligado.');
    a.appendChild(nota(sem || novas ? 'atencao' : 'info', partes.join(' ')));
    if (sug) {
      a.appendChild(el('div', { class: 'botoes dre-confirmar' }, [botao('Confirmar todas as sugestões (' + sug + ')', function () {
        var n = D.confirmarSugestoes(c, cc.lista);
        salvar(); renderLigacoes(); renderResultado(); marcarPassos();
        U.avisar(plural(n, 'ligação confirmada', 'ligações confirmadas') + '. Ficam guardadas para os próximos meses.');
      }, 'btn-forte')]));
    }
    var tabela = el('table', { class: 'dre-ligacoes' });
    tabela.appendChild(el('thead', {}, [el('tr', {}, [
      el('th', { texto: 'Categoria do sistema' }), el('th', { class: 'n', texto: 'Lançamentos' }), el('th', { class: 'n', texto: 'Total' }), el('th', { texto: 'Linha da DRE' })
    ])]));
    var corpo = el('tbody');
    cc.lista.forEach(function (it) {
      var sel = opcoesLinhas(c.modelo);
      sel.value = it.linha;
      sel.addEventListener('change', function () {
        D.ligar(c, it.chave, it.nome, sel.value);
        D.marcarVistas(c, cc.lista);
        R.conferencia = null;
        salvar(); renderLigacoes(); renderResultado(); marcarPassos();
      });
      var selos = [];
      if (it.nova) selos.push(el('span', { class: 'selo dre-selo-nova', texto: 'nova' }));
      if (it.linha === D.CLASSIFICAR) selos.push(el('span', { class: 'selo ruim', texto: 'a classificar' }));
      else if (it.status === 'sugestao') selos.push(el('span', { class: 'selo meio', texto: 'sugestão' }));
      corpo.appendChild(el('tr', { class: (it.nova ? 'dre-nova ' : '') + (it.linha === D.CLASSIFICAR ? 'dre-falta' : '') }, [
        el('td', { class: 'dre-cat' }, [el('span', { texto: it.nome })].concat(selos)),
        el('td', { class: 'n', texto: String(it.qtd) }),
        el('td', { class: 'n' + (it.total < 0 ? ' neg' : ''), texto: C.brl(it.total) }),
        el('td', {}, [sel])
      ]));
    });
    tabela.appendChild(corpo);
    a.appendChild(el('div', { class: 'tabela-rolagem' }, [tabela]));
    a.appendChild(el('p', { class: 'dre-dica', texto: 'Ao trocar a linha de uma categoria, a ligação fica guardada para este cliente: no mês seguinte ela já entra certa.' }));
  }

  // ---------- passo 4: resultado ----------
  function calcularTela() {
    var c = cliente();
    var cc = D.classificarCategorias(lancamentos(), c);
    return { cc: cc, res: D.calcular(lancamentos(), c.modelo, cc.mapa) };
  }
  function calcularPainel() {
    var c = cliente();
    var cc = D.classificarCategorias(lancamentos(), c);
    var todos = D.mesesDe(lancamentos());
    var fim = R.painelFim && todos.indexOf(R.painelFim) >= 0 ? R.painelFim : todos[todos.length - 1];
    return D.calcular(lancamentos(), c.modelo, cc.mapa, { meses: D.janelaMeses(todos, fim, R.painelQtd) });
  }
  function opcoesPainel() {
    var col = R.escolha && R.escolha.data >= 0 ? R.cab[R.escolha.data] : '';
    var regime = D.regimeDaColuna(col);
    return { bpo: E.config.bpo, regime: regime === 'vencimento' ? null : regime, hoje: hoje() };
  }
  function celulasValores(l, margens) {
    return l.valores.map(function (v, i) {
      var t = margens && margens[i] != null ? ' title="Margem: ' + esc(C.pct(margens[i])) + '"' : '';
      return '<td class="n' + (v < 0 ? ' neg' : '') + '"' + t + '>' + esc(C.brl(v)) + '</td>';
    }).join('') + '<td class="n' + (l.total < 0 ? ' neg' : '') + '"><b>' + esc(C.brl(l.total)) + '</b></td><td class="n">' + esc(l.pct == null ? '' : C.pct(l.pct)) + '</td>';
  }
  function tabelaDRE(res) {
    var h = '<table class="dre-tabela"><thead><tr><th>Linha</th>' + res.meses.map(function (m) { return '<th class="n">' + esc(C.mesCurto(m)) + '</th>'; }).join('') +
      '<th class="n">Total</th><th class="n">% receita</th></tr></thead><tbody>';
    res.linhas.forEach(function (l) {
      if (l.tipo === 'subtotal') h += '<tr class="total dre-subtotal"><td>' + esc(l.nome) + '</td>' + celulasValores(l, l.margens) + '</tr>';
      else h += '<tr class="recuo dre-clicavel' + (R.conferencia === l.id ? ' dre-aberta' : '') + '" data-id="' + esc(l.id) + '" tabindex="0" title="Ver os lançamentos desta linha"><td>' + esc(l.nome) + ' <small>(' + l.qtd + ')</small></td>' + celulasValores(l) + '</tr>';
    });
    h += '<tr class="sub dre-parte-titulo"><td colspan="' + (res.meses.length + 3) + '">Fora do resultado</td></tr>';
    res.aParte.forEach(function (l) {
      var alerta = l.id === D.CLASSIFICAR && l.qtd > 0;
      h += '<tr class="recuo dre-clicavel dre-parte' + (alerta ? ' dre-falta' : '') + (R.conferencia === l.id ? ' dre-aberta' : '') + '" data-id="' + esc(l.id) + '" tabindex="0" title="Ver os lançamentos desta linha"><td>' + esc(l.nome) + ' <small>(' + l.qtd + ')</small></td>' + celulasValores(l) + '</tr>';
    });
    return h + '</tbody></table>';
  }
  function renderConferencia(res, alvo) {
    alvo.innerHTML = '';
    if (!R.conferencia) return;
    var linha = res.linhas.concat(res.aParte).filter(function (l) { return l.id === R.conferencia && l.tipo === 'linha'; })[0];
    if (!linha) { R.conferencia = null; return; }
    var ls = (res.lancPorLinha[linha.id] || []).slice().sort(function (x, y) { return x.data < y.data ? -1 : x.data > y.data ? 1 : x.linha - y.linha; });
    alvo.appendChild(el('div', { class: 'dre-conf-topo' }, [
      el('h3', { texto: 'Lançamentos de "' + linha.nome + '" (' + ls.length + ')' }),
      botao('Fechar', function () { R.conferencia = null; renderResultado(); })
    ]));
    if (!ls.length) { alvo.appendChild(el('p', { class: 'dre-dica', texto: 'Nenhum lançamento nesta linha no período.' })); return; }
    var h = '<table><thead><tr><th>Data</th><th>Categoria do sistema</th><th>Descrição</th><th>Cliente ou fornecedor</th><th class="n">Valor</th><th class="n">Linha no arquivo</th></tr></thead><tbody>';
    ls.slice(0, 500).forEach(function (x) {
      h += '<tr><td>' + esc(C.dataBR(x.data)) + '</td><td>' + esc(x.categoria) + '</td><td>' + esc(x.descricao) + '</td><td>' + esc(x.contato) + '</td><td class="n' + (x.valor < 0 ? ' neg' : '') + '">' + esc(C.brl(x.valor)) + '</td><td class="n">' + x.linha + '</td></tr>';
    });
    h += '<tr class="total"><td colspan="4">Total</td><td class="n">' + esc(C.brl(linha.total)) + '</td><td></td></tr></tbody></table>';
    alvo.appendChild(el('div', { class: 'tabela-rolagem', html: h }));
    if (ls.length > 500) alvo.appendChild(el('p', { class: 'dre-dica', texto: 'Mostrando os 500 primeiros. Todos estão no Excel (botão Baixar DRE em Excel).' }));
  }
  function renderResultado() {
    var a = $('area-resultado');
    a.innerHTML = '';
    var c = cliente();
    if (!c || !lancamentos().length) {
      a.appendChild(nota('info', 'O resultado aparece aqui depois que o relatório for lido no passo 2.'));
      return;
    }
    var t = calcularTela(), res = t.res;
    var ult = res.meses[res.meses.length - 1];
    if (res.aClassificar.qtd) {
      a.appendChild(nota('atencao', [
        'Há ' + C.brl(res.aClassificar.absoluto) + ' em ' + plural(res.aClassificar.qtd, 'lançamento', 'lançamentos') + ' a classificar. Eles ficam fora do resultado até você escolher a linha no passo 3. ',
        botao('Ir para o passo 3', function () { irPara('passo-3'); })
      ]));
    }
    if (D.mesesDe(lancamentos()).length > 12) a.appendChild(nota('info', 'O relatório tem mais de 12 meses. A tela mostra os últimos 12.'));

    a.appendChild(el('h3', { class: 'dre-h3', texto: 'Números de ' + C.mesLongo(ult) }));
    var cartoes = el('div', { class: 'cartoes' });
    D.cartoes(res).forEach(function (k) {
      cartoes.appendChild(el('div', { class: 'cartao ' + k.classe }, [el('small', { texto: k.rotulo }), el('b', { texto: k.texto }), el('span', { texto: k.variacao })]));
    });
    a.appendChild(cartoes);

    var cor1 = D.corValida(c.cor1, '#0B1B33'), cor2 = D.corValida(c.cor2, '#5E9BD6');
    var g1 = el('div', { class: 'dre-bloco' }, [el('h3', { texto: 'Receita, despesas e resultado por mês' })]);
    g1.appendChild(el('div', { html: U.graficoBarras(D.dadosGrafico(res, [cor2, '#C9824A', cor1.toUpperCase() === '#FFFFFF' ? '#0B1B33' : cor1]), { titulo: 'Receita, despesas e resultado por mês' }) }));
    var saidas = D.maioresSaidas(res, 8);
    var g2 = el('div', { class: 'dre-bloco' }, [el('h3', { texto: 'Para onde vai o dinheiro' })]);
    g2.appendChild(saidas.length ? el('div', { html: U.barrasHorizontais(saidas, cor2) }) : el('p', { class: 'dre-dica', texto: 'Sem saídas no período.' }));
    g2.appendChild(el('p', { class: 'dre-dica', texto: 'As 8 maiores saídas, somando os meses da tela.' }));
    a.appendChild(el('div', { class: 'duas dre-graficos' }, [g1, g2]));

    var pontos = el('ul', { class: 'dre-pontos' });
    D.pontosAtencao(res).forEach(function (p) { pontos.appendChild(el('li', { class: p.tipo, texto: p.texto })); });
    a.appendChild(el('div', { class: 'dre-bloco' }, [el('h3', { texto: 'Pontos de atenção' }), pontos]));

    a.appendChild(el('h3', { class: 'dre-h3', texto: c.modelo.nome + ': ' + c.nome }));
    a.appendChild(el('p', { class: 'dre-dica', texto: 'Clique numa linha para ver os lançamentos dela. Percentuais sobre a receita bruta. Passe o mouse nos subtotais para ver a margem de cada mês.' }));
    var caixaTabela = el('div', { class: 'tabela-rolagem', html: tabelaDRE(res) });
    var conf = el('div', { class: 'dre-conferencia', id: 'dre-conferencia' });
    function abrir(tr) {
      if (!tr) return;
      R.conferencia = R.conferencia === tr.getAttribute('data-id') ? null : tr.getAttribute('data-id');
      renderResultado();
      if (R.conferencia) irPara('dre-conferencia');
    }
    caixaTabela.addEventListener('click', function (ev) { abrir(ev.target.closest ? ev.target.closest('tr[data-id]') : null); });
    caixaTabela.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter' && ev.key !== ' ') return;
      var tr = ev.target.closest ? ev.target.closest('tr[data-id]') : null;
      if (tr) { ev.preventDefault(); abrir(tr); }
    });
    a.appendChild(caixaTabela);
    a.appendChild(conf);
    renderConferencia(res, conf);

    // baixar
    a.appendChild(el('h3', { class: 'dre-h3', texto: 'Painel para o cliente' }));
    var todos = D.mesesDe(lancamentos());
    var fim = R.painelFim && todos.indexOf(R.painelFim) >= 0 ? R.painelFim : todos[todos.length - 1];
    var selFim = el('select');
    todos.slice().reverse().forEach(function (m) { selFim.appendChild(el('option', { value: m, texto: C.mesLongo(m) })); });
    selFim.value = fim;
    selFim.addEventListener('change', function () { R.painelFim = selFim.value; });
    var selQtd = el('select');
    [1, 3, 6, 12].forEach(function (q) { selQtd.appendChild(el('option', { value: String(q), texto: q === 1 ? 'Só o mês final' : 'Os últimos ' + q + ' meses' })); });
    selQtd.value = String(R.painelQtd);
    selQtd.addEventListener('change', function () { R.painelQtd = Number(selQtd.value); });
    var bpo = el('input', { maxlength: '80', placeholder: 'Ex.: Exata BPO Financeiro' });
    bpo.value = E.config.bpo || '';
    bpo.addEventListener('change', function () { E.config.bpo = bpo.value.trim().slice(0, 80); salvar(); });
    a.appendChild(el('div', { class: 'linha-campos nao-imprimir' }, [
      el('label', { class: 'campo' }, [el('span', { texto: 'Mês final do painel' }), selFim]),
      el('label', { class: 'campo' }, [el('span', { texto: 'Quantos meses mostrar' }), selQtd]),
      el('label', { class: 'campo' }, [el('span', { texto: 'Nome do seu BPO (rodapé do painel)' }), bpo])
    ]));
    a.appendChild(el('div', { class: 'botoes dre-botoes-final nao-imprimir' }, [
      botao('Baixar DRE em Excel', function () { baixarExcel(); }),
      botao('Baixar painel do cliente', function () { baixarPainel(); }, 'btn-forte'),
      botao('Imprimir ou salvar em PDF', function () { imprimirPainel(); })
    ]));
    a.appendChild(nota('info', [
      el('b', { texto: 'Como mandar para o cliente. ' }),
      'Por e-mail: anexe o arquivo do painel (.html), que abre direto no navegador do cliente, ou o PDF. ',
      'Pelo Google Drive: use o PDF, porque o Drive não mostra o .html como página. Salve sempre com o mesmo nome (' + nomePainel(c) + '.pdf) na pasta do cliente pelo Google Drive para computador: o arquivo é substituído e o link que o cliente já tem continua o mesmo. ',
      'Para o PDF, clique em Imprimir ou salvar em PDF e escolha "Salvar como PDF" no destino.'
    ]));
  }
  function confirmarPendentes(res) {
    if (!res.aClassificar.qtd) return true;
    return window.confirm('Ainda há ' + C.brl(res.aClassificar.absoluto) + ' a classificar no período. Esses valores aparecem no painel em "Fora do resultado" e não entram no resultado. Continuar mesmo assim?');
  }
  function baixarExcel() {
    var c = cliente();
    var res = calcularTela().res;
    U.baixarExcel('dre-' + U.nomeArquivo(c.nome) + '.xlsx', D.abasExcel(res, c));
    U.avisar('Excel baixado.');
  }
  function baixarPainel() {
    var c = cliente();
    var res = calcularPainel();
    if (!confirmarPendentes(res)) return;
    U.baixar(nomePainel(c) + '.html', D.gerarPainel(res, c, opcoesPainel()), 'text/html;charset=utf-8');
    U.avisar('Painel baixado: ' + nomePainel(c) + '.html');
  }
  function imprimirPainel() {
    var c = cliente();
    var res = calcularPainel();
    if (!confirmarPendentes(res)) return;
    var partes = D.painelPartes(res, c, opcoesPainel());
    var area = $('painel-impressao');
    area.innerHTML = '<style>' + partes.css + '</style>' + partes.corpo;
    var tituloAntes = document.title;
    document.title = nomePainel(c); // vira o nome sugerido do PDF
    document.body.classList.add('imprimindo-painel');
    function terminar() {
      document.body.classList.remove('imprimindo-painel');
      document.title = tituloAntes;
      window.removeEventListener('afterprint', terminar);
    }
    window.addEventListener('afterprint', terminar);
    window.print();
  }

  // ---------- backup ----------
  function salvarBackup() {
    U.baixar('backup-dre-' + hoje() + '.json', JSON.stringify(E, null, 1), 'application/json');
    U.avisar('Backup baixado. Guarde o arquivo num lugar seguro.');
  }
  function restaurarBackup() {
    U.escolherArquivo('.json,application/json').then(function (arq) {
      if (!arq) return null;
      return U.lerJSON(arq);
    }).then(function (obj) {
      if (obj == null) return;
      if (!D.ehBackup(obj)) throw new Error('Esse arquivo não é um backup da DRE.');
      if (!window.confirm('Restaurar o backup com ' + plural(obj.clientes.length, 'cliente', 'clientes') + '? Os clientes que estão neste navegador serão trocados pelos do backup.')) return;
      E = D.carregarEstado(obj);
      R.form = null; R.conferencia = null; R.painelFim = null;
      salvar();
      if (R.abas && cliente()) prepararColunas();
      renderTudo();
      U.avisar('Backup restaurado.');
    }).catch(function (e) { U.avisar(e.message, 'erro'); });
  }

  // ---------- tudo ----------
  function marcarPassos() {
    var c = cliente(), lanc = lancamentos();
    $('passo-1').classList.toggle('feito', !!c && !R.form);
    $('passo-2').classList.toggle('feito', !!c && lanc.length > 0);
    var ok3 = false;
    if (c && lanc.length) {
      var cc = D.classificarCategorias(lanc, c);
      ok3 = cc.lista.every(function (x) { return x.status === 'confirmada' && x.linha !== D.CLASSIFICAR; });
    }
    $('passo-3').classList.toggle('feito', ok3);
  }
  function renderTudo() {
    renderCliente();
    renderArquivo();
    renderModelo();
    renderLigacoes();
    renderResultado();
    marcarPassos();
  }

  $('btn-backup').addEventListener('click', salvarBackup);
  $('btn-restaurar').addEventListener('click', restaurarBackup);
  renderAvisos();
  if (!E.clientes.length) R.form = { id: null, nome: '', cor1: '#0B1B33', cor2: '#5E9BD6', logo: '' };
  renderTudo();
})();

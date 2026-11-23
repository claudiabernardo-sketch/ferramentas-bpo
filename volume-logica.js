/* Monitor de volume, lógica sem tela.
   Conta lançamentos por mês em extratos e relatórios (Excel, CSV, OFX), guarda o volume
   de cada cliente e compara com o mês em que o preço atual foi combinado.
   Funciona no navegador (window.Volume) e no Node (require), para os testes. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./comum.js'));
  else raiz.Volume = fabrica(raiz.Comum);
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';

  var CHAVE = 'ferramentas-bpo:volume:v1';
  var PREMISSAS_PADRAO = { lancamento: 2, nota: 3, funcionario: 15, conta: 60 };
  var LIMITE_PADRAO = 0.2;
  var EPS = 1e-9;

  // ---------- colunas que procuramos nos arquivos ----------
  var CAMPOS = [
    { chave: 'data', rotulo: 'Data', obrigatorio: true, ajuda: 'Data de cada lançamento. É ela que diz o mês.',
      sinonimos: ['data', 'data lancamento', 'data de lancamento', 'data do lancamento', 'data movimento', 'data do movimento',
        'data de movimento', 'data mov', 'data de pagamento', 'data pagamento', 'data do pagamento', 'data de recebimento',
        'data recebimento', 'data contabil', 'data da transacao', 'data transacao', 'data de competencia', 'data competencia',
        'dt lancamento', 'dt movimento', 'dt mov', 'dt', 'dia', 'data efetiva', 'data baixa', 'data de baixa', 'data de quitacao'],
      evitar: ['emissao', 'cadastro', 'criacao', 'inclusao'] },
    { chave: 'descricao', rotulo: 'Histórico ou descrição', ajuda: 'Serve para achar as linhas de saldo.',
      sinonimos: ['historico', 'descricao', 'lancamento', 'lancamentos', 'historico do lancamento', 'descricao do lancamento',
        'detalhe', 'detalhes', 'memo', 'observacao', 'observacoes', 'complemento', 'favorecido', 'nome', 'movimentacao', 'transacao'] },
    { chave: 'valor', rotulo: 'Valor', ajuda: 'Linhas com valor zero não contam.',
      sinonimos: ['valor', 'valor (r$)', 'valor r$', 'valor em r$', 'valor lancamento', 'valor do lancamento', 'valor pago',
        'valor recebido', 'valor liquido', 'valor movimento', 'montante', 'quantia', 'vlr', 'vl'],
      evitar: ['saldo', 'original', 'credito', 'debito'] },
    { chave: 'credito', rotulo: 'Crédito (entradas)',
      sinonimos: ['credito', 'creditos', 'credito (r$)', 'valor credito', 'entrada', 'entradas', 'recebimentos', 'receitas'] },
    { chave: 'debito', rotulo: 'Débito (saídas)',
      sinonimos: ['debito', 'debitos', 'debito (r$)', 'valor debito', 'saida', 'saidas', 'pagamentos', 'despesas'] },
    { chave: 'saldo', rotulo: 'Saldo', ajuda: 'Só para mostrar; o saldo não é lançamento.',
      sinonimos: ['saldo', 'saldo (r$)', 'saldo do dia', 'saldo atual', 'saldo final'] }
  ];

  // ---------- linhas que não são lançamento ----------
  function ehSaldo(texto) {
    var s = C.simples(texto);
    if (!s) return false;
    if (/^s a l d o\b/.test(s)) return true;
    return /^saldo( anterior| inicial| final| do dia| dia| disponivel| em conta| em c c| atual| total| bloqueado| bancario| parcial| conta| da conta| em \d|$)/.test(s);
  }
  function ehTotal(linha) {
    if (C.pareceTotal(linha)) return true;
    return linha.some(function (v) {
      var s = C.simples(v);
      return /^(sub ?)?total( geral| do periodo| do mes| de lancamentos| dos lancamentos| de creditos| de debitos| entradas| saidas)?:?$/.test(s) || /^totais\b/.test(s);
    });
  }

  // ---------- planilha: acha cabeçalho e colunas ----------
  function prepararAba(linhas) {
    var cab = C.acharCabecalho(linhas, CAMPOS);
    var cabecalho = (linhas[cab] || []).map(function (v) { return String(v == null ? '' : v); });
    var escolha = C.detectarColunas(cabecalho, CAMPOS);
    var contagem = contarLinhas(linhas, cab, escolha);
    return { inicio: cab, cabecalho: cabecalho, escolha: escolha, contagem: contagem, nota: contagem.contadas * 10 + (escolha.data >= 0 ? 5 : 0) };
  }
  // Escolhe a aba com mais lançamentos datados
  function melhorAba(abas) {
    var melhor = 0, nota = -1;
    abas.forEach(function (a, i) {
      var p = prepararAba(a.linhas);
      if (p.nota > nota) { nota = p.nota; melhor = i; }
    });
    return melhor;
  }

  // Conta lançamentos por mês. escolha: {data, descricao, valor, credito, debito, saldo} com índice de coluna (-1 = não tem)
  function contarLinhas(linhas, inicio, escolha) {
    var r = { porMes: {}, lidas: 0, contadas: 0, ignoradas: { semData: 0, saldo: 0, total: 0, zero: 0 }, exemplos: { semData: [], saldo: [], total: [], zero: [] } };
    if (escolha.data == null || escolha.data < 0) return r;
    var colValor = ['valor', 'credito', 'debito'].filter(function (k) { return escolha[k] != null && escolha[k] >= 0; });
    function guardaExemplo(tipo, num, linha) {
      if (r.exemplos[tipo].length < 5) r.exemplos[tipo].push('linha ' + num + ': ' + linha.filter(function (v) { return !C.vazio(v); }).join(' | ').slice(0, 90));
    }
    for (var i = inicio + 1; i < linhas.length; i++) {
      var l = linhas[i] || [];
      if (!l.some(function (v) { return !C.vazio(v); })) continue;
      r.lidas++;
      var num = i + 1;
      if (l.some(function (v) { return typeof v === 'string' && ehSaldo(v); })) { r.ignoradas.saldo++; guardaExemplo('saldo', num, l); continue; }
      if (ehTotal(l)) { r.ignoradas.total++; guardaExemplo('total', num, l); continue; }
      var iso = C.data(l[escolha.data]);
      if (!iso) { r.ignoradas.semData++; guardaExemplo('semData', num, l); continue; }
      if (colValor.length) {
        var tot = 0;
        colValor.forEach(function (k) { var v = C.valor(l[escolha[k]]); if (v) tot += Math.abs(v); });
        if (!(tot > 0)) { r.ignoradas.zero++; guardaExemplo('zero', num, l); continue; }
      }
      var mes = C.mesDe(iso);
      r.porMes[mes] = (r.porMes[mes] || 0) + 1;
      r.contadas++;
    }
    return r;
  }

  // ---------- OFX (arquivo de banco), SGML antigo sem fechamento e XML ----------
  function tag(texto, nome) {
    var m = texto.match(new RegExp('<' + nome + '>\\s*([^<\\r\\n]*)', 'i'));
    return m ? m[1].trim() : '';
  }
  function dataOFX(t) {
    var m = String(t || '').match(/^(\d{4})(\d{2})(\d{2})/);
    return m ? C.data(m[1] + '-' + m[2] + '-' + m[3]) : null;
  }
  function pareceOFX(texto) { return /<OFX>|<STMTTRN>/i.test(texto) || /OFXHEADER/i.test(texto); }
  // Devolve {contas:[{conta, banco, porMes, contadas}], contadas, ignoradas:{semData, zero, saldo:0, total:0}, lidas}
  function lerOFX(texto) {
    var r = { contas: [], lidas: 0, contadas: 0, ignoradas: { semData: 0, saldo: 0, total: 0, zero: 0 }, exemplos: { semData: [], saldo: [], total: [], zero: [] } };
    var banco = tag(texto, 'BANKID') || tag(texto, 'ORG');
    var blocos = texto.split(/<(?:CC)?STMTRS>/i);
    if (blocos.length < 2) blocos = ['', texto];
    for (var b = 1; b < blocos.length; b++) {
      var bloco = blocos[b];
      var conta = { conta: tag(bloco, 'ACCTID') || ('conta ' + b), banco: tag(bloco, 'BANKID') || banco, porMes: {}, contadas: 0 };
      var trans = bloco.split(/<STMTTRN>/i).slice(1);
      trans.forEach(function (t, k) {
        t = t.split(/<\/STMTTRN>/i)[0];
        r.lidas++;
        var iso = dataOFX(tag(t, 'DTPOSTED'));
        var memo = tag(t, 'MEMO') || tag(t, 'NAME');
        if (!iso) { r.ignoradas.semData++; if (r.exemplos.semData.length < 5) r.exemplos.semData.push('lançamento ' + (k + 1) + ': ' + memo); return; }
        if (ehSaldo(memo)) { r.ignoradas.saldo++; if (r.exemplos.saldo.length < 5) r.exemplos.saldo.push(C.dataBR(iso) + ': ' + memo); return; }
        var v = C.valor(tag(t, 'TRNAMT'));
        if (!v) { r.ignoradas.zero++; if (r.exemplos.zero.length < 5) r.exemplos.zero.push(C.dataBR(iso) + ': ' + memo); return; }
        var mes = C.mesDe(iso);
        conta.porMes[mes] = (conta.porMes[mes] || 0) + 1;
        conta.contadas++; r.contadas++;
      });
      if (trans.length) r.contas.push(conta);
    }
    return r;
  }
  // Nome de cada fonte: arquivo com uma conta usa o nome do arquivo; com várias, uma fonte por conta
  function fontesDoOFX(nomeArquivo, lido) {
    if (lido.contas.length <= 1) return [{ nome: nomeArquivo, porMes: lido.contas.length ? lido.contas[0].porMes : {} }];
    return lido.contas.map(function (c) { return { nome: nomeArquivo + ' | conta ' + c.conta, porMes: c.porMes }; });
  }

  // ---------- estado e clientes ----------
  function novoEstado() {
    return { versao: 1, clientes: [], premissas: copia(PREMISSAS_PADRAO), limite: LIMITE_PADRAO, ultimoBackup: null };
  }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }
  function novoCliente(nome, honorario, mesBase) {
    return { id: C.id(), nome: String(nome || '').trim() || 'Cliente sem nome', honorario: numOuNulo(honorario), mesBase: mesValido(mesBase) ? mesBase : '', meses: {} };
  }
  function mesValido(m) { return typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m); }
  function numOuNulo(v) {
    if (v == null || v === '') return null;
    var n = typeof v === 'number' ? v : C.valor(v);
    return n == null || !isFinite(n) ? null : n;
  }
  function inteiroOuNulo(v) {
    var n = numOuNulo(v);
    return n == null ? null : Math.max(0, Math.round(n));
  }
  function mesVazio() { return { fontes: {}, contas: 0, funcionarios: null, notas: null, contasManual: false, lancManual: null }; }
  function garantirMes(cliente, mes) {
    if (!cliente.meses[mes]) cliente.meses[mes] = mesVazio();
    return cliente.meses[mes];
  }
  function mesTemAlgo(m) {
    return Object.keys(m.fontes || {}).length > 0 || m.contasManual || m.lancManual != null || m.funcionarios != null || m.notas != null;
  }
  // Guarda a contagem de um arquivo. Mesmo nome substitui; nomes diferentes somam.
  function registrarFonte(cliente, nomeFonte, porMes) {
    Object.keys(cliente.meses).forEach(function (mes) {
      var m = cliente.meses[mes];
      if (m.fontes && m.fontes[nomeFonte] != null) {
        delete m.fontes[nomeFonte];
        if (!mesTemAlgo(m) && !m._manual) delete cliente.meses[mes];
      }
    });
    Object.keys(porMes || {}).forEach(function (mes) {
      if (!porMes[mes]) return;
      garantirMes(cliente, mes).fontes[nomeFonte] = porMes[mes];
    });
  }
  function removerFonte(cliente, mes, nomeFonte) {
    var m = cliente.meses[mes];
    if (m && m.fontes) delete m.fontes[nomeFonte];
  }
  function adicionarMes(cliente, mes) {
    if (!mesValido(mes)) return false;
    var m = garantirMes(cliente, mes);
    m._manual = true;
    return true;
  }
  function excluirMes(cliente, mes) { delete cliente.meses[mes]; if (cliente.mesBase === mes) cliente.mesBase = ''; }
  // campo: lancamentos, contas, funcionarios, notas. Valor vazio volta ao automático (lançamentos e contas) ou a "não informado".
  function definirValor(cliente, mes, campo, valor) {
    var m = garantirMes(cliente, mes);
    var n = inteiroOuNulo(valor);
    if (campo === 'lancamentos') m.lancManual = n;
    else if (campo === 'contas') { m.contasManual = n != null; m.contas = n == null ? 0 : n; }
    else if (campo === 'funcionarios') m.funcionarios = n;
    else if (campo === 'notas') m.notas = n;
    return m;
  }
  function somaFontes(m) {
    return Object.keys(m.fontes || {}).reduce(function (s, k) { return s + (Number(m.fontes[k]) || 0); }, 0);
  }
  function lancamentosDoMes(m) { return m.lancManual != null ? m.lancManual : somaFontes(m); }
  function contasDoMes(m) { return m.contasManual ? (Number(m.contas) || 0) : Object.keys(m.fontes || {}).length; }
  function indicadoresMes(m) {
    return { lancamentos: lancamentosDoMes(m), contas: contasDoMes(m), funcionarios: m.funcionarios == null ? null : m.funcionarios, notas: m.notas == null ? null : m.notas };
  }
  function mesesOrdenados(cliente) { return Object.keys(cliente.meses || {}).filter(mesValido).sort(); }

  // ---------- horas de referência ----------
  var PESOS = { lancamentos: 'lancamento', notas: 'nota', funcionarios: 'funcionario', contas: 'conta' };
  var INDICADORES = ['lancamentos', 'contas', 'funcionarios', 'notas'];
  var NOMES = { lancamentos: 'lançamentos', contas: 'contas bancárias', funcionarios: 'funcionários', notas: 'notas fiscais' };
  // ignorar: lista de indicadores que ficam de fora (não informados em um dos meses comparados)
  function horas(ind, premissas, ignorar) {
    premissas = premissas || PREMISSAS_PADRAO;
    var min = 0;
    INDICADORES.forEach(function (k) {
      if (ignorar && ignorar.indexOf(k) >= 0) return;
      min += (Number(ind[k]) || 0) * (Number(premissas[PESOS[k]]) || 0);
    });
    return min / 60;
  }
  function variacao(base, agora) {
    if (base == null || agora == null) return null;
    if (base === 0) return null;
    return (agora - base) / base;
  }

  // ---------- comparação de um cliente ----------
  function resumo(cliente, premissas, limite) {
    premissas = premissas || PREMISSAS_PADRAO;
    limite = limite == null ? LIMITE_PADRAO : limite;
    var meses = mesesOrdenados(cliente);
    var r = { id: cliente.id, nome: cliente.nome, honorario: cliente.honorario, meses: meses, avisos: [], indicadores: {},
      status: 'vazio', mesBase: null, ultimo: null, anterior: null, horasBase: null, horasAgora: null, varHoras: null,
      hhBase: null, hhAgora: null, proporcional: null, diferenca: null, maiorVariacao: null, alertas: [] };
    if (!meses.length) { r.avisos.push('Ainda não tem nenhum mês com dados.'); return r; }
    var base = cliente.mesBase && cliente.meses[cliente.mesBase] ? cliente.mesBase : meses[0];
    if (cliente.mesBase && !cliente.meses[cliente.mesBase]) r.avisos.push('O mês base ' + C.mesCurto(cliente.mesBase) + ' não tem dados. Usei ' + C.mesCurto(base) + ', o primeiro mês com dados.');
    if (!cliente.mesBase) r.avisos.push('Mês base não informado. Usei ' + C.mesCurto(base) + ', o primeiro mês com dados.');
    var ultimo = meses[meses.length - 1];
    var idxUlt = meses.length - 1;
    r.mesBase = base; r.ultimo = ultimo; r.anterior = idxUlt > 0 ? meses[idxUlt - 1] : null;
    var iB = indicadoresMes(cliente.meses[base]), iA = indicadoresMes(cliente.meses[ultimo]);
    var iP = r.anterior ? indicadoresMes(cliente.meses[r.anterior]) : null;
    var ignorar = [];
    INDICADORES.forEach(function (k) {
      var b = iB[k], a = iA[k];
      var ind = { base: b, agora: a, variacao: variacao(b, a), novo: b === 0 && a > 0, semBase: b == null && a != null, semAgora: a == null && b != null,
        anterior: iP ? iP[k] : null, varAnterior: iP ? variacao(iP[k], a) : null, alerta: false };
      if (b == null || a == null) ignorar.push(k);
      r.indicadores[k] = ind;
    });
    if (base === ultimo) {
      r.status = 'precisa';
      r.avisos.push(meses.length === 1 ? 'Precisa de mais um mês para comparar.' : 'O mês base é o último mês com dados. Precisa de mais um mês para comparar.');
      r.horasBase = r.horasAgora = horas(iB, premissas, ignorar);
      if (cliente.honorario && r.horasBase > 0) r.hhBase = r.hhAgora = cliente.honorario / r.horasBase;
      return r;
    }
    INDICADORES.forEach(function (k) {
      var ind = r.indicadores[k];
      if (ind.semBase) r.avisos.push(cap(NOMES[k]) + ' não informados em ' + C.mesCurto(base) + ': ficaram de fora da comparação de horas.');
      else if (ind.semAgora) r.avisos.push(cap(NOMES[k]) + ' não informados em ' + C.mesCurto(ultimo) + ': ficaram de fora da comparação de horas.');
      ind.alerta = (ind.variacao != null && ind.variacao >= limite - EPS) || ind.novo;
      if (ind.alerta) r.alertas.push(k);
      if (ind.variacao != null && (r.maiorVariacao == null || ind.variacao > r.maiorVariacao)) r.maiorVariacao = ind.variacao;
      if (ind.novo && (r.maiorVariacao == null || r.maiorVariacao < 1)) r.maiorVariacao = Math.max(r.maiorVariacao || 0, 1);
    });
    r.horasBase = horas(iB, premissas, ignorar);
    r.horasAgora = horas(iA, premissas, ignorar);
    r.varHoras = variacao(r.horasBase, r.horasAgora);
    if (cliente.honorario > 0) {
      if (r.horasBase > 0) { r.hhBase = cliente.honorario / r.horasBase; r.proporcional = C.arred(cliente.honorario * r.horasAgora / r.horasBase); r.diferenca = C.arred(r.proporcional - cliente.honorario); }
      if (r.horasAgora > 0) r.hhAgora = cliente.honorario / r.horasAgora;
    } else r.avisos.push('Informe o honorário para calcular o valor por hora e o proporcional.');
    r.status = r.alertas.length ? 'revisar' : 'ok';
    return r;
  }
  function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }

  var ORDEM_STATUS = { revisar: 0, ok: 1, precisa: 2, vazio: 3 };
  function ordenarResumos(lista) {
    return lista.slice().sort(function (a, b) {
      var s = ORDEM_STATUS[a.status] - ORDEM_STATUS[b.status];
      if (s) return s;
      var va = a.maiorVariacao == null ? -Infinity : a.maiorVariacao, vb = b.maiorVariacao == null ? -Infinity : b.maiorVariacao;
      if (va !== vb) return vb - va;
      return String(a.nome).localeCompare(String(b.nome), 'pt-BR');
    });
  }
  function resumos(estado) {
    return ordenarResumos(estado.clientes.map(function (c) { return resumo(c, estado.premissas, estado.limite); }));
  }

  // ---------- texto para o cliente ----------
  function maisMenos(v) {
    if (v == null) return '';
    if (Math.abs(v) < EPS) return 'o mesmo número';
    return C.pct(Math.abs(v)) + (v > 0 ? ' a mais' : ' a menos');
  }
  function plural(n, um, varios) { return C.num(n) + ' ' + (n === 1 ? um : varios); }
  var ROTULOS = {
    lancamentos: ['lançamento no mês', 'lançamentos no mês'],
    contas: ['conta bancária', 'contas bancárias'],
    funcionarios: ['funcionário na folha', 'funcionários na folha'],
    notas: ['nota fiscal emitida', 'notas fiscais emitidas']
  };
  function textoCliente(cliente, r, opcoes) {
    opcoes = opcoes || {};
    if (!r || r.status === 'vazio' || r.status === 'precisa') return '';
    var linhasBase = [], linhasAgora = [];
    INDICADORES.forEach(function (k) {
      var ind = r.indicadores[k];
      if (ind.base == null || ind.agora == null) return;
      if (!ind.base && !ind.agora) return;
      linhasBase.push('* ' + plural(ind.base, ROTULOS[k][0], ROTULOS[k][1]));
      var extra = ind.variacao != null ? ' (' + maisMenos(ind.variacao) + ')' : (ind.novo ? ' (antes não tinha)' : '');
      linhasAgora.push('* ' + plural(ind.agora, ROTULOS[k][0], ROTULOS[k][1]) + extra);
    });
    var primeiroNome = String(opcoes.contato || '').trim();
    var t = [];
    t.push('Olá' + (primeiroNome ? ', ' + primeiroNome : '') + '! Tudo bem?');
    t.push('');
    t.push('Acompanho todo mês o volume de trabalho financeiro da ' + cliente.nome + ' e quero compartilhar com você o que os números mostram.');
    t.push('');
    t.push('Quando combinamos o valor atual' + (cliente.honorario ? ' (' + C.brl(cliente.honorario) + ' por mês)' : '') + ', em ' + C.mesLongo(r.mesBase) + ', a rotina tinha:');
    t = t.concat(linhasBase);
    t.push('');
    t.push('Em ' + C.mesLongo(r.ultimo) + ', foram:');
    t = t.concat(linhasAgora);
    t.push('');
    if (r.horasBase > 0 && r.varHoras != null) {
      t.push('Somando tudo, o tempo de trabalho necessário passou de cerca de ' + C.num(r.horasBase, 1) + ' horas para ' + C.num(r.horasAgora, 1) + ' horas por mês (' + maisMenos(r.varHoras) + ').');
      t.push('');
    }
    if (r.proporcional != null && r.proporcional > (cliente.honorario || 0)) {
      t.push('Esse crescimento é um ótimo sinal para o seu negócio! Para continuar cuidando das suas finanças com a mesma atenção e qualidade, o valor proporcional a esse novo volume fica em ' + C.brl(r.proporcional) + ' por mês.');
      t.push('');
      t.push('Ele mantém exatamente a mesma base de cálculo de quando combinamos o valor atual: o que muda é só a quantidade de trabalho.');
    } else {
      t.push('Por enquanto o volume está estável e o valor atual continua adequado. Sigo acompanhando e aviso se algo mudar.');
    }
    t.push('');
    t.push('Fico à disposição para conversarmos. Se preferir, marcamos uma conversa rápida para eu mostrar os detalhes.');
    t.push('');
    t.push('Um abraço,');
    if (opcoes.assinatura) t.push(String(opcoes.assinatura));
    return t.join('\n');
  }

  // ---------- Excel ----------
  var ROT_STATUS = { revisar: 'Revisar preço', ok: 'ok', precisa: 'Precisa de mais um mês para comparar', vazio: 'Sem dados' };
  function linhasPainel(estado) {
    var cab = ['Cliente', 'Situação', 'Honorário atual (R$)', 'Mês base', 'Último mês'];
    INDICADORES.forEach(function (k) { cab.push(cap(NOMES[k]) + ' base', cap(NOMES[k]) + ' agora', cap(NOMES[k]) + ' variação'); });
    cab.push('Horas de referência base', 'Horas de referência agora', 'Variação das horas', 'Honorário por hora base (R$)', 'Honorário por hora agora (R$)', 'Honorário proporcional ao volume (R$)', 'Mês anterior', 'Lançamentos variação contra o mês anterior');
    var out = [cab];
    resumos(estado).forEach(function (r) {
      var l = [r.nome, ROT_STATUS[r.status], r.honorario, r.mesBase ? C.mesCurto(r.mesBase) : '', r.ultimo ? C.mesCurto(r.ultimo) : ''];
      INDICADORES.forEach(function (k) {
        var ind = r.indicadores[k] || {};
        l.push(nz(ind.base), nz(ind.agora), nz(ind.variacao));
      });
      l.push(rd(r.horasBase), rd(r.horasAgora), nz(r.varHoras), rd(r.hhBase), rd(r.hhAgora), nz(r.proporcional), r.anterior ? C.mesCurto(r.anterior) : '',
        r.indicadores.lancamentos ? nz(r.indicadores.lancamentos.varAnterior) : '');
      out.push(l);
    });
    return out;
  }
  function nz(v) { return v == null || !isFinite(v) ? '' : v; }
  function rd(v) { return v == null || !isFinite(v) ? '' : C.arred(v); }
  function linhasHistorico(estado) {
    var out = [['Cliente', 'Mês', 'Lançamentos', 'Contas bancárias', 'Funcionários', 'Notas fiscais', 'Horas de referência', 'Arquivos', 'Digitado à mão']];
    estado.clientes.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); }).forEach(function (c) {
      mesesOrdenados(c).forEach(function (mes) {
        var m = c.meses[mes], ind = indicadoresMes(m);
        var manual = [];
        if (m.lancManual != null) manual.push('lançamentos');
        if (m.contasManual) manual.push('contas');
        out.push([c.nome, C.mesCurto(mes), ind.lancamentos, ind.contas, nz(ind.funcionarios), nz(ind.notas), C.arred(horas(ind, estado.premissas)),
          Object.keys(m.fontes || {}).map(function (f) { return f + ' (' + m.fontes[f] + ')'; }).join('; '), manual.join(', ')]);
      });
    });
    return out;
  }

  // ---------- backup ----------
  function normalizar(e) {
    var n = novoEstado();
    if (!e || typeof e !== 'object') return n;
    if (e.premissas) Object.keys(PREMISSAS_PADRAO).forEach(function (k) { var v = numOuNulo(e.premissas[k]); if (v != null && v >= 0) n.premissas[k] = v; });
    var lim = numOuNulo(e.limite);
    if (lim != null && lim > 0) n.limite = lim;
    n.ultimoBackup = typeof e.ultimoBackup === 'string' ? e.ultimoBackup : null;
    (Array.isArray(e.clientes) ? e.clientes : []).forEach(function (c) {
      if (!c || typeof c !== 'object') return;
      var nc = novoCliente(c.nome, c.honorario, c.mesBase);
      if (typeof c.id === 'string' && c.id) nc.id = c.id;
      Object.keys(c.meses || {}).forEach(function (mes) {
        if (!mesValido(mes)) return;
        var m = c.meses[mes] || {}, nm = mesVazio();
        Object.keys(m.fontes || {}).forEach(function (f) { var q = inteiroOuNulo(m.fontes[f]); if (q) nm.fontes[f] = q; });
        nm.contasManual = !!m.contasManual;
        nm.contas = inteiroOuNulo(m.contas) || 0;
        nm.funcionarios = inteiroOuNulo(m.funcionarios);
        nm.notas = inteiroOuNulo(m.notas);
        nm.lancManual = inteiroOuNulo(m.lancManual);
        if (m._manual) nm._manual = true;
        nc.meses[mes] = nm;
      });
      n.clientes.push(nc);
    });
    return n;
  }
  function criarBackup(estado, agoraIso) {
    return { ferramenta: 'monitor-de-volume', versao: 1, salvoEm: agoraIso || new Date().toISOString(), dados: copia(estado) };
  }
  function lerBackup(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('Esse arquivo não é um backup do Monitor de volume.');
    var dados = obj.ferramenta === 'monitor-de-volume' ? obj.dados : (Array.isArray(obj.clientes) ? obj : null);
    if (!dados || !Array.isArray(dados.clientes)) throw new Error('Esse arquivo não é um backup do Monitor de volume.');
    return normalizar(dados);
  }
  function diasDesde(iso, agora) {
    if (!iso) return null;
    var t = Date.parse(iso), a = agora ? Date.parse(agora) : Date.now();
    if (!isFinite(t)) return null;
    return Math.floor((a - t) / 86400000);
  }

  return {
    CHAVE: CHAVE, CAMPOS: CAMPOS, PREMISSAS_PADRAO: PREMISSAS_PADRAO, LIMITE_PADRAO: LIMITE_PADRAO, INDICADORES: INDICADORES, NOMES: NOMES, ROT_STATUS: ROT_STATUS,
    ehSaldo: ehSaldo, ehTotal: ehTotal, prepararAba: prepararAba, melhorAba: melhorAba, contarLinhas: contarLinhas,
    pareceOFX: pareceOFX, lerOFX: lerOFX, fontesDoOFX: fontesDoOFX,
    novoEstado: novoEstado, novoCliente: novoCliente, mesValido: mesValido, registrarFonte: registrarFonte, removerFonte: removerFonte,
    adicionarMes: adicionarMes, excluirMes: excluirMes, definirValor: definirValor, lancamentosDoMes: lancamentosDoMes, contasDoMes: contasDoMes,
    indicadoresMes: indicadoresMes, mesesOrdenados: mesesOrdenados, horas: horas, variacao: variacao,
    resumo: resumo, ordenarResumos: ordenarResumos, resumos: resumos, textoCliente: textoCliente,
    linhasPainel: linhasPainel, linhasHistorico: linhasHistorico,
    normalizar: normalizar, criarBackup: criarBackup, lerBackup: lerBackup, diasDesde: diasDesde, numOuNulo: numOuNulo
  };
});

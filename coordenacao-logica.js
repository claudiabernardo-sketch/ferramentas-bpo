/* Painel da coordenação, lógica sem tela.
   Guarda a equipe (assistentes) e a carteira (empresas e quem atende cada uma), lê os relatórios
   de contas a pagar e a receber exportados do sistema (Conta Azul, Nibo, Omie, planilhas próprias),
   guarda só os títulos em aberto e monta o painel: vencidos, próximos 7 dias, conciliação e selos.
   Funciona no navegador (window.Coordenacao) e no Node (require), para os testes. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./comum.js'));
  else raiz.Coordenacao = fabrica(raiz.Comum);
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';

  var CHAVE = 'ferramentas-bpo:coordenacao:v1';
  var TIPOS = { pagar: 'Contas a pagar', receber: 'Contas a receber', ambos: 'Pagar e receber juntos', conciliacao: 'Extrato com a conciliação' };

  // Regras dos selos. null = regra desligada.
  var REGRAS_PADRAO = {
    urgPagarDias: 3,      // Urgente: conta a pagar vencida há mais de X dias
    urgReceberDias: 30,   // Urgente: conta a receber vencida há mais de X dias
    urgConcDias: 7,       // Urgente: conciliação parada há mais de X dias
    urgPendencias: 50,    // Urgente: mais de X lançamentos pendentes de conciliação
    atConcDias: 3,        // Atenção: conciliação parada há mais de X dias
    atPendencias: 0,      // Atenção: mais de X lançamentos pendentes de conciliação
    atAtualizacaoDias: 7  // Atenção: relatórios sem atualizar há mais de X dias
  };
  var DIAS_PROXIMOS = 7;

  // ---------- colunas ----------
  var CAMPOS_TITULOS = [
    { chave: 'vencimento', rotulo: 'Vencimento', obrigatorio: true, ajuda: 'A data em que a conta vence.',
      sinonimos: ['vencimento', 'data de vencimento', 'data vencimento', 'data do vencimento', 'vencto', 'venc', 'dt vencimento', 'dt venc',
        'data venc', 'vence em', 'previsto para', 'data prevista', 'data de previsao', 'previsao', 'vencimento original', 'data'],
      evitar: ['emissao', 'competencia', 'pagamento', 'recebimento', 'baixa', 'cadastro', 'criacao', 'quitacao', 'liquidacao', 'inclusao'] },
    { chave: 'valor', rotulo: 'Valor', obrigatorio: true, ajuda: 'Se o relatório separa em colunas A pagar e A receber, escolha-as mais abaixo.',
      sinonimos: ['valor', 'valor (r$)', 'valor r$', 'valor total', 'valor original', 'valor do titulo', 'valor da conta', 'valor da parcela',
        'valor parcela', 'valor previsto', 'valor bruto', 'valor liquido', 'valor do lancamento', 'montante', 'total', 'vlr', 'vl'],
      evitar: ['pago', 'recebido', 'juros', 'multa', 'desconto', 'aberto', 'acrescimo', 'tarifa', 'restante', 'saldo'] },
    { chave: 'situacao', rotulo: 'Situação', ajuda: 'Pago, Em aberto, Atrasado... Se não tiver, tudo conta como em aberto.',
      sinonimos: ['situacao', 'status', 'situacao do titulo', 'status do titulo', 'situacao da conta', 'status da conta', 'status do pagamento',
        'status pagamento', 'situacao do pagamento', 'status do recebimento', 'estado', 'pago', 'paga', 'quitado', 'quitada', 'recebido',
        'liquidado', 'baixado', 'em aberto', 'aberto', 'atrasado', 'vencido', 'vencida'],
      evitar: ['conciliacao', 'conciliado', 'data', 'valor', 'dias'] },
    { chave: 'tipo', rotulo: 'Tipo (pagar ou receber)', ajuda: 'Só quando o mesmo relatório traz as duas coisas.',
      sinonimos: ['tipo', 'tipo de lancamento', 'tipo do lancamento', 'tipo de conta', 'tipo da conta', 'tipo do titulo', 'natureza', 'operacao',
        'pagar ou receber', 'pagar/receber', 'receita ou despesa', 'receita/despesa', 'entrada/saida', 'entrada ou saida', 'movimento', 'tipo de movimento'],
      evitar: ['documento', 'pagamento', 'cobranca', 'forma', 'pessoa', 'cliente'] },
    { chave: 'contato', rotulo: 'Contato (cliente ou fornecedor)',
      sinonimos: ['contato', 'cliente', 'fornecedor', 'cliente/fornecedor', 'cliente ou fornecedor', 'fornecedor/cliente', 'favorecido', 'pagador',
        'sacado', 'beneficiario', 'nome do contato', 'razao social', 'nome fantasia', 'credor', 'devedor', 'nome', 'pessoa', 'parceiro'],
      evitar: ['codigo', 'cpf', 'cnpj', 'documento', 'e-mail', 'email', 'telefone'] },
    { chave: 'descricao', rotulo: 'Descrição',
      sinonimos: ['descricao', 'historico', 'observacao', 'observacoes', 'referente a', 'referencia', 'categoria', 'plano de contas',
        'descricao do lancamento', 'nome do lancamento', 'detalhe', 'detalhes', 'conta', 'servico', 'produto'],
      evitar: ['bancaria', 'corrente', 'valor'] },
    { chave: 'aberto', rotulo: 'Valor em aberto', ajuda: 'Se tiver, é ele que vale (pagamento parcial). Zero = já pago.',
      sinonimos: ['valor em aberto', 'em aberto (r$)', 'saldo em aberto', 'valor a pagar', 'valor a receber', 'valor restante', 'restante',
        'saldo devedor', 'saldo a pagar', 'saldo a receber', 'saldo', 'aberto (r$)'] },
    { chave: 'pagamento', rotulo: 'Data de pagamento', ajuda: 'Se tiver data aqui, a conta já foi paga ou recebida.',
      sinonimos: ['data de pagamento', 'data pagamento', 'data do pagamento', 'data de recebimento', 'data recebimento', 'data do recebimento',
        'data da baixa', 'data de baixa', 'data baixa', 'pago em', 'recebido em', 'data de quitacao', 'data quitacao', 'data de liquidacao',
        'dt pagamento', 'dt baixa'] },
    { chave: 'aPagar', rotulo: 'Coluna A pagar', ajuda: 'Só se o relatório separa os valores em duas colunas.',
      sinonimos: ['a pagar', 'pagar', 'despesa', 'despesas', 'saida', 'saidas', 'a pagar (r$)', 'pagamentos'],
      evitar: ['data', 'valor', 'status', 'situacao', 'tipo', 'saldo'] },
    { chave: 'aReceber', rotulo: 'Coluna A receber', ajuda: 'Só se o relatório separa os valores em duas colunas.',
      sinonimos: ['a receber', 'receber', 'receita', 'receitas', 'entrada', 'entradas', 'a receber (r$)', 'recebimentos'],
      evitar: ['data', 'valor', 'status', 'situacao', 'tipo', 'saldo'] }
  ];
  var CAMPOS_CONC = [
    { chave: 'conciliacao', rotulo: 'Situação da conciliação', obrigatorio: true, ajuda: 'Conciliado, Não conciliado, Pendente.',
      sinonimos: ['conciliacao', 'conciliado', 'conciliada', 'situacao da conciliacao', 'status da conciliacao', 'status conciliacao',
        'conciliacao bancaria', 'conciliado?', 'situacao conciliacao', 'conciliacao (status)'] },
    { chave: 'data', rotulo: 'Data',
      sinonimos: ['data', 'data do lancamento', 'data lancamento', 'data movimento', 'data de pagamento', 'data da transacao', 'data mov'] },
    { chave: 'descricao', rotulo: 'Descrição',
      sinonimos: ['descricao', 'historico', 'lancamento', 'memo', 'detalhe', 'observacao'] },
    { chave: 'valor', rotulo: 'Valor',
      sinonimos: ['valor', 'valor (r$)', 'valor r$', 'credito', 'debito'] }
  ];
  var CAMPOS_CARTEIRA = [
    { chave: 'empresa', rotulo: 'Empresa', obrigatorio: true, ajuda: 'O nome curto (apelido) que a equipe usa.',
      sinonimos: ['empresa', 'apelido', 'cliente', 'nome da empresa', 'nome do cliente', 'razao social', 'nome fantasia', 'empresa cliente', 'clientes', 'empresas', 'nome'],
      evitar: ['cnpj', 'codigo', 'e-mail', 'email', 'telefone'] },
    { chave: 'assistente', rotulo: 'Assistente', ajuda: 'Quem atende a empresa. Pode ficar em branco.',
      sinonimos: ['assistente', 'responsavel', 'analista', 'colaboradora', 'colaborador', 'operador', 'operadora', 'atendente', 'quem atende',
        'assistente responsavel', 'responsavel pela empresa', 'equipe', 'consultora', 'consultor', 'auxiliar'] }
  ];
  var TODOS_CAMPOS = CAMPOS_TITULOS.concat([CAMPOS_CONC[0]]);
  function camposDoTipo(tipo) { return tipo === 'conciliacao' ? CAMPOS_CONC : CAMPOS_TITULOS; }

  // ---------- datas ----------
  function msDe(iso) { var p = iso.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
  function diasEntre(de, ate) { if (!de || !ate) return null; return Math.round((msDe(ate) - msDe(de)) / 86400000); }
  function somarDias(iso, n) {
    var d = new Date(msDe(iso) + n * 86400000);
    return d.getUTCFullYear() + '-' + (d.getUTCMonth() < 9 ? '0' : '') + (d.getUTCMonth() + 1) + '-' + (d.getUTCDate() < 10 ? '0' : '') + d.getUTCDate();
  }
  function hojeIso() {
    var d = new Date();
    return d.getFullYear() + '-' + (d.getMonth() < 9 ? '0' : '') + (d.getMonth() + 1) + '-' + (d.getDate() < 10 ? '0' : '') + d.getDate();
  }
  function isoValido(t) { return typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t) && C.data(t) === t; }

  // ---------- como ler cada célula ----------
  function compacto(t) { return C.simples(t).replace(/[^a-z0-9]+/g, ''); }
  // Polaridade da coluna de situação quando ela vem com Sim/Não: "Pago? Sim" = pago, "Em aberto? Sim" = aberto
  function polaridade(cabecalho) {
    var s = C.simples(cabecalho);
    if (/aberto|atrasad|vencid|pendente|a pagar|a receber/.test(s)) return 'aberto';
    if (/pag|quitad|recebid|liquidad|baixad/.test(s)) return 'pago';
    return null;
  }
  // Devolve 'aberto', 'pago', 'cancelado' ou 'desconhecido'
  function classificarSituacao(v, cabecalho) {
    if (typeof v === 'boolean') v = v ? 'sim' : 'nao';
    var pol = polaridade(cabecalho);
    if (typeof v === 'number') {
      if (!pol) return 'desconhecido';
      var sim = v > 0;
      return pol === 'pago' ? (sim ? 'pago' : 'aberto') : (sim ? 'aberto' : 'pago');
    }
    var s = C.simples(v);
    if (!s) return 'desconhecido';
    if (/^(sim|s|x|yes|true|verdadeiro|ok)$/.test(s) || /^(nao|n|no|false|falso)$/.test(s)) {
      if (!pol) return 'desconhecido';
      var afirma = /^(sim|s|x|yes|true|verdadeiro|ok)$/.test(s);
      return pol === 'pago' ? (afirma ? 'pago' : 'aberto') : (afirma ? 'aberto' : 'pago');
    }
    if (/cancelad|estornad|excluid|desconsiderad|perdid|anulad/.test(s)) return 'cancelado';
    if (/parcial|^nao |^a vencer|^vence|aberto|atrasad|vencid|pendente|^a pagar|^a receber|previst|agendad|em dia|negociad|protestad|em cobranca/.test(s)) return 'aberto';
    if (/^(pago|paga|pagos|pagas|quitad|recebid|liquidad|baixad|compensad|conciliad|efetivad|realizad|concluid|finalizad)/.test(s)) return 'pago';
    return 'desconhecido';
  }
  function classificarTipo(v) {
    var s = C.simples(v);
    if (!s) return null;
    if (/pagar|despesa|saida|debito|fornecedor|pagamento|^d$|^p$|^cp$/.test(s)) return 'pagar';
    if (/receber|receita|entrada|credito|recebimento|cliente|^c$|^r$|^cr$/.test(s)) return 'receber';
    return null;
  }
  function classificarConc(v, cabecalho) {
    if (typeof v === 'boolean') v = v ? 'sim' : 'nao';
    var s = C.simples(v);
    if (!s) return null;
    if (/^(sim|s|x|ok|true)$/.test(s)) return 'conciliado';
    if (/^(nao|n|false)$/.test(s)) return 'pendente';
    if (/nao conciliad|pendente|a conciliar|sem conciliacao|aguardando|divergente|nao confere|em aberto/.test(s)) return 'pendente';
    if (/^conciliad|^ok|^confere|^batid/.test(s)) return 'conciliado';
    return null;
  }

  // ---------- reconhecer a empresa pelo nome do arquivo ----------
  // Procura o apelido simplificado (sem espaço e sem acento) dentro do texto. Fica com o mais longo.
  function reconhecerEmpresa(texto, empresas) {
    var alvo = compacto(texto);
    if (!alvo) return null;
    var melhor = null, tam = 0, empate = false;
    (empresas || []).forEach(function (e) {
      var a = compacto(e.nome);
      if (a.length < 3 || alvo.indexOf(a) < 0) return;
      if (a.length > tam) { melhor = e.id; tam = a.length; empate = false; }
      else if (a.length === tam && melhor !== e.id) empate = true;
    });
    return empate ? null : melhor;
  }
  // Pelo nome do arquivo e pelas linhas de título: pagar, receber ou null
  function tipoPeloTexto(texto) {
    var s = C.simples(texto).replace(/[^a-z0-9]+/g, ' ');
    var p = /\b(a pagar|pagar|pagamentos|despesas?|fornecedores?|cp)\b|apagar|contasapagar/.test(s) || /apagar/.test(s.replace(/ /g, ''));
    var r = /\b(a receber|receber|recebimentos|receitas?|cr)\b|areceber/.test(s) || /areceber/.test(s.replace(/ /g, ''));
    if (p && !r) return 'pagar';
    if (r && !p) return 'receber';
    return null;
  }

  // ---------- preparar o arquivo ----------
  function textoTitulo(linhas, ate) {
    return linhas.slice(0, ate).map(function (l) { return l.filter(function (v) { return typeof v === 'string'; }).join(' '); }).join(' ');
  }
  function linhaCab(linhas, i) { return (linhas[i] || []).map(function (v) { return String(v == null ? '' : v); }); }
  // escolha das colunas para um tipo, com o ajuste "Valor em aberto vira Valor"
  function detectar(cabecalho, tipo) {
    var esc = C.detectarColunas(cabecalho, camposDoTipo(tipo));
    if (tipo !== 'conciliacao' && esc.valor < 0 && esc.aberto >= 0) { esc.valor = esc.aberto; esc.aberto = -1; }
    return esc;
  }
  function adivinharTipo(linhas, inicio, cabecalho, nomeArquivo) {
    var escAll = C.detectarColunas(cabecalho, TODOS_CAMPOS);
    if (escAll.conciliacao >= 0) return 'conciliacao';
    var escT = detectar(cabecalho, 'pagar');
    if (escT.tipo >= 0 || (escT.aPagar >= 0 && escT.aReceber >= 0)) return 'ambos';
    var t = tipoPeloTexto(nomeArquivo) || tipoPeloTexto(textoTitulo(linhas, inicio));
    if (t) return t;
    if (escT.aPagar >= 0) return 'pagar';
    if (escT.aReceber >= 0) return 'receber';
    var cab = C.simples(cabecalho.join(' '));
    if (/fornecedor|credor/.test(cab) && !/cliente|devedor|sacado/.test(cab)) return 'pagar';
    if (/cliente|devedor|sacado|pagador/.test(cab) && !/fornecedor|credor/.test(cab)) return 'receber';
    return null;
  }
  // Prepara uma aba: acha o cabeçalho, as colunas e adivinha o tipo. tipo força o tipo.
  function prepararAba(linhas, nomeArquivo, tipo) {
    var inicio = C.acharCabecalho(linhas, TODOS_CAMPOS);
    var cabecalho = linhaCab(linhas, inicio);
    var t = tipo || adivinharTipo(linhas, inicio, cabecalho, nomeArquivo);
    var escolha = detectar(cabecalho, t);
    var r = processar(linhas, inicio, escolha, t);
    var nota = (r.pagar.length + r.receber.length + r.conc.pendentes + r.conc.conciliados) * 10 + (escolha.vencimento >= 0 || escolha.conciliacao >= 0 ? 5 : 0) + r.lidas;
    return { inicio: inicio, cabecalho: cabecalho, tipo: t, escolha: escolha, resultado: r, nota: nota };
  }
  // Prepara o arquivo inteiro: escolhe a melhor aba, adivinha o tipo e a empresa.
  function prepararArquivo(abas, nomeArquivo, empresas) {
    var melhor = 0, nota = -1, preps = abas.map(function (a) { return prepararAba(a.linhas, nomeArquivo); });
    preps.forEach(function (p, i) { if (p.nota > nota) { nota = p.nota; melhor = i; } });
    var prep = preps[melhor];
    var empresaId = reconhecerEmpresa(String(nomeArquivo || '').replace(/\.[a-z0-9]+$/i, ''), empresas) ||
      reconhecerEmpresa(textoTitulo(abas[melhor].linhas, prep.inicio), empresas);
    return { abaIdx: melhor, prep: prep, empresaId: empresaId };
  }
  function refazer(prep, linhas, novoInicio, novoTipo) {
    var inicio = novoInicio == null ? prep.inicio : novoInicio;
    var tipo = novoTipo === undefined ? prep.tipo : novoTipo;
    var cab = linhaCab(linhas, inicio);
    var escolha = (novoInicio == null && camposDoTipo(tipo) === camposDoTipo(prep.tipo)) ? prep.escolha : detectar(cab, tipo);
    return { inicio: inicio, cabecalho: cab, tipo: tipo, escolha: escolha, resultado: processar(linhas, inicio, escolha, tipo) };
  }

  // Colunas obrigatórias que faltam (rótulos)
  function faltandoColunas(escolha, tipo) {
    var f = [];
    if (tipo === 'conciliacao') { if (!(escolha.conciliacao >= 0)) f.push('Situação da conciliação'); return f; }
    if (!(escolha.vencimento >= 0)) f.push('Vencimento');
    if (!(escolha.valor >= 0) && !(escolha.aberto >= 0) && !(escolha.aPagar >= 0) && !(escolha.aReceber >= 0)) f.push('Valor');
    return f;
  }

  function novoResultado() {
    return {
      pagar: [], receber: [], conc: { pendentes: 0, conciliados: 0 }, lidas: 0, semSituacao: false,
      ignoradas: { total: 0, pago: 0, cancelado: 0, semData: 0, semValor: 0, semTipo: 0, semConc: 0 },
      exemplos: { total: [], pago: [], cancelado: [], semData: [], semValor: [], semTipo: [], semConc: [] },
      desconhecidas: {}
    };
  }
  function idx(escolha, k) { return escolha[k] != null && escolha[k] >= 0 ? escolha[k] : -1; }
  function texto(v) { return C.vazio(v) ? '' : String(v).trim().slice(0, 120); }

  // Lê as linhas e separa os títulos em aberto. tipo: pagar, receber, ambos ou conciliacao.
  function processar(linhas, inicio, escolha, tipo) {
    var r = novoResultado();
    var cab = linhaCab(linhas, inicio);
    function ex(motivo, num, l) {
      if (r.exemplos[motivo].length < 6) r.exemplos[motivo].push('linha ' + num + ': ' + l.filter(function (v) { return !C.vazio(v); }).join(' | ').slice(0, 100));
    }
    if (!tipo || faltandoColunas(escolha, tipo).length) return r;
    var iSit = idx(escolha, 'situacao'), iPag = idx(escolha, 'pagamento'), iAb = idx(escolha, 'aberto'), iVal = idx(escolha, 'valor');
    var iAP = idx(escolha, 'aPagar'), iAR = idx(escolha, 'aReceber'), iTipo = idx(escolha, 'tipo');
    var valorEhAberto = iVal >= 0 && /aberto|restante|saldo|a pagar|a receber/.test(C.simples(cab[iVal]));
    r.semSituacao = tipo !== 'conciliacao' && iSit < 0 && iPag < 0;
    r.usaAberto = iAb >= 0 || valorEhAberto;

    for (var i = inicio + 1; i < linhas.length; i++) {
      var l = linhas[i] || [];
      if (!l.some(function (v) { return !C.vazio(v); })) continue;
      r.lidas++;
      var num = i + 1;
      // linha de total: a do padrão comum, ou começa com Total e não tem vencimento que dê para ler
      var semVenc = tipo === 'conciliacao' || !C.data(l[escolha.vencimento]);
      if (C.pareceTotal(l) || (semVenc && l.some(function (v) { return typeof v === 'string' && /^(total|totais|subtotal|sub total)\b/.test(C.simples(v)); }))) {
        r.ignoradas.total++; ex('total', num, l); continue;
      }
      if (tipo === 'conciliacao') {
        var c = classificarConc(l[escolha.conciliacao], cab[escolha.conciliacao]);
        if (c === 'pendente') r.conc.pendentes++;
        else if (c === 'conciliado') r.conc.conciliados++;
        else { r.ignoradas.semConc++; ex('semConc', num, l); }
        continue;
      }
      // situação
      if (iSit >= 0) {
        var sit = classificarSituacao(l[iSit], cab[iSit]);
        if (sit === 'pago') { r.ignoradas.pago++; ex('pago', num, l); continue; }
        if (sit === 'cancelado') { r.ignoradas.cancelado++; ex('cancelado', num, l); continue; }
        if (sit === 'desconhecido' && !C.vazio(l[iSit])) { var chave = texto(l[iSit]); r.desconhecidas[chave] = (r.desconhecidas[chave] || 0) + 1; }
      }
      if (iPag >= 0 && C.data(l[iPag]) && (iSit < 0 || classificarSituacao(l[iSit], cab[iSit]) === 'desconhecido')) { r.ignoradas.pago++; ex('pago', num, l); continue; }
      var venc = C.data(l[escolha.vencimento]);
      if (!venc) { r.ignoradas.semData++; ex('semData', num, l); continue; }
      // valor em aberto zerado = já pago
      var vAb = iAb >= 0 ? C.valor(l[iAb]) : null;
      if (vAb === 0 || (valorEhAberto && C.valor(l[iVal]) === 0)) { r.ignoradas.pago++; ex('pago', num, l); continue; }
      // de que tipo é a linha e quanto vale
      var pares = [];
      function valorPara(t) {
        if (vAb != null) return vAb;
        var v = iVal >= 0 ? C.valor(l[iVal]) : null;
        if (v != null) return v;
        var k = t === 'pagar' ? iAP : iAR;
        return k >= 0 ? C.valor(l[k]) : null;
      }
      if (tipo === 'pagar' || tipo === 'receber') pares.push({ t: tipo, v: valorPara(tipo) });
      else {
        var tLinha = iTipo >= 0 ? classificarTipo(l[iTipo]) : null;
        if (tLinha) pares.push({ t: tLinha, v: valorPara(tLinha) });
        else if (iTipo < 0 && (iAP >= 0 || iAR >= 0) && iVal < 0 && iAb < 0) {
          var vp = iAP >= 0 ? C.valor(l[iAP]) : null, vr = iAR >= 0 ? C.valor(l[iAR]) : null;
          if (vp) pares.push({ t: 'pagar', v: vp });
          if (vr) pares.push({ t: 'receber', v: vr });
          if (!pares.length) { r.ignoradas.semValor++; ex('semValor', num, l); continue; }
        } else {
          // sem tipo reconhecido: valor negativo é conta a pagar, positivo é conta a receber
          var vs = valorPara('pagar');
          if (iTipo >= 0 && !C.vazio(l[iTipo]) && !(vs < 0)) { r.ignoradas.semTipo++; ex('semTipo', num, l); continue; }
          if (vs == null || vs === 0) { r.ignoradas.semValor++; ex('semValor', num, l); continue; }
          pares.push({ t: vs < 0 ? 'pagar' : 'receber', v: vs });
        }
      }
      var guardou = false;
      pares.forEach(function (p) {
        if (p.v == null || p.v === 0) return;
        r[p.t].push({ venc: venc, valor: C.arred(Math.abs(p.v)), contato: idx(escolha, 'contato') >= 0 ? texto(l[escolha.contato]) : '', desc: idx(escolha, 'descricao') >= 0 ? texto(l[escolha.descricao]) : '' });
        guardou = true;
      });
      if (!guardou) { r.ignoradas.semValor++; ex('semValor', num, l); }
    }
    return r;
  }

  // ---------- estado ----------
  function novoEstado() { return { versao: 1, assistentes: [], empresas: [], regras: copia(REGRAS_PADRAO), ultimoBackup: null }; }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }
  function nomeLimpo(t) { return String(t == null ? '' : t).replace(/\s+/g, ' ').trim().slice(0, 80); }
  function acharAssistentePorNome(estado, nome) {
    var s = C.simples(nome);
    return estado.assistentes.filter(function (a) { return C.simples(a.nome) === s; })[0] || null;
  }
  function acharEmpresaPorNome(estado, nome) {
    var s = C.simples(nome);
    return estado.empresas.filter(function (e) { return C.simples(e.nome) === s; })[0] || null;
  }
  function adicionarAssistente(estado, nome) {
    nome = nomeLimpo(nome);
    if (!nome) throw new Error('Escreva o nome da assistente.');
    var ja = acharAssistentePorNome(estado, nome);
    if (ja) return ja;
    var a = { id: C.id(), nome: nome };
    estado.assistentes.push(a);
    return a;
  }
  function concVazia() { return { pendentes: null, ultima: null, origem: null, arquivo: null, atualizadoEm: null }; }
  function adicionarEmpresa(estado, nome, assistenteId) {
    nome = nomeLimpo(nome);
    if (!nome) throw new Error('Escreva o nome (apelido) da empresa.');
    if (acharEmpresaPorNome(estado, nome)) throw new Error('Já existe uma empresa com o nome "' + nome + '".');
    var e = { id: C.id(), nome: nome, assistenteId: assistenteId || null, cargas: {}, conc: concVazia() };
    estado.empresas.push(e);
    return e;
  }
  function empresa(estado, id) { return estado.empresas.filter(function (e) { return e.id === id; })[0] || null; }
  function assistente(estado, id) { return estado.assistentes.filter(function (a) { return a.id === id; })[0] || null; }
  function excluirAssistente(estado, id) {
    estado.assistentes = estado.assistentes.filter(function (a) { return a.id !== id; });
    estado.empresas.forEach(function (e) { if (e.assistenteId === id) e.assistenteId = null; });
  }
  function excluirEmpresa(estado, id) { estado.empresas = estado.empresas.filter(function (e) { return e.id !== id; }); }

  // Importa a carteira. linhas: [{empresa, assistente}] (texto cru). Cria quem não existe e troca o responsável de quem já existe.
  function importarCarteira(estado, linhas) {
    var r = { novas: 0, atualizadas: 0, iguais: 0, novasAssistentes: 0, ignoradas: 0 };
    linhas.forEach(function (o) {
      var nome = nomeLimpo(o.empresa);
      if (!nome || C.pareceTotal([nome])) { r.ignoradas++; return; }
      var an = nomeLimpo(o.assistente), aid = null;
      if (an) {
        var a = acharAssistentePorNome(estado, an);
        if (!a) { a = adicionarAssistente(estado, an); r.novasAssistentes++; }
        aid = a.id;
      }
      var e = acharEmpresaPorNome(estado, nome);
      if (!e) { adicionarEmpresa(estado, nome, aid); r.novas++; return; }
      if (aid && e.assistenteId !== aid) { e.assistenteId = aid; r.atualizadas++; } else r.iguais++;
    });
    return r;
  }
  function lerCarteira(linhas) {
    var inicio = C.acharCabecalho(linhas, CAMPOS_CARTEIRA);
    var cab = linhaCab(linhas, inicio);
    return { inicio: inicio, cabecalho: cab, escolha: C.detectarColunas(cab, CAMPOS_CARTEIRA) };
  }

  // Guarda o resultado de um arquivo na empresa, trocando a carga anterior do mesmo tipo.
  function guardarCarga(emp, tipo, resultado, arquivo, dataIso) {
    dataIso = dataIso || hojeIso();
    var feitos = [];
    if (tipo === 'conciliacao') {
      emp.conc.pendentes = resultado.conc.pendentes;
      emp.conc.origem = 'arquivo'; emp.conc.arquivo = arquivo || null; emp.conc.atualizadoEm = dataIso;
      return ['conciliacao'];
    }
    (tipo === 'ambos' ? ['pagar', 'receber'] : [tipo]).forEach(function (t) {
      emp.cargas[t] = { atualizadoEm: dataIso, arquivo: arquivo || null, titulos: copia(resultado[t]) };
      feitos.push(t);
    });
    return feitos;
  }
  function definirConciliacao(emp, campo, v) {
    if (campo === 'pendentes') {
      if (v === '' || v == null) emp.conc.pendentes = null;
      else { var n = Number(String(v).replace(',', '.')); if (!isFinite(n) || n < 0) throw new Error('Use um número inteiro, zero ou mais.'); emp.conc.pendentes = Math.round(n); }
      emp.conc.origem = 'manual';
    } else if (campo === 'ultima') {
      if (v === '' || v == null) emp.conc.ultima = null;
      else { var d = C.data(v); if (!d) throw new Error('Data inválida.'); emp.conc.ultima = d; }
    }
  }

  // ---------- painel ----------
  function regrasDe(estado) {
    var r = copia(REGRAS_PADRAO);
    if (estado && estado.regras) Object.keys(REGRAS_PADRAO).forEach(function (k) { if (k in estado.regras) r[k] = estado.regras[k]; });
    return r;
  }
  function plural(n, um, varios) { return C.num(n) + ' ' + (n === 1 ? um : varios); }
  function resumoEmpresa(emp, ref, regras, nomeAssistente) {
    regras = regras || REGRAS_PADRAO;
    var lim = somarDias(ref, DIAS_PROXIMOS);
    var r = {
      id: emp.id, nome: emp.nome, assistenteId: emp.assistenteId || null, assistente: nomeAssistente || '',
      pagarVencido: { qtd: 0, valor: 0, maiorAtraso: 0 }, receberVencido: { qtd: 0, valor: 0, maiorAtraso: 0 },
      proximos: { qtd: 0, pagarQtd: 0, pagarValor: 0, receberQtd: 0, receberValor: 0 },
      vencidos: [], aVencer: [],
      pendencias: emp.conc && emp.conc.pendentes != null ? emp.conc.pendentes : null,
      ultimaConc: emp.conc ? emp.conc.ultima : null, diasConc: null,
      atualizacao: null, diasAtualizacao: null, semDados: true, cargas: {}
    };
    ['pagar', 'receber'].forEach(function (t) {
      var cg = emp.cargas && emp.cargas[t];
      if (!cg) return;
      r.semDados = false;
      r.cargas[t] = cg.atualizadoEm;
      if (!r.atualizacao || cg.atualizadoEm < r.atualizacao) r.atualizacao = cg.atualizadoEm;
      var vk = t === 'pagar' ? r.pagarVencido : r.receberVencido;
      cg.titulos.forEach(function (x) {
        var item = { tipo: t, venc: x.venc, valor: x.valor, contato: x.contato, desc: x.desc, atraso: diasEntre(x.venc, ref) };
        if (x.venc < ref) {
          vk.qtd++; vk.valor += x.valor; vk.maiorAtraso = Math.max(vk.maiorAtraso, item.atraso);
          r.vencidos.push(item);
        } else {
          r.aVencer.push(item);
          if (x.venc <= lim) {
            r.proximos.qtd++;
            if (t === 'pagar') { r.proximos.pagarQtd++; r.proximos.pagarValor += x.valor; } else { r.proximos.receberQtd++; r.proximos.receberValor += x.valor; }
          }
        }
      });
    });
    r.pagarVencido.valor = C.arred(r.pagarVencido.valor); r.receberVencido.valor = C.arred(r.receberVencido.valor);
    r.proximos.pagarValor = C.arred(r.proximos.pagarValor); r.proximos.receberValor = C.arred(r.proximos.receberValor);
    r.vencidos.sort(function (a, b) { return b.atraso - a.atraso || b.valor - a.valor; });
    r.aVencer.sort(function (a, b) { return a.venc < b.venc ? -1 : a.venc > b.venc ? 1 : b.valor - a.valor; });
    if (r.ultimaConc) r.diasConc = Math.max(0, diasEntre(r.ultimaConc, ref));
    if (r.atualizacao) r.diasAtualizacao = Math.max(0, diasEntre(r.atualizacao, ref));
    avaliar(r, regras);
    return r;
  }
  function ligada(v) { return v != null && v !== '' && isFinite(v); }
  function avaliar(r, regras) {
    var urg = [], at = [];
    if (r.semDados) at.push('Ainda sem relatório de contas a pagar ou a receber');
    [['pagarVencido', 'urgPagarDias', 'a pagar'], ['receberVencido', 'urgReceberDias', 'a receber']].forEach(function (p) {
      var v = r[p[0]];
      if (!v.qtd) return;
      var txt = plural(v.qtd, 'conta ' + p[2] + ' vencida', 'contas ' + p[2] + ' vencidas') + ' (' + C.brl(v.valor) + ')';
      if (ligada(regras[p[1]]) && v.maiorAtraso > regras[p[1]]) urg.push(txt + ', a mais antiga há ' + plural(v.maiorAtraso, 'dia', 'dias'));
      else at.push(txt);
    });
    if (r.diasConc == null) at.push('Data da última conciliação não informada');
    else if (ligada(regras.urgConcDias) && r.diasConc > regras.urgConcDias) urg.push('Conciliação parada há ' + plural(r.diasConc, 'dia', 'dias'));
    else if (ligada(regras.atConcDias) && r.diasConc > regras.atConcDias) at.push('Conciliação parada há ' + plural(r.diasConc, 'dia', 'dias'));
    if (r.pendencias != null) {
      var tp = plural(r.pendencias, 'lançamento pendente', 'lançamentos pendentes') + ' de conciliação';
      if (ligada(regras.urgPendencias) && r.pendencias > regras.urgPendencias) urg.push(tp);
      else if (ligada(regras.atPendencias) && r.pendencias > regras.atPendencias) at.push(tp);
    }
    if (!r.semDados && ligada(regras.atAtualizacaoDias) && r.diasAtualizacao > regras.atAtualizacaoDias) at.push('Relatórios sem atualizar há ' + plural(r.diasAtualizacao, 'dia', 'dias'));
    r.motivosUrgente = urg; r.motivosAtencao = at;
    r.motivos = urg.concat(at);
    r.situacao = urg.length ? 'urgente' : at.length ? 'atencao' : 'emdia';
  }
  var NOME_SITUACAO = { urgente: 'Urgente', atencao: 'Atenção', emdia: 'Em dia' };
  var PESO = { urgente: 2, atencao: 1, emdia: 0 };
  function ordenarPorGravidade(lista) {
    return lista.slice().sort(function (a, b) {
      return PESO[b.situacao] - PESO[a.situacao] || b.motivosUrgente.length - a.motivosUrgente.length ||
        (b.pagarVencido.valor + b.receberVencido.valor) - (a.pagarVencido.valor + a.receberVencido.valor) ||
        b.motivos.length - a.motivos.length || a.nome.localeCompare(b.nome, 'pt-BR');
    });
  }
  function resumos(estado, ref) {
    var regras = regrasDe(estado);
    return ordenarPorGravidade(estado.empresas.map(function (e) {
      var a = e.assistenteId ? assistente(estado, e.assistenteId) : null;
      return resumoEmpresa(e, ref, regras, a ? a.nome : '');
    }));
  }
  function filtrar(lista, filtro) {
    filtro = filtro || {};
    return lista.filter(function (r) {
      if (filtro.assistenteId === '_sem') { if (r.assistenteId) return false; }
      else if (filtro.assistenteId && r.assistenteId !== filtro.assistenteId) return false;
      if (filtro.situacao && r.situacao !== filtro.situacao) return false;
      return true;
    });
  }
  function somar(lista, regras) {
    var limAt = ligada(regras && regras.atAtualizacaoDias) ? regras.atAtualizacaoDias : 7;
    var t = { empresas: lista.length, urgente: 0, atencao: 0, emdia: 0,
      pagarVencido: { qtd: 0, valor: 0 }, receberVencido: { qtd: 0, valor: 0 },
      proximos: { qtd: 0, pagarValor: 0, receberValor: 0 }, pendencias: 0, empresasComPendencia: 0, desatualizadas: 0 };
    lista.forEach(function (r) {
      t[r.situacao]++;
      t.pagarVencido.qtd += r.pagarVencido.qtd; t.pagarVencido.valor += r.pagarVencido.valor;
      t.receberVencido.qtd += r.receberVencido.qtd; t.receberVencido.valor += r.receberVencido.valor;
      t.proximos.qtd += r.proximos.qtd; t.proximos.pagarValor += r.proximos.pagarValor; t.proximos.receberValor += r.proximos.receberValor;
      if (r.pendencias) { t.pendencias += r.pendencias; t.empresasComPendencia++; }
      if (r.semDados || r.diasAtualizacao > limAt) t.desatualizadas++;
    });
    t.pagarVencido.valor = C.arred(t.pagarVencido.valor); t.receberVencido.valor = C.arred(t.receberVencido.valor);
    t.proximos.pagarValor = C.arred(t.proximos.pagarValor); t.proximos.receberValor = C.arred(t.proximos.receberValor);
    t.limiteAtualizacao = limAt;
    return t;
  }
  function resumoGeral(estado, ref) { return somar(resumos(estado, ref), regrasDe(estado)); }
  // Uma linha por assistente (e "Sem responsável", se houver empresa sem ninguém)
  function porAssistente(estado, ref) {
    var lista = resumos(estado, ref), regras = regrasDe(estado);
    var out = estado.assistentes.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); }).map(function (a) {
      var s = somar(lista.filter(function (r) { return r.assistenteId === a.id; }), regras);
      s.id = a.id; s.nome = a.nome;
      return s;
    });
    var sem = lista.filter(function (r) { return !r.assistenteId || !assistente(estado, r.assistenteId); });
    if (sem.length) { var s = somar(sem, regras); s.id = '_sem'; s.nome = 'Sem responsável'; out.push(s); }
    return out;
  }

  // ---------- Excel ----------
  function abasExcel(estado, ref) {
    var lista = resumos(estado, ref), g = somar(lista, regrasDe(estado));
    var resumo = [
      ['Painel da coordenação'], ['Data de referência', C.dataBR(ref)], [],
      ['Indicador', 'Quantidade', 'Valor (R$)'],
      ['Empresas', g.empresas, ''],
      ['Urgentes', g.urgente, ''], ['Atenção', g.atencao, ''], ['Em dia', g.emdia, ''],
      ['Contas a pagar vencidas', g.pagarVencido.qtd, g.pagarVencido.valor],
      ['Contas a receber vencidas', g.receberVencido.qtd, g.receberVencido.valor],
      ['Vencem nos próximos 7 dias', g.proximos.qtd, ''],
      ['   a pagar nos próximos 7 dias', '', g.proximos.pagarValor],
      ['   a receber nos próximos 7 dias', '', g.proximos.receberValor],
      ['Lançamentos pendentes de conciliação', g.pendencias, ''],
      ['Empresas com conciliação pendente', g.empresasComPendencia, ''],
      ['Empresas sem atualização há mais de ' + g.limiteAtualizacao + ' dias', g.desatualizadas, '']
    ];
    var pa = [['Assistente', 'Empresas', 'Urgentes', 'Atenção', 'Em dia', 'A pagar vencido (qtd)', 'A pagar vencido (R$)', 'A receber vencido (qtd)',
      'A receber vencido (R$)', 'Próximos 7 dias (qtd)', 'A pagar 7 dias (R$)', 'A receber 7 dias (R$)', 'Pendências de conciliação', 'Sem atualização']];
    porAssistente(estado, ref).forEach(function (s) {
      pa.push([s.nome, s.empresas, s.urgente, s.atencao, s.emdia, s.pagarVencido.qtd, s.pagarVencido.valor, s.receberVencido.qtd, s.receberVencido.valor,
        s.proximos.qtd, s.proximos.pagarValor, s.proximos.receberValor, s.pendencias, s.desatualizadas]);
    });
    var pe = [['Empresa', 'Assistente', 'Situação', 'Motivos', 'A pagar vencido (qtd)', 'A pagar vencido (R$)', 'Maior atraso a pagar (dias)',
      'A receber vencido (qtd)', 'A receber vencido (R$)', 'Próximos 7 dias (qtd)', 'A pagar 7 dias (R$)', 'A receber 7 dias (R$)',
      'Pendências de conciliação', 'Última conciliação', 'Dias desde a conciliação', 'Última atualização', 'Dias desde a atualização']];
    lista.forEach(function (r) {
      pe.push([r.nome, r.assistente || 'Sem responsável', NOME_SITUACAO[r.situacao], r.motivos.join('; '), r.pagarVencido.qtd, r.pagarVencido.valor,
        r.pagarVencido.qtd ? r.pagarVencido.maiorAtraso : '', r.receberVencido.qtd, r.receberVencido.valor, r.proximos.qtd, r.proximos.pagarValor,
        r.proximos.receberValor, r.pendencias == null ? '' : r.pendencias, C.dataBR(r.ultimaConc), r.diasConc == null ? '' : r.diasConc,
        C.dataBR(r.atualizacao), r.diasAtualizacao == null ? '' : r.diasAtualizacao]);
    });
    var tv = [['Empresa', 'Assistente', 'Tipo', 'Vencimento', 'Dias de atraso', 'Valor (R$)', 'Contato', 'Descrição']];
    lista.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); }).forEach(function (r) {
      r.vencidos.forEach(function (x) {
        tv.push([r.nome, r.assistente || 'Sem responsável', x.tipo === 'pagar' ? 'A pagar' : 'A receber', C.dataBR(x.venc), x.atraso, x.valor, x.contato, x.desc]);
      });
    });
    return [
      { nome: 'Resumo', linhas: resumo, larguras: [44, 14, 16], formatoMoeda: [2] },
      { nome: 'Por assistente', linhas: pa, larguras: [24, 10, 10, 10, 10, 12, 16, 12, 16, 12, 16, 16, 14, 14], formatoMoeda: [6, 8, 10, 11] },
      { nome: 'Por empresa', linhas: pe, larguras: [26, 20, 11, 60, 12, 16, 12, 12, 16, 12, 16, 16, 14, 14, 12, 14, 12], formatoMoeda: [5, 8, 10, 11] },
      { nome: 'Títulos vencidos', linhas: tv, larguras: [26, 20, 11, 12, 10, 14, 28, 40], formatoMoeda: [5] }
    ];
  }

  // ---------- backup ----------
  function numOuNulo(v) {
    if (v == null || v === '') return null;
    var n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
    return isFinite(n) ? n : null;
  }
  function normalizar(e) {
    var n = novoEstado();
    if (!e || typeof e !== 'object') return n;
    n.ultimoBackup = typeof e.ultimoBackup === 'string' ? e.ultimoBackup : null;
    if (e.regras && typeof e.regras === 'object') Object.keys(REGRAS_PADRAO).forEach(function (k) {
      if (!(k in e.regras)) return;
      var v = numOuNulo(e.regras[k]);
      n.regras[k] = v != null && v >= 0 ? v : null;
    });
    (Array.isArray(e.assistentes) ? e.assistentes : []).forEach(function (a) {
      if (!a || !nomeLimpo(a.nome) || acharAssistentePorNome(n, a.nome)) return;
      n.assistentes.push({ id: typeof a.id === 'string' && a.id ? a.id : C.id(), nome: nomeLimpo(a.nome) });
    });
    (Array.isArray(e.empresas) ? e.empresas : []).forEach(function (x) {
      if (!x || !nomeLimpo(x.nome) || acharEmpresaPorNome(n, x.nome)) return;
      var emp = { id: typeof x.id === 'string' && x.id ? x.id : C.id(), nome: nomeLimpo(x.nome),
        assistenteId: x.assistenteId && assistente(n, x.assistenteId) ? x.assistenteId : null, cargas: {}, conc: concVazia() };
      ['pagar', 'receber'].forEach(function (t) {
        var cg = x.cargas && x.cargas[t];
        if (!cg || !isoValido(cg.atualizadoEm)) return;
        emp.cargas[t] = { atualizadoEm: cg.atualizadoEm, arquivo: typeof cg.arquivo === 'string' ? cg.arquivo : null,
          titulos: (Array.isArray(cg.titulos) ? cg.titulos : []).filter(function (tt) { return tt && isoValido(tt.venc) && isFinite(tt.valor) && tt.valor > 0; })
            .map(function (tt) { return { venc: tt.venc, valor: C.arred(Number(tt.valor)), contato: texto(tt.contato), desc: texto(tt.desc) }; }) };
      });
      var c = x.conc || {};
      var p = numOuNulo(c.pendentes);
      emp.conc.pendentes = p != null && p >= 0 ? Math.round(p) : null;
      emp.conc.ultima = isoValido(c.ultima) ? c.ultima : null;
      emp.conc.origem = c.origem === 'arquivo' || c.origem === 'manual' ? c.origem : null;
      emp.conc.arquivo = typeof c.arquivo === 'string' ? c.arquivo : null;
      emp.conc.atualizadoEm = isoValido(c.atualizadoEm) ? c.atualizadoEm : null;
      n.empresas.push(emp);
    });
    return n;
  }
  function criarBackup(estado, agoraIso) {
    return { ferramenta: 'painel-da-coordenacao', versao: 1, salvoEm: agoraIso || new Date().toISOString(), dados: copia(estado) };
  }
  function lerBackup(obj) {
    var erro = 'Esse arquivo não é um backup do Painel da coordenação.';
    if (!obj || typeof obj !== 'object') throw new Error(erro);
    var dados = obj.ferramenta === 'painel-da-coordenacao' ? obj.dados : (Array.isArray(obj.empresas) ? obj : null);
    if (!dados || !Array.isArray(dados.empresas)) throw new Error(erro);
    return normalizar(dados);
  }
  function diasDesde(iso, agora) {
    if (!iso) return null;
    var t = Date.parse(iso), a = agora ? Date.parse(agora) : Date.now();
    if (!isFinite(t)) return null;
    return Math.floor((a - t) / 86400000);
  }

  return {
    CHAVE: CHAVE, TIPOS: TIPOS, REGRAS_PADRAO: REGRAS_PADRAO, DIAS_PROXIMOS: DIAS_PROXIMOS, NOME_SITUACAO: NOME_SITUACAO,
    CAMPOS_TITULOS: CAMPOS_TITULOS, CAMPOS_CONC: CAMPOS_CONC, CAMPOS_CARTEIRA: CAMPOS_CARTEIRA, camposDoTipo: camposDoTipo,
    diasEntre: diasEntre, somarDias: somarDias, hojeIso: hojeIso,
    classificarSituacao: classificarSituacao, classificarTipo: classificarTipo, classificarConc: classificarConc,
    reconhecerEmpresa: reconhecerEmpresa, tipoPeloTexto: tipoPeloTexto, detectar: detectar,
    prepararAba: prepararAba, prepararArquivo: prepararArquivo, refazer: refazer, processar: processar, faltandoColunas: faltandoColunas,
    novoEstado: novoEstado, adicionarAssistente: adicionarAssistente, adicionarEmpresa: adicionarEmpresa, empresa: empresa, assistente: assistente,
    excluirAssistente: excluirAssistente, excluirEmpresa: excluirEmpresa, acharEmpresaPorNome: acharEmpresaPorNome,
    importarCarteira: importarCarteira, lerCarteira: lerCarteira, guardarCarga: guardarCarga, definirConciliacao: definirConciliacao,
    regrasDe: regrasDe, resumoEmpresa: resumoEmpresa, resumos: resumos, ordenarPorGravidade: ordenarPorGravidade, filtrar: filtrar,
    somar: somar, resumoGeral: resumoGeral, porAssistente: porAssistente, abasExcel: abasExcel,
    normalizar: normalizar, criarBackup: criarBackup, lerBackup: lerBackup, diasDesde: diasDesde, numOuNulo: numOuNulo
  };
});

/* Ferramentas do BPO, Vendas e margem (lógica, sem tela).
   Junta as vendas do sistema da loja com as vendas da maquininha e o custo do que foi vendido,
   e responde: quanto vendeu, quanto custou, quanto a maquininha cobrou e quanto sobrou;
   e se o cartão do sistema bate com a maquininha, dia a dia.
   Funciona no navegador (window.Margem) e no Node (require), para os testes. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./comum.js'));
  else raiz.Margem = fabrica(raiz.Comum);
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';

  var arred = C.arred;
  function vazio(v) { return C.vazio(v); }

  // ---------- campos que a ferramenta procura ----------
  var CAMPOS_VENDAS = [
    { chave: 'data', rotulo: 'Data da venda', obrigatorio: true,
      sinonimos: ['data', 'data da venda', 'data venda', 'data/hora', 'data hora', 'data e hora', 'data de emissao', 'emissao', 'data emissao',
        'data do pedido', 'data pedido', 'dt venda', 'dt. venda', 'dt emissao', 'data da compra', 'data do movimento', 'data movimento',
        'data de faturamento', 'data faturamento', 'data do cupom', 'data da nota'],
      evitar: ['vencimento', 'entrega', 'nascimento', 'cadastro', 'previs', 'alteracao'] },
    { chave: 'valor', rotulo: 'Valor da venda', obrigatorio: true,
      sinonimos: ['valor', 'valor total', 'total', 'valor da venda', 'valor venda', 'total da venda', 'total venda', 'valor liquido', 'valor pago',
        'valor recebido', 'total pedido', 'total do pedido', 'valor do pedido', 'vlr total', 'vl total', 'vl. total', 'total liquido',
        'valor final', 'valor (r$)', 'valor r$', 'valor do pagamento', 'valor pagamento', 'total pago'],
      evitar: ['custo', 'desconto', 'frete', 'unitario', 'troco', 'acrescimo', 'imposto', 'comissao', 'taxa'] },
    { chave: 'forma', rotulo: 'Forma de pagamento', obrigatorio: true,
      sinonimos: ['forma de pagamento', 'forma pagamento', 'formas de pagamento', 'forma pgto', 'forma pag', 'forma de pgto', 'tipo de pagamento',
        'tipo pagamento', 'meio de pagamento', 'meio pagamento', 'meios de pagamento', 'pagamento', 'condicao de pagamento', 'cond. pagamento',
        'condicao pagamento', 'finalizadora', 'modalidade', 'forma de recebimento', 'tipo de recebimento', 'recebimento', 'forma'],
      evitar: ['data', 'valor', 'prazo'] },
    { chave: 'custo', rotulo: 'Custo (CMV da venda)',
      ajuda: 'Custo do que foi vendido. Se não tiver, escolha outro jeito no passo 4.',
      sinonimos: ['custo', 'custo total', 'cmv', 'preco de custo', 'valor de custo', 'valor custo', 'custo da venda', 'custo dos produtos',
        'custo medio', 'vlr custo', 'vl custo', 'custo mercadoria', 'custo da mercadoria', 'total custo', 'custo (r$)'],
      evitar: ['unit'] },
    { chave: 'situacao', rotulo: 'Situação da venda',
      ajuda: 'Vendas canceladas, estornadas ou devolvidas ficam de fora.',
      sinonimos: ['situacao', 'status', 'situacao da venda', 'status da venda', 'status do pedido', 'situacao do pedido', 'estado', 'cancelada', 'cancelado'] },
    { chave: 'numero', rotulo: 'Nº da venda',
      sinonimos: ['n venda', 'no venda', 'n da venda', 'no da venda', 'numero da venda', 'numero venda', 'n pedido', 'no pedido', 'n do pedido',
        'no do pedido', 'numero do pedido', 'numero pedido', 'pedido', 'codigo da venda', 'cod venda', 'cod. venda', 'id venda', 'id da venda',
        'venda', 'documento', 'cupom', 'nota', 'nf', 'nfc-e', 'numero', 'id'] },
    { chave: 'vendedor', rotulo: 'Vendedor',
      sinonimos: ['vendedor', 'vendedora', 'atendente', 'consultor', 'consultora', 'operador', 'operadora', 'usuario', 'responsavel'] }
  ];

  var CAMPOS_MAQ = [
    { chave: 'data', rotulo: 'Data da venda', obrigatorio: true,
      sinonimos: ['data da venda', 'data venda', 'data/hora', 'data e hora', 'data hora', 'data/hora da venda', 'data da transacao', 'data transacao',
        'data de captura', 'data captura', 'dt venda', 'dt. venda', 'data de criacao', 'data', 'data da compra', 'data de venda'],
      evitar: ['pagamento', 'recebimento', 'previs', 'vencimento', 'liquidacao', 'deposito', 'credito', 'repasse'] },
    { chave: 'bruto', rotulo: 'Valor bruto', obrigatorio: true,
      sinonimos: ['valor bruto', 'bruto', 'valor da venda', 'valor venda', 'valor bruto da venda', 'valor da transacao', 'valor transacao',
        'vl bruto', 'vl. bruto', 'valor original', 'valor total', 'valor', 'valor (r$)', 'valor bruto (r$)'],
      evitar: ['liquido', 'taxa', 'tarifa', 'desconto', 'mdr', 'receber', 'antecip', 'parcela'] },
    { chave: 'liquido', rotulo: 'Valor líquido',
      ajuda: 'O que sobra depois da taxa. Se tiver, a taxa é calculada por ele.',
      sinonimos: ['valor liquido', 'liquido', 'valor a receber', 'valor receber', 'valor liquido da venda', 'vl liquido', 'vl. liquido',
        'valor creditado', 'valor recebido', 'liquido a receber', 'valor previsto', 'valor liquido (r$)'] },
    { chave: 'taxa', rotulo: 'Taxa',
      ajuda: 'Pode estar em R$ ou em %. Só é usada se não houver valor líquido.',
      sinonimos: ['taxa', 'valor da taxa', 'taxa (r$)', 'taxa r$', 'mdr', 'taxa mdr', 'taxa (%)', 'taxa %', 'tarifa', 'taxa/tarifa', 'taxas',
        'desconto', 'valor do desconto', 'desconto mdr', 'desconto de mdr', 'comissao', 'percentual', 'taxa administrativa', 'tarifa total',
        'valor da tarifa', 'mdr (%)', 'mdr %'] },
    { chave: 'modalidade', rotulo: 'Modalidade (débito, crédito...)',
      sinonimos: ['modalidade', 'produto', 'tipo', 'tipo de pagamento', 'forma de pagamento', 'meio de pagamento', 'tipo de transacao',
        'tipo transacao', 'tipo de venda', 'forma pagamento', 'produto/modalidade', 'modalidade/produto', 'tipo de cartao', 'tipo de produto',
        'meio pagamento', 'tipo de pagamento/produto'],
      evitar: ['captura', 'terminal', 'maquina'] },
    { chave: 'bandeira', rotulo: 'Bandeira',
      sinonimos: ['bandeira', 'bandeira do cartao', 'bandeiras', 'cartao', 'emissor', 'bandeira/modalidade'] },
    { chave: 'parcelas', rotulo: 'Parcelas',
      sinonimos: ['parcelas', 'n de parcelas', 'no de parcelas', 'numero de parcelas', 'qtd parcelas', 'qtd. parcelas', 'qtde parcelas',
        'quantidade de parcelas', 'total de parcelas', 'plano', 'parcela', 'parcelamento'] },
    { chave: 'status', rotulo: 'Status',
      ajuda: 'Canceladas, estornadas, negadas e chargeback ficam de fora (aparecem à parte).',
      sinonimos: ['status', 'situacao', 'status da venda', 'status da transacao', 'situacao da venda', 'situacao da transacao', 'estado'] },
    { chave: 'nsu', rotulo: 'NSU ou autorização',
      sinonimos: ['nsu', 'nsu/doc', 'nsu/cv', 'cv/nsu', 'nsu/cv/doc', 'codigo de autorizacao', 'cod autorizacao', 'cod. autorizacao', 'autorizacao',
        'stone id', 'id da transacao', 'codigo da transacao', 'tid', 'doc', 'id'] }
  ];

  // ---------- classes de forma de pagamento ----------
  var CLASSES = [
    { chave: 'dinheiro', nome: 'Dinheiro' },
    { chave: 'pix', nome: 'Pix' },
    { chave: 'debito', nome: 'Débito' },
    { chave: 'credito_vista', nome: 'Crédito à vista' },
    { chave: 'credito_parcelado', nome: 'Crédito parcelado' },
    { chave: 'cartao', nome: 'Cartão sem detalhe' },
    { chave: 'voucher', nome: 'Vale (alimentação, refeição)' },
    { chave: 'boleto', nome: 'Boleto ou crediário' },
    { chave: 'outros', nome: 'Outros' }
  ];
  var NOME_CLASSE = {};
  CLASSES.forEach(function (c) { NOME_CLASSE[c.chave] = c.nome; });
  // o que passa na maquininha de cartão
  var GRUPO_CARTAO = { debito: 1, credito_vista: 1, credito_parcelado: 1, cartao: 1, voucher: 1 };
  function ehCartao(classe) { return !!GRUPO_CARTAO[classe]; }
  // para conferir por tipo: débito, crédito (à vista e parcelado), vale, sem detalhe
  function grupoTipo(classe) {
    if (classe === 'debito') return 'deb';
    if (classe === 'credito_vista' || classe === 'credito_parcelado') return 'cred';
    if (classe === 'voucher') return 'vou';
    return 'sem';
  }

  function parcelasDoTexto(s) {
    var m = s.match(/(?:^|[^0-9])(\d{1,2}) ?x(?![a-z])/) || s.match(/(?:^|[^0-9])(\d{1,2}) ?(?:vezes|parcelas|parc)(?![a-z])/) ||
      s.match(/(?:^|[^a-z])x ?(\d{1,2})(?![0-9])/);
    return m ? +m[1] : 0;
  }

  // Entende o texto da forma de pagamento do sistema
  function classificarForma(texto) {
    var s = C.simples(texto);
    if (!s) return 'outros';
    if (/\bpix\b/.test(s)) return 'pix';
    if (/dinheiro|especie|\bcash\b|\bmoeda\b|em maos/.test(s)) return 'dinheiro';
    if (/voucher|\bvale\b|alimentacao|refeicao|\bticket\b|sodexo|alelo|pluxee|\bvr\b|\bva\b/.test(s)) return 'voucher';
    if (/boleto|crediario|\bcarne\b|promissoria|fiado|a prazo|duplicata|convenio/.test(s)) return 'boleto';
    var deb = /\bdebito\b|\bdeb\b|maestro|electron|\bdebit\b/.test(s);
    var cred = /\bcredito\b|\bcred\b|\bcc\b|\bcredit\b/.test(s);
    var n = parcelasDoTexto(s);
    var parc = /parcelad|\bparc\b|\bparcelas?\b/.test(s) || n >= 2;
    if (deb && cred) return 'cartao';
    if (deb) return 'debito';
    if (cred || parc) return (parc && n !== 1) ? 'credito_parcelado' : 'credito_vista';
    if (/cartao|cartoes|\bcard\b|maquin|\bpos\b|\btef\b|visa|master|\belo\b|hiper|amex|american|diners|cabal|sorocred|banescard|getnet|cielo|stone|\brede\b|pagseguro|pagbank|sumup|mercado ?pago|\bton\b/.test(s)) return 'cartao';
    return 'outros';
  }

  // Entende a modalidade que vem da maquininha (parcelas e bandeira ajudam)
  function classificarModalidade(texto, parcelas, bandeira) {
    var n = Number(parcelas) || 0;
    var c = classificarForma(texto);
    if ((c === 'cartao' || c === 'outros') && !vazio(bandeira)) {
      var c2 = classificarForma(String(texto || '') + ' ' + bandeira);
      if (c2 !== 'cartao' && c2 !== 'outros') c = c2;
      else if (C.simples(bandeira) === 'pix') c = 'pix';
    }
    if (c === 'pix' || c === 'voucher' || c === 'debito' || c === 'credito_parcelado') return c;
    if (c === 'credito_vista') return n >= 2 ? 'credito_parcelado' : 'credito_vista';
    if (c === 'cartao') return n >= 2 ? 'credito_parcelado' : 'cartao';
    // sem texto de modalidade: é venda de cartão sem detalhe
    if (vazio(texto)) return n >= 2 ? 'credito_parcelado' : 'cartao';
    return 'outros';
  }

  var BANDEIRAS = [
    [/visa/, 'Visa'], [/master|maestro/, 'Mastercard'], [/\belo\b/, 'Elo'], [/hiper/, 'Hipercard'], [/amex|american/, 'Amex'],
    [/diners/, 'Diners'], [/cabal/, 'Cabal'], [/sorocred/, 'Sorocred'], [/banescard/, 'Banescard'], [/\bpix\b/, 'Pix'],
    [/alelo/, 'Alelo'], [/sodexo|pluxee/, 'Pluxee'], [/ticket/, 'Ticket'], [/\bvr\b/, 'VR']
  ];
  function nomeBandeira(t) {
    var s = C.simples(t);
    if (!s) return '(sem bandeira)';
    for (var i = 0; i < BANDEIRAS.length; i++) if (BANDEIRAS[i][0].test(s)) return BANDEIRAS[i][1];
    var o = String(t).trim();
    return o.charAt(0).toUpperCase() + o.slice(1).toLowerCase();
  }

  function situacaoCancelada(t) {
    return /cancel|estorn|devolvid|devolucao|excluid|inutiliz|desfeit/.test(C.simples(t));
  }
  function statusRecusado(t) {
    return /cancel|estorn|negad|recusad|chargeback|charge back|contestad|desfeit|nao autoriz|reprovad|falh|expirad|desfazimento/.test(C.simples(t));
  }

  // ---------- tabela: cabeçalho, colunas e aba ----------
  function prepararTabela(linhas, campos) {
    var cab = C.acharCabecalho(linhas, campos);
    var cabecalho = (linhas[cab] || []).map(function (v) { return String(v == null ? '' : v).trim(); });
    var escolha = C.detectarColunas(cabecalho, campos);
    return { inicio: cab, cabecalho: cabecalho, escolha: escolha };
  }
  // Escolhe a aba que mais parece ter os dados (mais campos encontrados)
  function pontuarAba(linhas, campos) {
    if (!linhas || !linhas.length) return -1;
    var t = prepararTabela(linhas, campos), nota = 0;
    campos.forEach(function (c) { if (t.escolha[c.chave] >= 0) nota += c.obrigatorio ? 100 : 10; });
    return nota + Math.min(linhas.length - t.inicio - 1, 50) / 100;
  }
  function melhorAba(abas, campos) {
    var melhor = 0, nota = -Infinity;
    (abas || []).forEach(function (a, i) {
      var n = pontuarAba(a.linhas, campos);
      if (n > nota) { nota = n; melhor = i; }
    });
    return melhor;
  }
  // assinatura do cabeçalho, para lembrar as colunas escolhidas de um sistema
  function assinatura(cabecalho) {
    return (cabecalho || []).map(function (c) { return C.simples(c); }).join('|');
  }

  // ---------- taxa: R$ ou % ----------
  function valorTaxa(v) {
    if (typeof v === 'number') return isFinite(v) ? v : null;
    if (vazio(v)) return null;
    return C.valor(String(v).replace(/%/g, ''));
  }
  // A coluna da taxa está em %? (todos os valores até 100 e o nome fala em %, mdr ou percentual;
  // ou as células trazem o sinal de %)
  function taxaEhPercentual(nomeColuna, valores) {
    var nome = C.simples(nomeColuna);
    var nums = [], comSinal = false;
    (valores || []).forEach(function (v) {
      if (vazio(v)) return;
      if (typeof v === 'string' && v.indexOf('%') >= 0) comSinal = true;
      var n = valorTaxa(v);
      if (n != null) nums.push(Math.abs(n));
    });
    if (comSinal) return true;
    if (!nums.length) return /%|percent|porcent/.test(nome);
    var todosAte100 = nums.every(function (n) { return n <= 100; });
    return todosAte100 && /%|mdr|percent|porcent/.test(nome);
  }

  // ---------- leitura das vendas do sistema ----------
  // opcoes.classes: {textoSimples: classe} correções da pessoa
  function lerVendas(linhas, inicio, escolha, opcoes) {
    opcoes = opcoes || {};
    var classes = opcoes.classes || {};
    var vendas = [], ignoradas = [], canceladas = [], lidas = 0;
    function pega(l, k) { var i = escolha[k]; return i != null && i >= 0 ? l[i] : ''; }
    for (var i = inicio + 1; i < linhas.length; i++) {
      var l = linhas[i] || [];
      if (l.every(vazio)) continue;
      lidas++;
      var nl = i + 1;
      if (C.pareceTotal(l)) { ignoradas.push({ linha: nl, motivo: 'Linha de total ou subtotal' }); continue; }
      var dCru = pega(l, 'data'), vCru = pega(l, 'valor');
      var dt = C.data(dCru), v = C.valor(vCru);
      if (!dt && v == null) { ignoradas.push({ linha: nl, motivo: 'Sem data e sem valor (título ou linha vazia)' }); continue; }
      if (!dt) { ignoradas.push({ linha: nl, motivo: 'Data não entendida: "' + String(dCru).slice(0, 30) + '"' }); continue; }
      if (v == null) { ignoradas.push({ linha: nl, motivo: 'Valor não entendido: "' + String(vCru).slice(0, 30) + '"' }); continue; }
      var formaTxt = String(pega(l, 'forma') == null ? '' : pega(l, 'forma')).trim();
      var sit = pega(l, 'situacao');
      var numero = String(pega(l, 'numero') == null ? '' : pega(l, 'numero')).trim();
      if (!vazio(sit) && situacaoCancelada(sit)) {
        canceladas.push({ linha: nl, data: dt, valor: v, forma: formaTxt, situacao: String(sit).trim(), numero: numero });
        continue;
      }
      if (v === 0) { ignoradas.push({ linha: nl, motivo: 'Valor zero' }); continue; }
      if (v < 0) { ignoradas.push({ linha: nl, motivo: 'Valor negativo (parece devolução ou estorno), ficou de fora' }); continue; }
      var chave = C.simples(formaTxt);
      var auto = classificarForma(formaTxt);
      var classe = classes[chave] || auto;
      var custo = escolha.custo != null && escolha.custo >= 0 ? C.valor(pega(l, 'custo')) : null;
      vendas.push({
        linha: nl, data: dt, mes: C.mesDe(dt), valor: v, forma: formaTxt || '(em branco)', chaveForma: chave,
        classe: classe, classeAuto: auto, custo: custo == null ? null : Math.abs(custo), numero: numero,
        vendedor: String(pega(l, 'vendedor') == null ? '' : pega(l, 'vendedor')).trim()
      });
    }
    return { vendas: vendas, ignoradas: ignoradas, canceladas: canceladas, lidas: lidas };
  }

  // Lista os textos de forma de pagamento e como cada um foi entendido
  function textosDeForma(vendas) {
    var mapa = {}, lista = [];
    vendas.forEach(function (v) {
      var k = v.chaveForma;
      if (!mapa[k]) { mapa[k] = { chave: k, texto: v.forma, classe: v.classe, classeAuto: v.classeAuto, qtd: 0, valor: 0 }; lista.push(mapa[k]); }
      mapa[k].qtd++; mapa[k].valor = arred(mapa[k].valor + v.valor);
    });
    lista.sort(function (a, b) { return b.valor - a.valor; });
    return lista;
  }
  // Troca a classe de um texto (correção da pessoa) sem reler o arquivo
  function aplicarClasses(vendas, classes) {
    vendas.forEach(function (v) { v.classe = (classes && classes[v.chaveForma]) || v.classeAuto; });
    return vendas;
  }

  // ---------- leitura da maquininha ----------
  // opcoes: {taxaPct: true|false|null (null = descobrir), arquivo: nome}
  function lerMaquininha(linhas, inicio, escolha, opcoes) {
    opcoes = opcoes || {};
    function pega(l, k) { var i = escolha[k]; return i != null && i >= 0 ? l[i] : ''; }
    var taxaPct = opcoes.taxaPct;
    if (taxaPct == null && escolha.taxa != null && escolha.taxa >= 0) {
      var vals = [];
      for (var j = inicio + 1; j < linhas.length; j++) vals.push((linhas[j] || [])[escolha.taxa]);
      taxaPct = taxaEhPercentual((linhas[inicio] || [])[escolha.taxa], vals);
    }
    var temLiq = escolha.liquido != null && escolha.liquido >= 0;
    var temTaxa = escolha.taxa != null && escolha.taxa >= 0;
    var transacoes = [], ignoradas = [], aParte = [], lidas = 0;
    for (var i = inicio + 1; i < linhas.length; i++) {
      var l = linhas[i] || [];
      if (l.every(vazio)) continue;
      lidas++;
      var nl = i + 1;
      if (C.pareceTotal(l)) { ignoradas.push({ linha: nl, motivo: 'Linha de total ou subtotal' }); continue; }
      var dCru = pega(l, 'data'), bCru = pega(l, 'bruto');
      var dt = C.data(dCru), bruto = C.valor(bCru);
      if (!dt && bruto == null) { ignoradas.push({ linha: nl, motivo: 'Sem data e sem valor (título ou linha vazia)' }); continue; }
      if (!dt) { ignoradas.push({ linha: nl, motivo: 'Data não entendida: "' + String(dCru).slice(0, 30) + '"' }); continue; }
      if (bruto == null) { ignoradas.push({ linha: nl, motivo: 'Valor bruto não entendido: "' + String(bCru).slice(0, 30) + '"' }); continue; }
      var modTxt = String(pega(l, 'modalidade') == null ? '' : pega(l, 'modalidade')).trim();
      var bandTxt = String(pega(l, 'bandeira') == null ? '' : pega(l, 'bandeira')).trim();
      var parc = C.valor(pega(l, 'parcelas'));
      parc = parc == null ? 0 : Math.round(Math.abs(parc));
      if (!parc) { var pt = parcelasDoTexto(C.simples(modTxt)); if (pt) parc = pt; }
      var status = String(pega(l, 'status') == null ? '' : pega(l, 'status')).trim();
      var base = { linha: nl, arquivo: opcoes.arquivo || '', data: dt, mes: C.mesDe(dt), bruto: Math.abs(bruto), modalidade: modTxt,
        bandeira: nomeBandeira(bandTxt), parcelas: parc, status: status, nsu: String(pega(l, 'nsu') == null ? '' : pega(l, 'nsu')).trim() };
      if (status && statusRecusado(status)) { base.motivo = 'Status: ' + status; aParte.push(base); continue; }
      if (bruto < 0) { base.motivo = 'Valor negativo (estorno ou cancelamento)'; aParte.push(base); continue; }
      if (bruto === 0) { ignoradas.push({ linha: nl, motivo: 'Valor zero' }); continue; }
      var liq = temLiq ? C.valor(pega(l, 'liquido')) : null;
      var taxa = null, origem = '';
      if (liq != null) { taxa = arred(bruto - Math.abs(liq)); origem = 'liquido'; }
      else if (temTaxa) {
        var t = valorTaxa(pega(l, 'taxa'));
        if (t != null) { taxa = taxaPct ? arred(bruto * Math.abs(t) / 100) : arred(Math.abs(t)); origem = taxaPct ? 'pct' : 'reais'; }
      }
      base.liquido = liq == null ? null : Math.abs(liq);
      base.taxa = taxa;
      base.origemTaxa = origem;
      base.classe = classificarModalidade(modTxt, parc, bandTxt);
      transacoes.push(base);
    }
    return { transacoes: transacoes, ignoradas: ignoradas, aParte: aParte, lidas: lidas, taxaPct: !!taxaPct };
  }

  // ---------- meses ----------
  function mesesDisponiveis(vendas, transacoes) {
    var m = {};
    (vendas || []).forEach(function (v) { m[v.mes] = 1; });
    (transacoes || []).forEach(function (t) { m[t.mes] = 1; });
    return Object.keys(m).sort().reverse();
  }
  // padrão: o mês mais recente com vendas do sistema (se não houver, o da maquininha)
  function mesPadrao(vendas, transacoes) {
    var mv = mesesDisponiveis(vendas, []);
    if (mv.length) return mv[0];
    var mt = mesesDisponiveis([], transacoes);
    return mt[0] || null;
  }

  // ---------- CMV pela coluna de custo ----------
  // Venda paga com duas formas vem em duas linhas e o sistema costuma repetir o custo inteiro nas duas.
  // Se o mesmo Nº de venda aparece com formas diferentes e o mesmo custo, conta o custo uma vez só.
  function cmvPelaColuna(vendas) {
    var semNumero = 0, total = 0, semCusto = 0, repetidas = 0, grupos = {}, ordem = [];
    vendas.forEach(function (v) {
      if (v.custo == null) { semCusto++; return; }
      if (!v.numero) { total += v.custo; semNumero++; return; }
      if (!grupos[v.numero]) { grupos[v.numero] = []; ordem.push(v.numero); }
      grupos[v.numero].push(v);
    });
    ordem.forEach(function (n) {
      var g = grupos[n];
      var mesmoCusto = g.every(function (x) { return x.custo === g[0].custo; });
      var formas = {};
      g.forEach(function (x) { formas[x.chaveForma] = 1; });
      if (g.length > 1 && mesmoCusto && Object.keys(formas).length === g.length) { total += g[0].custo; repetidas++; }
      else g.forEach(function (x) { total += x.custo; });
    });
    return { cmv: arred(total), semCusto: semCusto, repetidas: repetidas };
  }

  // ---------- conferência dia a dia ----------
  var SELOS = {
    ok: { texto: 'Bateu', tipo: 'bom' },
    maq_maior: { texto: 'Maquininha maior: venda no cartão que pode não ter sido lançada no sistema', tipo: 'ruim' },
    sis_maior: { texto: 'Sistema maior: lançado como cartão sem passar na maquininha, ou lançado com a forma errada', tipo: 'ruim' },
    forma_trocada: { texto: 'O total bate, mas débito e crédito não: forma lançada errada no sistema', tipo: 'meio' }
  };
  function vazioTipos() { return { total: 0, deb: 0, cred: 0, vou: 0, sem: 0 }; }

  // Tenta achar o par de cada venda pelo valor (mesmo dia), para apontar quais vendas sobraram
  function parear(itensSis, itensMaq) {
    var usadosM = {}, parS = {}, trocadas = [];
    var ordS = itensSis.map(function (x, i) { return i; }).sort(function (a, b) { return itensSis[b].valor - itensSis[a].valor; });
    // 1ª volta: mesmo valor e mesmo tipo; 2ª volta: mesmo valor, tipo diferente
    [true, false].forEach(function (mesmoTipo) {
      ordS.forEach(function (i) {
        if (parS[i] != null) return;
        var s = itensSis[i];
        for (var j = 0; j < itensMaq.length; j++) {
          if (usadosM[j]) continue;
          var m = itensMaq[j];
          if (Math.abs(m.valor - s.valor) > 0.009) continue;
          if (mesmoTipo && grupoTipo(m.classe) !== grupoTipo(s.classe)) continue;
          usadosM[j] = true; parS[i] = j;
          var gs = grupoTipo(s.classe), gm = grupoTipo(m.classe);
          if (!mesmoTipo && gs !== 'sem' && gm !== 'sem' && gs !== gm) trocadas.push({ valor: s.valor, sistema: s, maquininha: m });
          break;
        }
      });
    });
    return {
      semParSistema: itensSis.filter(function (x, i) { return parS[i] == null; }),
      semParMaquininha: itensMaq.filter(function (x, j) { return !usadosM[j]; }),
      trocadas: trocadas
    };
  }

  function conferenciaDiaria(vendas, transacoes, tolerancia) {
    var tol = tolerancia == null ? 1 : Math.abs(tolerancia);
    var dias = {}, lista = [];
    function dia(d) {
      if (!dias[d]) { dias[d] = { data: d, sis: vazioTipos(), maq: vazioTipos(), itensSis: [], itensMaq: [] }; lista.push(dias[d]); }
      return dias[d];
    }
    vendas.forEach(function (v) {
      if (!ehCartao(v.classe)) return;
      var d = dia(v.data), g = grupoTipo(v.classe);
      d.sis.total += v.valor; d.sis[g] += v.valor;
      d.itensSis.push({ valor: v.valor, classe: v.classe, forma: v.forma, numero: v.numero, linha: v.linha });
    });
    transacoes.forEach(function (t) {
      if (!ehCartao(t.classe)) return;
      var d = dia(t.data), g = grupoTipo(t.classe);
      d.maq.total += t.bruto; d.maq[g] += t.bruto;
      d.itensMaq.push({ valor: t.bruto, classe: t.classe, modalidade: t.modalidade, bandeira: t.bandeira, nsu: t.nsu, arquivo: t.arquivo, linha: t.linha });
    });
    var resumo = { diasComDiferenca: 0, diasFormaTrocada: 0, diasOk: 0, somaMaqMaior: 0, somaSisMaior: 0, somaDiferencas: 0 };
    lista.forEach(function (d) {
      ['sis', 'maq'].forEach(function (k) { Object.keys(d[k]).forEach(function (x) { d[k][x] = arred(d[k][x]); }); });
      d.diferenca = arred(d.maq.total - d.sis.total);
      d.separa = d.sis.sem === 0 && d.maq.sem === 0;
      d.difDeb = arred(d.maq.deb - d.sis.deb);
      d.difCred = arred(d.maq.cred - d.sis.cred);
      d.difVou = arred(d.maq.vou - d.sis.vou);
      var p = parear(d.itensSis, d.itensMaq);
      d.semParSistema = p.semParSistema; d.semParMaquininha = p.semParMaquininha; d.trocadas = p.trocadas;
      if (d.diferenca > tol) d.situacao = 'maq_maior';
      else if (d.diferenca < -tol) d.situacao = 'sis_maior';
      else if (d.separa && (Math.abs(d.difDeb) > tol || Math.abs(d.difCred) > tol || Math.abs(d.difVou) > tol)) d.situacao = 'forma_trocada';
      else d.situacao = 'ok';
      d.selo = SELOS[d.situacao].texto;
      d.tipoSelo = SELOS[d.situacao].tipo;
      if (d.situacao === 'maq_maior' || d.situacao === 'sis_maior') {
        resumo.diasComDiferenca++;
        resumo.somaDiferencas += d.diferenca;
        if (d.diferenca > 0) resumo.somaMaqMaior += d.diferenca; else resumo.somaSisMaior += -d.diferenca;
      } else if (d.situacao === 'forma_trocada') resumo.diasFormaTrocada++;
      else resumo.diasOk++;
    });
    resumo.somaMaqMaior = arred(resumo.somaMaqMaior);
    resumo.somaSisMaior = arred(resumo.somaSisMaior);
    resumo.somaDiferencas = arred(resumo.somaDiferencas);
    var peso = { maq_maior: 0, sis_maior: 0, forma_trocada: 1, ok: 2 };
    lista.sort(function (a, b) { return peso[a.situacao] - peso[b.situacao] || (a.data < b.data ? -1 : a.data > b.data ? 1 : 0); });
    return { dias: lista, resumo: resumo, tolerancia: tol };
  }

  // ---------- taxas por modalidade e bandeira ----------
  function taxasPor(transacoes) {
    var porMod = {}, porModBand = {}, listaMod = [], listaMB = [];
    function soma(o, t) {
      o.qtd++; o.bruto += t.bruto;
      if (t.taxa != null) { o.taxa += t.taxa; o.brutoComTaxa += t.bruto; o.comTaxa++; }
    }
    function novo(extra) { var o = { qtd: 0, bruto: 0, taxa: 0, brutoComTaxa: 0, comTaxa: 0 }; Object.keys(extra).forEach(function (k) { o[k] = extra[k]; }); return o; }
    transacoes.forEach(function (t) {
      if (!porMod[t.classe]) { porMod[t.classe] = novo({ classe: t.classe, nome: NOME_CLASSE[t.classe] }); listaMod.push(porMod[t.classe]); }
      soma(porMod[t.classe], t);
      var k = t.classe + '|' + t.bandeira;
      if (!porModBand[k]) { porModBand[k] = novo({ classe: t.classe, nome: NOME_CLASSE[t.classe], bandeira: t.bandeira }); listaMB.push(porModBand[k]); }
      soma(porModBand[k], t);
    });
    function fecha(o) {
      o.bruto = arred(o.bruto); o.taxa = arred(o.taxa); o.brutoComTaxa = arred(o.brutoComTaxa);
      o.efetiva = o.brutoComTaxa > 0 && o.comTaxa ? o.taxa / o.brutoComTaxa : null;
    }
    listaMod.forEach(fecha); listaMB.forEach(fecha);
    var ordem = {}; CLASSES.forEach(function (c, i) { ordem[c.chave] = i; });
    listaMod.sort(function (a, b) { return ordem[a.classe] - ordem[b.classe]; });
    listaMB.sort(function (a, b) { return ordem[a.classe] - ordem[b.classe] || b.bruto - a.bruto; });
    var maisCara = null;
    listaMod.forEach(function (o) { if (o.efetiva != null && (!maisCara || o.efetiva > maisCara.efetiva)) maisCara = o; });
    return { porModalidade: listaMod, porModalidadeBandeira: listaMB, maisCara: maisCara ? maisCara.classe : null };
  }

  // ---------- o resultado do mês ----------
  // entrada: {vendas, transacoes, mes, aliquota (%), tolerancia (R$), cmv: {modo:'coluna'|'valor'|'pct', valor, pct (%)}}
  function calcular(entrada) {
    var mes = entrada.mes;
    var V = (entrada.vendas || []).filter(function (v) { return !mes || v.mes === mes; });
    var T = (entrada.transacoes || []).filter(function (t) { return !mes || t.mes === mes; });
    var aliq = Number(entrada.aliquota) || 0;
    var cmvCfg = entrada.cmv || { modo: 'coluna' };

    var vendas = C.soma(V, function (v) { return v.valor; });
    var cartaoSistema = C.soma(V.filter(function (v) { return ehCartao(v.classe); }), function (v) { return v.valor; });
    var TC = T.filter(function (t) { return ehCartao(t.classe); });
    var maquininha = C.soma(TC, function (t) { return t.bruto; });
    var comTaxa = T.filter(function (t) { return t.taxa != null; });
    var taxas = C.soma(comTaxa, function (t) { return t.taxa; });
    var brutoComTaxa = C.soma(comTaxa, function (t) { return t.bruto; });
    var semTaxa = T.length - comTaxa.length;

    var cmv = null, cmvInfo = { modo: cmvCfg.modo, semCusto: 0, repetidas: 0 };
    if (cmvCfg.modo === 'coluna') {
      var temColuna = V.some(function (v) { return v.custo != null; });
      if (temColuna) { var r = cmvPelaColuna(V); cmv = r.cmv; cmvInfo.semCusto = r.semCusto; cmvInfo.repetidas = r.repetidas; }
    } else if (cmvCfg.modo === 'valor') {
      var cv = typeof cmvCfg.valor === 'number' ? cmvCfg.valor : C.valor(cmvCfg.valor);
      cmv = cv == null ? null : arred(Math.abs(cv));
    } else if (cmvCfg.modo === 'pct') {
      var cp = typeof cmvCfg.pct === 'number' ? cmvCfg.pct : C.valor(String(cmvCfg.pct == null ? '' : cmvCfg.pct).replace('%', ''));
      cmv = cp == null ? null : arred(vendas * Math.abs(cp) / 100);
    }
    var impostos = arred(vendas * aliq / 100);
    // sem CMV não dá para falar de margem: fica pendente (null)
    var margemBruta = cmv == null ? null : arred(vendas - cmv);
    var margemContrib = cmv == null ? null : arred(vendas - impostos - cmv - taxas);
    function sobre(x) { return vendas && x != null ? x / vendas : null; }

    // formas de pagamento
    var formas = {}, listaFormas = [];
    V.forEach(function (v) {
      if (!formas[v.classe]) { formas[v.classe] = { classe: v.classe, nome: NOME_CLASSE[v.classe], qtd: 0, valor: 0 }; listaFormas.push(formas[v.classe]); }
      formas[v.classe].qtd++; formas[v.classe].valor += v.valor;
    });
    listaFormas.forEach(function (f) { f.valor = arred(f.valor); f.pct = sobre(f.valor); });
    listaFormas.sort(function (a, b) { return b.valor - a.valor; });

    var pixSistema = C.soma(V.filter(function (v) { return v.classe === 'pix'; }), function (v) { return v.valor; });
    var pixMaquininha = C.soma(T.filter(function (t) { return t.classe === 'pix'; }), function (t) { return t.bruto; });

    return {
      mes: mes,
      qtdVendas: V.length, qtdTransacoes: T.length,
      vendas: vendas,
      cartaoSistema: cartaoSistema,
      maquininha: maquininha,
      diferencaCartao: arred(maquininha - cartaoSistema),
      taxas: taxas, brutoComTaxa: brutoComTaxa, semTaxa: semTaxa,
      taxaEfetiva: brutoComTaxa ? taxas / brutoComTaxa : null,
      aliquota: aliq, impostos: impostos,
      cmv: cmv, cmvInfo: cmvInfo,
      margemBruta: margemBruta, margemBrutaPct: sobre(margemBruta),
      margemContrib: margemContrib, margemContribPct: sobre(margemContrib),
      formas: listaFormas,
      pixSistema: pixSistema, pixMaquininha: pixMaquininha,
      conferencia: conferenciaDiaria(V, T, entrada.tolerancia),
      taxasPor: taxasPor(T)
    };
  }

  // Itens do gráfico "do que vendeu até o que sobrou"
  function cascata(r) {
    return [
      { nome: 'Vendas', valor: r.vendas, cor: '#1F5C99' },
      { nome: 'Impostos', valor: -r.impostos, cor: '#C2410C' },
      { nome: 'CMV (custo do que vendeu)', valor: -(r.cmv || 0), cor: '#C2410C' },
      { nome: 'Taxas de cartão', valor: -r.taxas, cor: '#C2410C' },
      { nome: 'Sobra (margem de contribuição)', valor: r.margemContrib || 0, cor: (r.margemContrib || 0) >= 0 ? '#1F8A4C' : '#C2410C' }
    ];
  }

  // ---------- Excel: monta as abas (UI.baixarExcel recebe isto) ----------
  function abasExcel(r, cliente) {
    var nomeMes = r.mes ? C.mesLongo(r.mes) : '';
    var resumo = [
      ['Vendas e margem', cliente || ''],
      ['Mês', nomeMes],
      [],
      ['Item', 'Valor (R$)', '% das vendas'],
      ['Vendas no sistema', r.vendas, r.vendas ? 1 : null],
      ['Vendas no cartão (sistema)', r.cartaoSistema, pctOu(r.cartaoSistema, r.vendas)],
      ['Vendas na maquininha (bruto, cartões)', r.maquininha, null],
      ['Diferença cartão (maquininha menos sistema)', r.diferencaCartao, null],
      ['Impostos sobre vendas (' + C.num(r.aliquota, 2) + '%)', r.impostos, pctOu(r.impostos, r.vendas)],
      ['CMV (custo do que vendeu)', r.cmv == null ? null : r.cmv, pctOu(r.cmv, r.vendas)],
      ['Taxas da maquininha', r.taxas, pctOu(r.taxas, r.vendas)],
      ['Taxa efetiva da maquininha (sobre o bruto)', null, r.taxaEfetiva],
      ['Margem bruta (vendas menos CMV)', r.margemBruta, r.margemBrutaPct],
      ['Margem de contribuição (o que sobrou)', r.margemContrib, r.margemContribPct],
      [],
      ['Pix no sistema (só informação)', r.pixSistema, null],
      ['Pix na maquininha (só informação)', r.pixMaquininha, null]
    ];
    var dia = [['Data', 'Cartão no sistema', 'Maquininha', 'Diferença', 'Débito sistema', 'Débito maquininha', 'Crédito sistema', 'Crédito maquininha', 'Situação', 'Detalhe']];
    r.conferencia.dias.forEach(function (d) {
      dia.push([C.dataBR(d.data), d.sis.total, d.maq.total, d.diferenca,
        d.separa ? d.sis.deb : null, d.separa ? d.maq.deb : null, d.separa ? d.sis.cred : null, d.separa ? d.maq.cred : null,
        d.selo, detalheDia(d)]);
    });
    dia.push(['Total das diferenças (dias fora da tolerância)', null, null, r.conferencia.resumo.somaDiferencas, null, null, null, null, '', '']);
    var taxas = [['Modalidade', 'Bandeira', 'Transações', 'Bruto (R$)', 'Taxa (R$)', 'Taxa efetiva']];
    r.taxasPor.porModalidadeBandeira.forEach(function (o) { taxas.push([o.nome, o.bandeira, o.qtd, o.bruto, o.comTaxa ? o.taxa : null, o.efetiva]); });
    taxas.push([]);
    taxas.push(['Por modalidade', '', 'Transações', 'Bruto (R$)', 'Taxa (R$)', 'Taxa efetiva']);
    r.taxasPor.porModalidade.forEach(function (o) {
      taxas.push([o.nome + (r.taxasPor.maisCara === o.classe ? ' (a mais cara)' : ''), '', o.qtd, o.bruto, o.comTaxa ? o.taxa : null, o.efetiva]);
    });
    taxas.push(['Total', '', r.qtdTransacoes, C.soma(r.taxasPor.porModalidade, function (o) { return o.bruto; }), r.taxas, r.taxaEfetiva]);
    var formas = [['Forma de pagamento', 'Vendas', 'Valor (R$)', '% do total']];
    r.formas.forEach(function (f) { formas.push([f.nome, f.qtd, f.valor, f.pct]); });
    formas.push(['Total', r.qtdVendas, r.vendas, r.vendas ? 1 : null]);
    return [
      { nome: 'Resumo', linhas: resumo, larguras: [46, 18, 14], formatoMoeda: [1], formatoPct: [2] },
      { nome: 'Dia a dia', linhas: dia, larguras: [12, 16, 14, 12, 14, 16, 14, 16, 60, 60], formatoMoeda: [1, 2, 3, 4, 5, 6, 7] },
      { nome: 'Taxas', linhas: taxas, larguras: [30, 16, 12, 14, 12, 12], formatoMoeda: [3, 4], formatoPct: [5] },
      { nome: 'Formas de pagamento', linhas: formas, larguras: [30, 10, 14, 10], formatoMoeda: [2], formatoPct: [3] }
    ];
  }
  function pctOu(x, total) { return x == null || !total ? null : x / total; }

  // Explica, em palavras, o que sobrou sem par num dia
  function detalheDia(d) {
    var partes = [];
    if (d.semParMaquininha.length) partes.push('Na maquininha sem par no sistema: ' + d.semParMaquininha.map(function (m) { return C.brl(m.valor) + ' (' + NOME_CLASSE[m.classe] + ')'; }).join(', '));
    if (d.semParSistema.length) partes.push('No sistema sem par na maquininha: ' + d.semParSistema.map(function (s) { return C.brl(s.valor) + ' (' + s.forma + ')'; }).join(', '));
    if (d.trocadas.length) partes.push('Forma diferente: ' + d.trocadas.map(function (t) { return C.brl(t.valor) + ' no sistema como ' + NOME_CLASSE[t.sistema.classe] + ', na maquininha como ' + NOME_CLASSE[t.maquininha.classe]; }).join('; '));
    return partes.join('. ');
  }

  return {
    CAMPOS_VENDAS: CAMPOS_VENDAS, CAMPOS_MAQ: CAMPOS_MAQ, CLASSES: CLASSES, NOME_CLASSE: NOME_CLASSE, SELOS: SELOS,
    ehCartao: ehCartao, classificarForma: classificarForma, classificarModalidade: classificarModalidade, parcelasDoTexto: parcelasDoTexto,
    nomeBandeira: nomeBandeira, situacaoCancelada: situacaoCancelada, statusRecusado: statusRecusado,
    prepararTabela: prepararTabela, melhorAba: melhorAba, pontuarAba: pontuarAba, assinatura: assinatura,
    valorTaxa: valorTaxa, taxaEhPercentual: taxaEhPercentual,
    lerVendas: lerVendas, textosDeForma: textosDeForma, aplicarClasses: aplicarClasses, lerMaquininha: lerMaquininha,
    mesesDisponiveis: mesesDisponiveis, mesPadrao: mesPadrao, cmvPelaColuna: cmvPelaColuna,
    conferenciaDiaria: conferenciaDiaria, parear: parear, taxasPor: taxasPor, calcular: calcular, cascata: cascata,
    abasExcel: abasExcel, detalheDia: detalheDia
  };
});

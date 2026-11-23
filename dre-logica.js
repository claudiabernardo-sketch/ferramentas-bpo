/* Ferramentas do BPO: DRE gerencial e painel do cliente, lógica sem tela.
   Funciona no navegador (window.DRE, precisa de comum.js antes) e no Node (require), para os testes. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./comum.js'));
  else raiz.DRE = fabrica(raiz.Comum);
})(typeof self !== 'undefined' ? self : this, function (C) {
  'use strict';

  var CHAVE = 'ferramentas-bpo:dre:v1';
  var CLASSIFICAR = 'a-classificar';

  // ---------- texto ----------
  function norm(t) { return C.simples(t).replace(/[^a-z0-9%]+/g, ' ').trim(); }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function texto(v) { return v == null ? '' : String(v).trim(); }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }

  // ---------- colunas do relatório ----------
  var CAMPOS = [
    { chave: 'data', rotulo: 'Data (de pagamento ou de competência)', obrigatorio: true,
      ajuda: 'Data de pagamento dá a DRE de caixa (quando o dinheiro entrou ou saiu). Data de competência dá a DRE por competência (quando a venda ou a despesa aconteceu).',
      sinonimos: ['data', 'data de pagamento', 'data do pagamento', 'data pagamento', 'dt pagamento', 'data de competencia', 'data da competencia', 'data competencia', 'competencia',
        'data movimento', 'data do movimento', 'data de movimento', 'data movimentacao', 'data da movimentacao', 'data lancamento', 'data do lancamento', 'data de lancamento',
        'data da baixa', 'data de baixa', 'data baixa', 'data de recebimento', 'data do recebimento', 'data efetiva', 'data de quitacao', 'data da quitacao', 'data de conciliacao',
        'vencimento', 'data de vencimento', 'data do vencimento', 'dt', 'dia'],
      evitar: ['emissao', 'cadastro', 'criacao', 'alteracao', 'previsao'] },
    { chave: 'valor', rotulo: 'Valor', obrigatorio: true,
      ajuda: 'Se o relatório tem colunas separadas de Entrada e Saída, escolha essas duas e deixe esta em branco.',
      sinonimos: ['valor', 'valor (r$)', 'valor r$', 'valor pago', 'valor recebido', 'valor pago/recebido', 'valor liquido', 'valor do lancamento', 'valor da movimentacao',
        'valor total', 'valor realizado', 'valor efetivo', 'valor baixado', 'valor final', 'valor da parcela', 'vlr', 'vl', 'montante', 'quantia', 'r$'],
      evitar: ['original', 'previsto', 'desconto', 'saldo', 'juros', 'multa', 'acrescimo', 'taxa', 'bruto'] },
    { chave: 'categoria', rotulo: 'Categoria', obrigatorio: true,
      sinonimos: ['categoria', 'categoria 1', 'categorias', 'categoria financeira', 'plano de contas', 'plano de conta', 'conta gerencial', 'conta do plano', 'conta contabil',
        'classificacao', 'classificacao financeira', 'natureza financeira', 'natureza', 'subcategoria', 'grupo de contas'],
      evitar: ['bancaria', 'banco', 'corrente'] },
    { chave: 'descricao', rotulo: 'Descrição',
      sinonimos: ['descricao', 'descricao do lancamento', 'historico', 'observacao', 'observacoes', 'obs', 'detalhe', 'detalhes', 'complemento', 'memo', 'referencia'],
      evitar: ['categoria'] },
    { chave: 'contato', rotulo: 'Cliente ou fornecedor',
      sinonimos: ['fornecedor/cliente', 'cliente/fornecedor', 'cliente / fornecedor', 'fornecedor / cliente', 'contato', 'nome do contato', 'cliente', 'fornecedor', 'favorecido',
        'pagador', 'beneficiario', 'razao social', 'nome fantasia', 'nome', 'pessoa', 'credor', 'sacado'],
      evitar: ['codigo', 'cnpj', 'cpf', 'documento'] },
    { chave: 'tipo', rotulo: 'Tipo (receita ou despesa)',
      ajuda: 'Coluna que diz se é Receita ou Despesa, Entrada ou Saída, Crédito ou Débito (C/D).',
      sinonimos: ['tipo', 'tipo de lancamento', 'tipo do lancamento', 'tipo de movimento', 'tipo da movimentacao', 'tipo de operacao', 'operacao', 'c/d', 'd/c', 'credito/debito',
        'debito/credito', 'entrada/saida', 'receita/despesa', 'e/s', 'r/d', 'movimento'],
      evitar: ['documento', 'pagamento', 'cobranca', 'conta', 'cliente', 'pessoa'] },
    { chave: 'entrada', rotulo: 'Entrada (só se for coluna separada)',
      sinonimos: ['entrada', 'entradas', 'credito', 'creditos', 'recebimento', 'recebimentos', 'valor entrada', 'valor de entrada', 'valor credito', 'recebido'],
      evitar: ['data', 'saida', 'forma', 'tipo', 'cartao'] },
    { chave: 'saida', rotulo: 'Saída (só se for coluna separada)',
      sinonimos: ['saida', 'saidas', 'debito', 'debitos', 'pagamento', 'pagamentos', 'valor saida', 'valor de saida', 'valor debito'],
      evitar: ['data', 'entrada', 'forma', 'tipo', 'cartao', 'condicao'] },
    { chave: 'situacao', rotulo: 'Situação',
      ajuda: 'Pago, recebido, em aberto, cancelado. Se tiver, dá para usar só o que já aconteceu.',
      sinonimos: ['situacao', 'status', 'situacao do lancamento', 'status do lancamento', 'situacao do pagamento', 'estado', 'quitado', 'baixado'],
      evitar: ['conta'] }
  ];

  // Campos com o "obrigatório" certo para a escolha atual (Valor deixa de ser obrigatório com Entrada e Saída)
  function camposPara(escolha) {
    var es = escolha && escolha.entrada >= 0 && escolha.saida >= 0;
    return CAMPOS.map(function (c) {
      if (c.chave !== 'valor') return c;
      var n = Object.assign({}, c); n.obrigatorio = !es; return n;
    });
  }
  function faltam(escolha) { return C.faltando(escolha, camposPara(escolha)); }

  // Entre várias colunas de data, prefere pagamento, depois movimento, depois competência, por último vencimento
  var PRIORIDADE_DATA = [/pag|baixa|quita|receb|efetiv|concilia/, /moviment|lancament|extrato|caixa/, /compet/, /^data$|^dt$|^dia$/, /venc/];
  function detectar(cabecalho) {
    var escolha = C.detectarColunas(cabecalho, CAMPOS);
    var usadas = {};
    Object.keys(escolha).forEach(function (k) { if (k !== 'data' && escolha[k] >= 0) usadas[escolha[k]] = true; });
    var candidatas = [];
    cabecalho.forEach(function (nome, i) {
      if (!usadas[i] && C.notaColuna(nome, CAMPOS[0]) >= 70) candidatas.push(i);
    });
    for (var p = 0; p < PRIORIDADE_DATA.length; p++) {
      var achou = candidatas.filter(function (i) { return PRIORIDADE_DATA[p].test(norm(cabecalho[i])); });
      if (achou.length) { escolha.data = achou[0]; break; }
    }
    return escolha;
  }
  function regimeDaColuna(nome) {
    var n = norm(nome);
    if (!n) return null;
    if (/compet/.test(n)) return 'competencia';
    if (/pag|baixa|quita|receb|efetiv|concilia|moviment|extrato|caixa/.test(n)) return 'caixa';
    if (/venc/.test(n)) return 'vencimento';
    return null;
  }
  function assinatura(cabecalho) {
    return cabecalho.map(norm).filter(function (x) { return x; }).join('|');
  }
  // Escolhe a aba cujo cabeçalho tem mais colunas reconhecidas
  function melhorAba(abas) {
    var melhor = 0, nota = -1;
    (abas || []).forEach(function (aba, i) {
      var cab = aba.linhas[C.acharCabecalho(aba.linhas, CAMPOS)] || [];
      var esc2 = detectar(cab), n = 0;
      CAMPOS.forEach(function (c) { if (esc2[c.chave] >= 0) n += c.obrigatorio ? 10 : 2; });
      n += Math.min(aba.linhas.length, 500) / 1000;
      if (n > nota) { nota = n; melhor = i; }
    });
    return melhor;
  }

  // ---------- tipo e situação ----------
  function sinalDoTipo(v) {
    var s = norm(v);
    if (!s) return null;
    if (/^(d|s|-|deb)$/.test(s) || /(^| )(despesas?|saidas?|debitos?|debito|pagamentos?|pago|pagar|retirada|transferencia de saida|transferencia enviada)( |$)/.test(s)) return -1;
    if (/^(c|r|e|\+|cred)$/.test(s) || /(^| )(receitas?|entradas?|creditos?|credito|recebimentos?|recebido|receber|deposito|transferencia de entrada|transferencia recebida)( |$)/.test(s)) return 1;
    if (String(v).trim() === '-') return -1;
    if (String(v).trim() === '+') return 1;
    return null;
  }
  // 'cancelado', 'aberto' ou 'ok'
  function situacaoDe(v) {
    var s = norm(v);
    if (!s) return 'ok';
    if (/cancel|estorn|excluid|anulad/.test(s)) return 'cancelado';
    if (/em aberto|^aberto|a vencer|vencid|vence hoje|atrasad|em atraso|previst|pendente|a pagar|a receber|nao pago|nao recebido|agendad|aguardando|nao quitado|nao conciliado|em dia/.test(s)) return 'aberto';
    return 'ok';
  }

  // ---------- leitura das linhas ----------
  // Devolve {lancamentos, ignoradas, regra, semTipo, lidas}
  function processar(linhas, iCab, escolha, opcoes) {
    opcoes = opcoes || {};
    var soPago = opcoes.soPago !== false;
    var usarES = escolha.entrada >= 0 && escolha.saida >= 0;
    var temTipo = !usarES && escolha.tipo >= 0;
    var temSit = escolha.situacao >= 0;
    var lanc = [], ign = [];
    function pega(l, k) { var i = escolha[k]; return i != null && i >= 0 ? l[i] : ''; }
    for (var i = iCab + 1; i < linhas.length; i++) {
      var l = linhas[i];
      if (!l || !l.some(function (v) { return !C.vazio(v); })) continue;
      var n = i + 1;
      var resumo = l.filter(function (v) { return !C.vazio(v); }).slice(0, 6).map(String).join(' | ').slice(0, 140);
      var motivo = null, sit = temSit ? situacaoDe(pega(l, 'situacao')) : 'ok';
      var bruto = pega(l, 'data'), dt = C.data(bruto), v = null;
      if (usarES) {
        var e = C.valor(pega(l, 'entrada')), s = C.valor(pega(l, 'saida'));
        v = (e == null && s == null) ? null : C.arred(Math.abs(e || 0) - Math.abs(s || 0));
      } else v = C.valor(pega(l, 'valor'));
      if (C.pareceTotal(l)) motivo = 'Linha de total ou saldo';
      else if (sit === 'cancelado') motivo = 'Cancelada ou estornada';
      else if (sit === 'aberto' && soPago) motivo = 'Em aberto (ainda não foi pago nem recebido)';
      else if (!dt) motivo = C.vazio(bruto) ? 'Sem data' : 'Data que não deu para entender';
      else if (v == null) motivo = 'Sem valor';
      else if (v === 0) motivo = 'Valor zerado';
      if (motivo) { ign.push({ linha: n, motivo: motivo, texto: resumo }); continue; }
      var cat = texto(pega(l, 'categoria')) || '(sem categoria)';
      lanc.push({
        linha: n, data: dt, mes: dt.slice(0, 7), bruto: v,
        categoria: cat, chave: norm(cat) || 'sem categoria',
        descricao: texto(pega(l, 'descricao')), contato: texto(pega(l, 'contato')),
        situacao: texto(pega(l, 'situacao')), sinal: temTipo ? sinalDoTipo(pega(l, 'tipo')) : null
      });
    }
    var regra, semTipo = 0;
    if (usarES) regra = 'entradaSaida';
    else if (temTipo) regra = 'tipo';
    else {
      var pos = lanc.some(function (x) { return x.bruto > 0; }), neg = lanc.some(function (x) { return x.bruto < 0; });
      regra = pos && neg ? 'veio' : 'natureza';
    }
    lanc.forEach(function (x) {
      if (regra === 'entradaSaida' || regra === 'veio') { x.valor = x.bruto; x.porNatureza = false; }
      else if (regra === 'tipo' && x.sinal) { x.valor = C.arred(Math.abs(x.bruto) * x.sinal); x.porNatureza = false; }
      else { x.valor = Math.abs(x.bruto); x.porNatureza = true; if (regra === 'tipo') semTipo++; }
    });
    return { lancamentos: lanc, ignoradas: ign, regra: regra, semTipo: semTipo, lidas: lanc.length + ign.length };
  }
  function textoRegra(proc) {
    if (!proc) return '';
    if (proc.regra === 'entradaSaida') return 'Sinal dos valores: pelas colunas Entrada e Saída (valor = entrada menos saída).';
    if (proc.regra === 'veio') return 'Sinal dos valores: usei como veio no relatório (o relatório já traz despesas negativas e receitas positivas).';
    if (proc.regra === 'tipo') {
      return 'Sinal dos valores: pela coluna Tipo (despesa, saída ou débito vira negativo).' +
        (proc.semTipo ? ' ' + proc.semTipo + (proc.semTipo === 1 ? ' linha tinha' : ' linhas tinham') + ' um tipo que não reconheci: o sinal delas veio da linha da DRE em que a categoria caiu.' : '');
    }
    return 'Sinal dos valores: o relatório só tem valores positivos e não tem coluna de Tipo. Então o sinal vem da linha da DRE em que a categoria caiu: receitas e receitas financeiras positivas, o resto negativo. Confira as ligações no passo 3.';
  }
  function resumoIgnoradas(ign) {
    var por = {};
    ign.forEach(function (x) { (por[x.motivo] = por[x.motivo] || []).push(x); });
    return Object.keys(por).map(function (m) { return { motivo: m, qtd: por[m].length, itens: por[m] }; })
      .sort(function (a, b) { return b.qtd - a.qtd; });
  }

  // ---------- modelo da DRE ----------
  var GRUPOS = ['receita', 'deducao', 'custo', 'despesa', 'financeiro', 'abaixo', 'fora'];
  var NOME_GRUPO = {
    receita: 'Receitas', deducao: 'Deduções (impostos sobre vendas)', custo: 'Custos', despesa: 'Despesas',
    financeiro: 'Resultado financeiro', abaixo: 'Abaixo do resultado (investimentos, empréstimos, retiradas)', fora: 'Fora da DRE'
  };
  var SUBTOTAIS = [
    { chave: 'rl', depoisDe: 'deducao', nome: 'Receita líquida' },
    { chave: 'lb', depoisDe: 'custo', nome: 'Lucro bruto' },
    { chave: 'ro', depoisDe: 'despesa', nome: 'Resultado operacional' },
    { chave: 'rliq', depoisDe: 'financeiro', nome: 'Resultado líquido' },
    { chave: 'gc', depoisDe: 'abaixo', nome: 'Geração de caixa' }
  ];
  var LINHAS_PADRAO = [
    { id: 'receita', grupo: 'receita', nome: 'Receita bruta de vendas e serviços' },
    { id: 'impostos', grupo: 'deducao', nome: 'Impostos sobre vendas' },
    { id: 'custo', grupo: 'custo', nome: 'Custo das mercadorias e serviços (CMV)' },
    { id: 'pessoal', grupo: 'despesa', nome: 'Despesas com pessoal' },
    { id: 'administrativas', grupo: 'despesa', nome: 'Despesas administrativas' },
    { id: 'comerciais', grupo: 'despesa', nome: 'Despesas comerciais e de marketing' },
    { id: 'ocupacao', grupo: 'despesa', nome: 'Despesas com ocupação' },
    { id: 'financeiro', grupo: 'financeiro', nome: 'Resultado financeiro: tarifas, juros, rendimentos' },
    { id: 'investimentos', grupo: 'abaixo', nome: 'Investimentos e empréstimos' },
    { id: 'retiradas', grupo: 'abaixo', nome: 'Retiradas dos sócios' },
    { id: 'fora', grupo: 'fora', nome: 'Fora da DRE: transferências entre contas, aplicações e resgates' }
  ];
  var LINHA_CLASSIFICAR = { id: CLASSIFICAR, grupo: 'classificar', nome: 'A classificar' };

  function modeloPadrao() {
    var sub = {};
    SUBTOTAIS.forEach(function (s) { sub[s.chave] = s.nome; });
    return { nome: 'DRE gerencial', linhas: copia(LINHAS_PADRAO), subtotais: sub };
  }
  function validarModelo(m) {
    if (!m || !Array.isArray(m.linhas)) return null;
    var vistos = {}, linhas = [];
    m.linhas.forEach(function (l) {
      if (!l || typeof l.id !== 'string' || !l.id || vistos[l.id] || l.id === CLASSIFICAR) return;
      if (GRUPOS.indexOf(l.grupo) < 0) return;
      vistos[l.id] = true;
      linhas.push({ id: l.id, grupo: l.grupo, nome: texto(l.nome).slice(0, 120) || 'Linha sem nome' });
    });
    if (!linhas.length) return null;
    var sub = {};
    SUBTOTAIS.forEach(function (s) { sub[s.chave] = (m.subtotais && texto(m.subtotais[s.chave]).slice(0, 80)) || s.nome; });
    return { nome: texto(m.nome).slice(0, 80) || 'DRE gerencial', linhas: linhas, subtotais: sub };
  }
  function acharLinha(modelo, id) {
    if (id === CLASSIFICAR) return LINHA_CLASSIFICAR;
    for (var i = 0; i < modelo.linhas.length; i++) if (modelo.linhas[i].id === id) return modelo.linhas[i];
    return null;
  }
  function linhasDoGrupo(modelo, grupo) { return modelo.linhas.filter(function (l) { return l.grupo === grupo; }); }
  function renomearLinha(modelo, id, nome) {
    var l = acharLinha(modelo, id);
    nome = texto(nome).slice(0, 120);
    if (!l || l.id === CLASSIFICAR || !nome) return false;
    l.nome = nome; return true;
  }
  function renomearSubtotal(modelo, chave, nome) {
    nome = texto(nome).slice(0, 80);
    if (!nome || !SUBTOTAIS.some(function (s) { return s.chave === chave; })) return false;
    modelo.subtotais[chave] = nome; return true;
  }
  function criarLinha(modelo, grupo, nome) {
    nome = texto(nome).slice(0, 120);
    if (GRUPOS.indexOf(grupo) < 0 || !nome) return null;
    var id = 'l' + C.id();
    var pos = -1;
    modelo.linhas.forEach(function (l, i) { if (l.grupo === grupo) pos = i; });
    if (pos < 0) {
      // grupo vazio: entra antes da primeira linha de um grupo que vem depois
      var ordem = GRUPOS.indexOf(grupo);
      pos = modelo.linhas.length - 1;
      for (var i = 0; i < modelo.linhas.length; i++) {
        if (GRUPOS.indexOf(modelo.linhas[i].grupo) > ordem) { pos = i - 1; break; }
      }
    }
    modelo.linhas.splice(pos + 1, 0, { id: id, grupo: grupo, nome: nome });
    return id;
  }
  // Exclui a linha; as categorias ligadas a ela voltam para "A classificar"
  function excluirLinha(cliente, id) {
    var m = cliente.modelo, antes = m.linhas.length;
    m.linhas = m.linhas.filter(function (l) { return l.id !== id; });
    if (m.linhas.length === antes) return 0;
    var n = 0;
    Object.keys(cliente.ligacoes || {}).forEach(function (k) {
      if (cliente.ligacoes[k].linha === id) { cliente.ligacoes[k].linha = CLASSIFICAR; n++; }
    });
    return n;
  }
  // Sobe (-1) ou desce (+1) dentro do mesmo grupo
  function moverLinha(modelo, id, delta) {
    var ls = modelo.linhas, i = -1;
    for (var k = 0; k < ls.length; k++) if (ls[k].id === id) i = k;
    if (i < 0) return false;
    var j = i + delta;
    while (j >= 0 && j < ls.length && ls[j].grupo !== ls[i].grupo) j += delta;
    if (j < 0 || j >= ls.length) return false;
    var t = ls[i]; ls[i] = ls[j]; ls[j] = t;
    return true;
  }

  // ---------- sugestão de linha para cada categoria ----------
  // Ordem importa: a primeira regra que bate vence.
  var REGRAS = [
    ['financeiro', ['tarifas?', 'juros', 'iof', 'rendimentos?', 'multas?', 'taxas? bancarias?', 'taxas? de cartao', 'taxas? do cartao', 'taxas? da maquininha', 'maquininha',
      'receitas? financeiras?', 'despesas? financeiras?', 'despesas? bancarias?', 'antecipacao de recebiveis', 'mdr']],
    ['fora', ['transferencias?', 'aplicacao', 'aplicacoes', 'resgates?', 'entre contas']],
    ['pessoal', ['pro labore', 'prolabore']],
    ['retiradas', ['distribuicao de lucros?', 'distribuicoes de lucros?', 'retiradas?', 'dividendos?', 'lucros distribuidos']],
    ['investimentos', ['emprestimos?', 'financiamentos?', 'equipamentos?', 'investimentos?', 'imobilizado', 'consorcios?']],
    ['impostos', ['impostos?', 'simples', '^das', 'iss', 'issqn', 'icms', 'pis', 'cofins', 'irpj', 'csll', 'tributos?', 'devolucao de vendas?', 'devolucoes de vendas?']],
    ['comerciais', ['marketing', 'publicidade', 'anuncios?', 'comissao', 'comissoes', 'brindes?', 'propaganda', 'trafego pago', 'impulsionamento']],
    ['custo', ['fornecedor', 'fornecedores', 'mercadorias?', 'cmv', 'compras?', 'materia prima', 'materias primas', 'insumos?', 'custos?', 'frete de compras?', 'lentes?', 'armacao', 'armacoes']],
    ['pessoal', ['salarios?', 'folha', 'fgts', 'inss', 'vales?', 'beneficios?', 'ferias', '13', '13o', 'decimo terceiro', 'rescisao', 'rescisoes', 'plano de saude', 'ordenados?']],
    ['ocupacao', ['aluguel', 'alugueis', 'condominio', 'energia', 'luz', 'agua', 'iptu', 'internet', 'telefone', 'telefonia']],
    ['administrativas', ['contabilidade', 'contador', 'honorarios?', 'software', 'sistemas?', 'material de escritorio', 'limpeza']],
    ['receita', ['receitas?', 'vendas?', 'servicos? prestados?', 'faturamento', 'recebimentos? de clientes?']]
  ].map(function (r) { return { linha: r[0], re: new RegExp('(^| )(' + r[1].join('|') + ')( |$)') }; });
  var GRUPO_PADRAO = {};
  LINHAS_PADRAO.forEach(function (l) { GRUPO_PADRAO[l.id] = l.grupo; });

  // Devolve o id da linha sugerida (ou 'a-classificar')
  function sugerirLinha(categoria, modelo) {
    var n = norm(categoria);
    if (!n) return CLASSIFICAR;
    for (var i = 0; i < modelo.linhas.length; i++) if (norm(modelo.linhas[i].nome) === n) return modelo.linhas[i].id;
    for (var r = 0; r < REGRAS.length; r++) {
      if (!REGRAS[r].re.test(n)) continue;
      var id = REGRAS[r].linha;
      if (acharLinha(modelo, id)) return id;
      var mesmo = linhasDoGrupo(modelo, GRUPO_PADRAO[id]);
      return mesmo.length ? mesmo[0].id : CLASSIFICAR;
    }
    return CLASSIFICAR;
  }

  // Sinal quando o relatório não diz: receitas positivas, o resto negativo.
  // Em resultado financeiro, investimentos, fora da DRE e a classificar, o nome da categoria decide.
  var PALAVRAS_ENTRADA = /(^| )(receitas?|rendimentos?|recebid[oa]s?|recebimentos?|resgates?|entradas?|vendas?|captacao|juros recebidos|juros ativos|emprestimo recebido|descontos obtidos)( |$)/;
  function sinalNatureza(linha, categoria) {
    if (!linha) return -1;
    if (linha.grupo === 'receita') return 1;
    if (linha.grupo === 'financeiro' || linha.grupo === 'abaixo' || linha.grupo === 'fora' || linha.grupo === 'classificar') {
      if (PALAVRAS_ENTRADA.test(norm(linha.nome)) && linha.id !== 'financeiro') return 1;
      return PALAVRAS_ENTRADA.test(norm(categoria)) ? 1 : -1;
    }
    return -1;
  }
  function valorFinal(lanc, linha) {
    return lanc.porNatureza ? C.arred(Math.abs(lanc.valor) * sinalNatureza(linha, lanc.categoria)) : lanc.valor;
  }

  // Lista as categorias do arquivo com a linha de cada uma
  // status: 'confirmada' | 'sugestao' | 'sem-regra'; nova: categoria que o cliente ainda não tinha
  function classificarCategorias(lancamentos, cliente) {
    var lig = cliente.ligacoes || {}, vistas = cliente.vistas || {};
    var temHistorico = Object.keys(lig).length > 0 || Object.keys(vistas).length > 0;
    var por = {}, ordem = [];
    lancamentos.forEach(function (x) {
      if (!por[x.chave]) { por[x.chave] = { chave: x.chave, nome: x.categoria, qtd: 0, lanc: [] }; ordem.push(x.chave); }
      por[x.chave].qtd++; por[x.chave].lanc.push(x);
    });
    var mapa = {};
    var lista = ordem.map(function (k) {
      var c = por[k], linha, status;
      var conf = lig[k] && acharLinha(cliente.modelo, lig[k].linha);
      if (conf) { linha = conf.id; status = 'confirmada'; }
      else { linha = sugerirLinha(c.nome, cliente.modelo); status = linha === CLASSIFICAR ? 'sem-regra' : 'sugestao'; }
      mapa[k] = linha;
      var ln = acharLinha(cliente.modelo, linha);
      var total = C.arred(c.lanc.reduce(function (s, x) { return s + valorFinal(x, ln); }, 0));
      return { chave: k, nome: c.nome, qtd: c.qtd, total: total, linha: linha, status: status, nova: temHistorico && !lig[k] && !vistas[k] };
    });
    lista.sort(function (a, b) { return Math.abs(b.total) - Math.abs(a.total) || (a.nome < b.nome ? -1 : 1); });
    return { lista: lista, mapa: mapa };
  }
  function ligar(cliente, chave, nome, linha) {
    cliente.ligacoes = cliente.ligacoes || {};
    cliente.ligacoes[chave] = { linha: linha, nome: nome };
  }
  // Guarda as categorias já vistas, para destacar só as que forem novas no mês seguinte
  function marcarVistas(cliente, lista) {
    cliente.vistas = cliente.vistas || {};
    lista.forEach(function (c) { cliente.vistas[c.chave] = true; });
  }
  // Confirma as sugestões (não confirma "A classificar"). Devolve quantas.
  function confirmarSugestoes(cliente, lista) {
    var n = 0;
    marcarVistas(cliente, lista);
    lista.forEach(function (c) { if (c.status === 'sugestao') { ligar(cliente, c.chave, c.nome, c.linha); n++; } });
    return n;
  }

  // ---------- meses ----------
  function mesSeguinte(mes) {
    var p = mes.split('-'), a = +p[0], m = +p[1] + 1;
    if (m === 13) { m = 1; a++; }
    return a + '-' + (m < 10 ? '0' : '') + m;
  }
  // Todos os meses do primeiro ao último lançamento, sem pular nenhum
  function mesesDe(lancamentos) {
    var ms = lancamentos.map(function (x) { return x.mes; }).sort();
    if (!ms.length) return [];
    var out = [ms[0]], fim = ms[ms.length - 1], guarda = 0;
    while (out[out.length - 1] < fim && guarda++ < 600) out.push(mesSeguinte(out[out.length - 1]));
    return out;
  }
  function janelaMeses(todos, fim, qtd) {
    var i = todos.indexOf(fim);
    if (i < 0) i = todos.length - 1;
    qtd = Math.max(1, qtd || 1);
    return todos.slice(Math.max(0, i - qtd + 1), i + 1);
  }

  // ---------- cálculo da DRE ----------
  function zeros(n) { var a = []; for (var i = 0; i < n; i++) a.push(0); return a; }
  function somaLista(a) { return C.arred(a.reduce(function (s, x) { return s + x; }, 0)); }
  function calcular(lancamentos, modelo, mapa, opcoes) {
    opcoes = opcoes || {};
    var meses = opcoes.meses || mesesDe(lancamentos).slice(-12);
    var n = meses.length, idx = {};
    meses.forEach(function (m, i) { idx[m] = i; });
    var todasLinhas = modelo.linhas.concat([LINHA_CLASSIFICAR]);
    var acum = {};
    todasLinhas.forEach(function (l) { acum[l.id] = { valores: zeros(n), lanc: [] }; });
    lancamentos.forEach(function (x) {
      var k = idx[x.mes];
      if (k == null) return;
      var id = mapa[x.chave];
      var ln = acharLinha(modelo, id);
      if (!ln) { ln = LINHA_CLASSIFICAR; id = CLASSIFICAR; }
      var v = valorFinal(x, ln);
      acum[id].valores[k] += v;
      acum[id].lanc.push({ linha: x.linha, data: x.data, mes: x.mes, categoria: x.categoria, descricao: x.descricao, contato: x.contato, situacao: x.situacao, valor: v, linhaId: id });
    });
    todasLinhas.forEach(function (l) { acum[l.id].valores = acum[l.id].valores.map(C.arred); });
    var g = {};
    GRUPOS.forEach(function (gr) { g[gr] = zeros(n); });
    modelo.linhas.forEach(function (l) { acum[l.id].valores.forEach(function (v, i) { g[l.grupo][i] += v; }); });
    GRUPOS.forEach(function (gr) { g[gr] = g[gr].map(C.arred); });
    function mais(a, b) { return a.map(function (v, i) { return C.arred(v + b[i]); }); }
    var sub = {};
    sub.rl = mais(g.receita, g.deducao);
    sub.lb = mais(sub.rl, g.custo);
    sub.ro = mais(sub.lb, g.despesa);
    sub.rliq = mais(sub.ro, g.financeiro);
    sub.gc = mais(sub.rliq, g.abaixo);
    var rb = g.receita, totalReceita = somaLista(rb);
    function pctDe(v) { return totalReceita > 0 ? v / totalReceita : null; }
    function margens(vals) { return vals.map(function (v, i) { return rb[i] > 0 ? v / rb[i] : null; }); }
    function linhaRes(l) {
      var vals = acum[l.id].valores, tot = somaLista(vals);
      return { tipo: 'linha', id: l.id, nome: l.nome, grupo: l.grupo, valores: vals, total: tot, pct: pctDe(tot), qtd: acum[l.id].lanc.length };
    }
    var linhas = [];
    ['receita', 'deducao', 'custo', 'despesa', 'financeiro', 'abaixo'].forEach(function (gr) {
      linhasDoGrupo(modelo, gr).forEach(function (l) { linhas.push(linhaRes(l)); });
      SUBTOTAIS.forEach(function (s) {
        if (s.depoisDe !== gr) return;
        var tot = somaLista(sub[s.chave]);
        linhas.push({ tipo: 'subtotal', id: s.chave, nome: modelo.subtotais[s.chave] || s.nome, valores: sub[s.chave], total: tot, pct: pctDe(tot), margens: margens(sub[s.chave]) });
      });
    });
    var aParte = linhasDoGrupo(modelo, 'fora').map(linhaRes).concat([linhaRes(LINHA_CLASSIFICAR)]);
    var lancPorLinha = {};
    todasLinhas.forEach(function (l) { lancPorLinha[l.id] = acum[l.id].lanc; });
    var desp = rb.map(function (v, i) { return C.arred(v - sub.rliq[i]); });
    var cl = linhaRes(LINHA_CLASSIFICAR);
    return {
      nomeRliq: modelo.subtotais.rliq, nomeGc: modelo.subtotais.gc,
      meses: meses, linhas: linhas, aParte: aParte, grupos: g, sub: sub, receitaBruta: rb, despesas: desp,
      totalReceita: totalReceita, lancPorLinha: lancPorLinha,
      aClassificar: { total: cl.total, qtd: cl.qtd, absoluto: C.arred(acum[CLASSIFICAR].lanc.reduce(function (s, x) { return s + Math.abs(x.valor); }, 0)) }
    };
  }

  // ---------- cartões, maiores saídas e pontos de atenção ----------
  function variacao(cur, ant, mesAnt) {
    if (ant == null) return 'sem mês anterior para comparar';
    if (ant <= 0 || cur * ant < 0) return 'em ' + C.mesCurto(mesAnt) + ': ' + C.brl(ant);
    var p = (cur - ant) / Math.abs(ant);
    return (p >= 0 ? '+' : '') + C.pct(p) + ' contra ' + C.mesCurto(mesAnt);
  }
  function cartoes(res) {
    var L = res.meses.length - 1;
    if (L < 0) return [];
    var tem = L > 0, mAnt = tem ? res.meses[L - 1] : null;
    var rb = res.receitaBruta, rl = res.sub.rliq, gc = res.sub.gc;
    var ml = rb[L] > 0 ? rl[L] / rb[L] : null, mlAnt = tem && rb[L - 1] > 0 ? rl[L - 1] / rb[L - 1] : null;
    var varMl = 'sem mês anterior para comparar';
    if (ml != null && mlAnt != null) {
      var d = (ml - mlAnt) * 100;
      varMl = (d >= 0 ? '+' : '') + C.num(d, 1) + ' pontos contra ' + C.mesCurto(mAnt);
    } else if (tem) varMl = 'sem receita para comparar';
    return [
      { rotulo: 'Receita bruta', valor: rb[L], texto: C.brl(rb[L]), variacao: variacao(rb[L], tem ? rb[L - 1] : null, mAnt), classe: '' },
      { rotulo: res.nomeRliq || 'Resultado líquido', valor: rl[L], texto: C.brl(rl[L]), variacao: variacao(rl[L], tem ? rl[L - 1] : null, mAnt), classe: rl[L] >= 0 ? 'bom' : 'ruim' },
      { rotulo: 'Margem líquida', valor: ml, texto: ml == null ? 'sem receita' : C.pct(ml), variacao: varMl, classe: ml == null ? '' : ml >= 0 ? 'bom' : 'ruim' },
      { rotulo: res.nomeGc || 'Geração de caixa', valor: gc[L], texto: C.brl(gc[L]), variacao: variacao(gc[L], tem ? gc[L - 1] : null, mAnt), classe: gc[L] >= 0 ? 'bom' : 'ruim' }
    ];
  }
  // As maiores saídas do período (linhas com total negativo, sem "fora" nem "a classificar")
  function maioresSaidas(res, qtd) {
    return res.linhas.filter(function (l) { return l.tipo === 'linha' && l.total < 0; })
      .sort(function (a, b) { return a.total - b.total; })
      .slice(0, qtd || 8)
      .map(function (l) { return { nome: l.nome, valor: Math.abs(l.total), texto: C.brl(Math.abs(l.total)) }; });
  }
  function pontosAtencao(res, opcoes) {
    opcoes = opcoes || {};
    var p = [], L = res.meses.length - 1;
    if (L < 0) return p;
    var mes = C.mesCurto(res.meses[L]);
    if (!opcoes.semClassificar && res.aClassificar.qtd > 0) {
      p.push({ tipo: 'ruim', texto: 'Há ' + C.brl(res.aClassificar.absoluto) + ' em ' + res.aClassificar.qtd + (res.aClassificar.qtd === 1 ? ' lançamento' : ' lançamentos') + ' ainda a classificar. Eles não entram no resultado até você escolher a linha certa no passo 3.' });
    }
    var rb = res.receitaBruta, rl = res.sub.rliq, gc = res.sub.gc;
    if (rl[L] < 0) p.push({ tipo: 'ruim', texto: mes + ' fechou com prejuízo de ' + C.brl(Math.abs(rl[L])) + '.' });
    if (gc[L] < 0) p.push({ tipo: 'ruim', texto: 'Em ' + mes + ' saiu mais dinheiro do que entrou: a geração de caixa ficou em ' + C.brl(gc[L]) + ' (contando investimentos, empréstimos e retiradas dos sócios).' });
    if (L === 0) {
      p.push({ tipo: 'info', texto: 'Só há um mês no período. Com dois meses ou mais, o painel compara um mês com o outro.' });
      return p;
    }
    var mAnt = C.mesCurto(res.meses[L - 1]);
    if (rb[L - 1] > 0 && rb[L] > 0) {
      var d = (rl[L] / rb[L] - rl[L - 1] / rb[L - 1]) * 100;
      if (d <= -3) p.push({ tipo: 'ruim', texto: 'A margem líquida caiu ' + C.num(-d, 1) + ' pontos: de ' + C.pct(rl[L - 1] / rb[L - 1]) + ' em ' + mAnt + ' para ' + C.pct(rl[L] / rb[L]) + ' em ' + mes + '.' });
      if (d >= 3) p.push({ tipo: 'bom', texto: 'A margem líquida subiu ' + C.num(d, 1) + ' pontos: de ' + C.pct(rl[L - 1] / rb[L - 1]) + ' em ' + mAnt + ' para ' + C.pct(rl[L] / rb[L]) + ' em ' + mes + '.' });
      var vr = (rb[L] - rb[L - 1]) / rb[L - 1];
      if (vr <= -0.1) p.push({ tipo: 'ruim', texto: 'A receita bruta caiu ' + C.pct(-vr) + ' contra ' + mAnt + ': de ' + C.brl(rb[L - 1]) + ' para ' + C.brl(rb[L]) + '.' });
      if (vr >= 0.1) p.push({ tipo: 'bom', texto: 'A receita bruta cresceu ' + C.pct(vr) + ' contra ' + mAnt + ': de ' + C.brl(rb[L - 1]) + ' para ' + C.brl(rb[L]) + '.' });
    }
    var minimo = Math.max(100, (rb[L] || 0) * 0.005);
    var subiram = res.linhas.filter(function (l) {
      if (l.tipo !== 'linha' || l.grupo === 'receita') return false;
      var ant = -l.valores[L - 1], cur = -l.valores[L];
      return ant > 0 && cur > ant * 1.2 && cur - ant >= minimo;
    }).sort(function (a, b) { return (a.valores[L] - a.valores[L - 1]) - (b.valores[L] - b.valores[L - 1]); }).slice(0, 4);
    subiram.forEach(function (l) {
      var ant = -l.valores[L - 1], cur = -l.valores[L];
      p.push({ tipo: 'ruim', texto: l.nome + ': subiu ' + C.pct((cur - ant) / ant, 0) + ' em ' + mes + ' (de ' + C.brl(ant) + ' para ' + C.brl(cur) + ').' });
    });
    if (!p.length) p.push({ tipo: 'bom', texto: 'Nenhum ponto de atenção pelas regras simples deste painel.' });
    return p;
  }

  // ---------- Excel ----------
  function abasExcel(res, cliente) {
    var cab = ['Linha da DRE'].concat(res.meses.map(C.mesCurto), ['Total', '% da receita']);
    var n = res.meses.length;
    var linhas = [['DRE gerencial: ' + cliente.nome], cab];
    function lin(nome, l) { return [nome].concat(l.valores, [l.total, l.pct == null ? '' : l.pct]); }
    res.linhas.forEach(function (l) { linhas.push(lin(l.tipo === 'subtotal' ? '= ' + l.nome : '   ' + l.nome, l)); });
    linhas.push([]);
    linhas.push(['Fora do resultado']);
    res.aParte.forEach(function (l) { linhas.push(lin('   ' + l.nome, l)); });
    var moeda = []; for (var i = 1; i <= n + 1; i++) moeda.push(i);
    var lanc = [['Data', 'Mês', 'Categoria do sistema', 'Linha da DRE', 'Descrição', 'Cliente ou fornecedor', 'Situação', 'Valor', 'Linha no arquivo']];
    var nomes = {};
    res.linhas.concat(res.aParte).forEach(function (l) { nomes[l.id] = l.nome; });
    var todos = [];
    Object.keys(res.lancPorLinha).forEach(function (id) { todos = todos.concat(res.lancPorLinha[id]); });
    todos.sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : a.linha - b.linha; });
    todos.forEach(function (x) {
      lanc.push([C.dataBR(x.data), C.mesCurto(x.mes), x.categoria, nomes[x.linhaId] || 'A classificar', x.descricao, x.contato, x.situacao, x.valor, x.linha]);
    });
    return [
      { nome: 'DRE', linhas: linhas, larguras: [52].concat(zeros(n + 1).map(function () { return 14; }), [12]), formatoMoeda: moeda, formatoPct: [n + 2] },
      { nome: 'Lançamentos classificados', linhas: lanc, larguras: [11, 8, 30, 40, 40, 28, 14, 14, 10], formatoMoeda: [7] }
    ];
  }

  // ---------- painel do cliente (HTML sem JavaScript) ----------
  function corValida(c, padrao) { return /^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c) : padrao; }
  function luminancia(hex) {
    var r = parseInt(hex.slice(1, 3), 16) / 255, g = parseInt(hex.slice(3, 5), 16) / 255, b = parseInt(hex.slice(5, 7), 16) / 255;
    function f(x) { return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  function logoValido(l) { return typeof l === 'string' && /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+\/=]+$/.test(l) ? l : ''; }

  function escala(faixa) {
    var bruto = faixa / 5, pot = Math.pow(10, Math.floor(Math.log10(bruto)));
    var f = bruto / pot;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pot;
  }
  function curto(v) {
    var a = Math.abs(v);
    if (a >= 1e6) return C.num(v / 1e6, a % 1e6 ? 1 : 0) + ' mi';
    if (a >= 1e3) return C.num(v / 1e3, a % 1e3 ? 1 : 0) + ' mil';
    return C.num(v, 0);
  }
  // Gráfico de barras agrupadas em SVG puro (para o painel, que não tem JavaScript)
  function svgBarras(dados, titulo) {
    var L = 640, A = 250, mE = 66, mD = 8, mT = 12, mB = 30;
    var todos = [];
    dados.series.forEach(function (s) { todos = todos.concat(s.valores); });
    var max = Math.max.apply(null, todos.concat([0])), min = Math.min.apply(null, todos.concat([0]));
    if (max === min) max = min + 1;
    var passo = escala(max - min);
    max = Math.ceil(max / passo) * passo; min = Math.floor(min / passo) * passo;
    function y(v) { return (mT + (max - v) / (max - min) * (A - mT - mB)).toFixed(1); }
    var n = dados.categorias.length, largGrupo = (L - mE - mD) / Math.max(n, 1);
    var ns = dados.series.length, largBarra = Math.min(34, (largGrupo * 0.72) / ns);
    var s = '<svg viewBox="0 0 ' + L + ' ' + A + '" class="p-grafico" role="img" aria-label="' + esc(titulo) + '" xmlns="http://www.w3.org/2000/svg">';
    for (var v = min; v <= max + 1e-9; v += passo) {
      s += '<line x1="' + mE + '" x2="' + (L - mD) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="' + (Math.abs(v) < 1e-9 ? '#AEB9CA' : '#E6EAF1') + '" stroke-width="1"/>';
      s += '<text x="' + (mE - 8) + '" y="' + (+y(v) + 4) + '" font-size="11" fill="#6B7A92" text-anchor="end">' + esc(curto(v)) + '</text>';
    }
    dados.categorias.forEach(function (cat, i) {
      var x0 = mE + i * largGrupo + (largGrupo - largBarra * ns) / 2;
      dados.series.forEach(function (serie, j) {
        var val = serie.valores[i] || 0, y1 = +y(Math.max(val, 0)), y2 = +y(Math.min(val, 0));
        s += '<rect x="' + (x0 + j * largBarra).toFixed(1) + '" y="' + y1 + '" width="' + Math.max(largBarra - 2, 1).toFixed(1) + '" height="' + Math.max(y2 - y1, 0.5).toFixed(1) + '" rx="3" fill="' + serie.cor + '"><title>' + esc(serie.nome + ' ' + cat + ': ' + C.brl(val)) + '</title></rect>';
      });
      s += '<text x="' + (mE + i * largGrupo + largGrupo / 2).toFixed(1) + '" y="' + (A - 10) + '" font-size="11" fill="#6B7A92" text-anchor="middle">' + esc(cat) + '</text>';
    });
    return s + '</svg>';
  }
  function dadosGrafico(res, cores) {
    return {
      categorias: res.meses.map(C.mesCurto),
      series: [
        { nome: 'Receita', cor: cores[0], valores: res.receitaBruta },
        { nome: 'Despesas', cor: cores[1], valores: res.despesas },
        { nome: res.nomeRliq || 'Resultado', cor: cores[2], valores: res.sub.rliq }
      ]
    };
  }

  var CSS_PAINEL = [
    '.p-painel{max-width:1040px;margin:0 auto;padding:0 0 30px;background:#F3F4F6;color:#2A3A55;font-family:"Segoe UI",system-ui,-apple-system,Arial,sans-serif;font-size:15px;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}',
    '.p-painel *{box-sizing:border-box}',
    '.p-painel h1,.p-painel h2,.p-painel p,.p-painel ul{margin:0;padding:0}',
    '.p-topo{background:var(--p1);color:var(--p1t);padding:22px 24px;display:flex;gap:16px;align-items:center;flex-wrap:wrap}',
    '.p-topo img{max-height:60px;max-width:170px;background:#fff;border-radius:8px;padding:4px;display:block}',
    '.p-topo h1{font-size:24px;line-height:1.2}',
    '.p-topo p{opacity:.88;font-size:14px;margin-top:3px}',
    '.p-faixa{height:6px;background:var(--p2)}',
    '.p-corpo{padding:18px 20px}',
    '.p-cartoes{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px}',
    '.p-cartao{background:#fff;border:1px solid #E1E6EE;border-top:4px solid var(--p2);border-radius:12px;padding:12px 14px}',
    '.p-cartao small{display:block;color:#6B7A92;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px}',
    '.p-cartao b{display:block;font-size:22px;color:#0B1B33;margin-top:3px;font-variant-numeric:tabular-nums}',
    '.p-cartao span{font-size:12.5px;color:#6B7A92}',
    '.p-cartao.bom b{color:#1F8A4C}.p-cartao.ruim b{color:#C2410C}',
    '.p-bloco{background:#fff;border:1px solid #E1E6EE;border-radius:12px;padding:16px;margin-top:14px;break-inside:avoid;page-break-inside:avoid}',
    '.p-bloco h2{font-size:16px;color:var(--p1h);margin-bottom:10px}',
    '.p-duas{display:grid;grid-template-columns:1fr 1fr;gap:14px}',
    '.p-duas .p-bloco{margin-top:14px}',
    '.p-grafico{width:100%;height:auto;display:block}',
    '.p-legenda{display:flex;gap:14px;flex-wrap:wrap;font-size:13px;margin-bottom:6px}',
    '.p-legenda i{display:inline-block;width:11px;height:11px;border-radius:3px;margin-right:5px;vertical-align:-1px}',
    '.p-bh{display:grid;grid-template-columns:minmax(100px,190px) 1fr auto;gap:10px;align-items:center;font-size:13.5px;margin-bottom:7px}',
    '.p-bh-nome{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.p-bh-trilho{background:#EEF1F6;border-radius:6px;height:14px;overflow:hidden}',
    '.p-bh-trilho span{display:block;height:100%;border-radius:6px;background:var(--p2)}',
    '.p-bh-valor{font-variant-numeric:tabular-nums;font-weight:600;min-width:90px;text-align:right}',
    '.p-rolagem{overflow-x:auto;border:1px solid #E1E6EE;border-radius:10px}',
    '.p-painel table{border-collapse:collapse;width:100%;font-size:13.5px;background:#fff}',
    '.p-painel th,.p-painel td{padding:7px 10px;border-bottom:1px solid #E1E6EE;text-align:left;white-space:nowrap}',
    '.p-painel th{background:#F6F8FB;color:#0B1B33;font-size:12px;text-transform:uppercase;letter-spacing:.4px}',
    '.p-painel td.n,.p-painel th.n{text-align:right;font-variant-numeric:tabular-nums}',
    '.p-painel td.neg{color:#C2410C}',
    '.p-painel tr.p-sub td{font-weight:800;background:#F6F8FB;color:#0B1B33}',
    '.p-painel tr.p-sub td:first-child{border-left:4px solid var(--p2)}',
    '.p-painel tr.p-lin td:first-child{padding-left:22px}',
    '.p-painel tr.p-parte td{color:#6B7A92}',
    '.p-pontos{list-style:none}',
    '.p-pontos li{border-left:4px solid #5E9BD6;background:#EEF5FC;border-radius:8px;padding:9px 12px;margin-bottom:8px;font-size:14px}',
    '.p-pontos li.ruim{border-color:#C2410C;background:#FDECE4}',
    '.p-pontos li.bom{border-color:#1F8A4C;background:#E5F4EA}',
    '.p-rodape{color:#6B7A92;font-size:12.5px;text-align:center;margin-top:18px;padding:0 16px}',
    '@media (max-width:700px){.p-duas{grid-template-columns:1fr}.p-corpo{padding:12px}.p-topo{padding:16px}.p-topo h1{font-size:20px}.p-bh{grid-template-columns:96px 1fr auto}.p-bh-valor{min-width:78px}}',
    '@media print{.p-painel{background:#fff;max-width:none}.p-duas{grid-template-columns:1fr 1fr}.p-rolagem{overflow:visible}.p-painel th,.p-painel td{padding:4px 6px;font-size:11px}}'
  ].join('\n');

  // Devolve {titulo, css, corpo}. opcoes: {bpo, regime, hoje (AAAA-MM-DD)}
  function painelPartes(res, cliente, opcoes) {
    opcoes = opcoes || {};
    var cor1 = corValida(cliente.cor1, '#0B1B33'), cor2 = corValida(cliente.cor2, '#5E9BD6');
    var lum1 = luminancia(cor1);
    var texto1 = lum1 > 0.5 ? '#0B1B33' : '#FFFFFF';
    var titulo1 = lum1 < 0.35 ? cor1 : '#0B1B33';
    var meses = res.meses, ult = meses[meses.length - 1];
    var nome = texto(cliente.nome) || 'Cliente';
    var titulo = 'Painel financeiro | ' + nome + ' | ' + (ult ? C.mesLongo(ult) : '');
    var periodo = meses.length > 1 ? 'De ' + C.mesLongo(meses[0]) + ' a ' + C.mesLongo(ult) : (ult ? 'Mês de ' + C.mesLongo(ult) : '');
    var h = '<div class="p-painel" style="--p1:' + cor1 + ';--p2:' + cor2 + ';--p1t:' + texto1 + ';--p1h:' + titulo1 + '">';
    var logo = logoValido(cliente.logo);
    h += '<header class="p-topo">' + (logo ? '<img src="' + logo + '" alt="Logo ' + esc(nome) + '">' : '') +
      '<div><h1>' + esc(nome) + '</h1><p>Painel financeiro: ' + esc(periodo) + '</p></div></header><div class="p-faixa"></div>';
    h += '<div class="p-corpo">';
    // cartões
    h += '<div class="p-cartoes">' + cartoes(res).map(function (c) {
      return '<div class="p-cartao ' + c.classe + '"><small>' + esc(c.rotulo) + ' (' + esc(C.mesCurto(ult)) + ')</small><b>' + esc(c.texto) + '</b><span>' + esc(c.variacao) + '</span></div>';
    }).join('') + '</div>';
    // gráficos
    var cores = [cor2, '#C9824A', lum1 > 0.8 ? '#0B1B33' : cor1];
    var dg = dadosGrafico(res, cores);
    var leg = '<div class="p-legenda">' + dg.series.map(function (s) { return '<span><i style="background:' + s.cor + '"></i>' + esc(s.nome) + '</span>'; }).join('') + '</div>';
    var saidas = maioresSaidas(res, 8), maxS = Math.max.apply(null, saidas.map(function (s) { return s.valor; }).concat([1]));
    h += '<div class="p-duas">';
    h += '<section class="p-bloco"><h2>Receita, despesas e resultado por mês</h2>' + leg + svgBarras(dg, 'Receita, despesas e resultado por mês') + '</section>';
    h += '<section class="p-bloco"><h2>Para onde vai o dinheiro</h2>' + (saidas.length ? saidas.map(function (s) {
      return '<div class="p-bh"><span class="p-bh-nome" title="' + esc(s.nome) + '">' + esc(s.nome) + '</span><span class="p-bh-trilho"><span style="width:' + (s.valor / maxS * 100).toFixed(1) + '%"></span></span><span class="p-bh-valor">' + esc(s.texto) + '</span></div>';
    }).join('') : '<p>Sem saídas no período.</p>') + '<p style="font-size:12.5px;color:#6B7A92;margin-top:6px">Soma do período mostrado.</p></section>';
    h += '</div>';
    // pontos de atenção
    h += '<section class="p-bloco"><h2>Pontos de atenção</h2><ul class="p-pontos">' + pontosAtencao(res, { semClassificar: true }).map(function (p) {
      return '<li class="' + p.tipo + '">' + esc(p.texto) + '</li>';
    }).join('') + '</ul></section>';
    // DRE
    h += '<section class="p-bloco"><h2>' + esc(cliente.modelo && cliente.modelo.nome || 'DRE gerencial') + '</h2>' + tabelaHTML(res, 'p') + '</section>';
    var regimeTxt = opcoes.regime === 'competencia' ? 'por competência (pela data em que a venda ou a despesa aconteceu)' :
      opcoes.regime === 'caixa' ? 'de caixa (pela data em que o dinheiro entrou ou saiu)' : '';
    var hoje = opcoes.hoje ? C.dataBR(opcoes.hoje) : '';
    h += '</div><p class="p-rodape">' +
      (texto(opcoes.bpo) ? 'Preparado por ' + esc(opcoes.bpo) : 'Preparado pelo BPO financeiro') + (hoje ? ' em ' + esc(hoje) : '') + '. ' +
      'Valores do sistema financeiro da empresa' + (regimeTxt ? ', DRE ' + esc(regimeTxt) : '') + '. Percentuais sobre a receita bruta.</p>';
    h += '</div>';
    return { titulo: titulo, css: CSS_PAINEL, corpo: h };
  }
  // Tabela da DRE em HTML. prefixo 'p' (painel) usa classes p-sub, p-lin, p-parte.
  function tabelaHTML(res, prefixo) {
    var cl = prefixo ? function (c) { return prefixo + '-' + c; } : function (c) { return c; };
    function celulas(l) {
      return l.valores.map(function (v) { return '<td class="n' + (v < 0 ? ' neg' : '') + '">' + esc(C.brl(v)) + '</td>'; }).join('') +
        '<td class="n' + (l.total < 0 ? ' neg' : '') + '"><b>' + esc(C.brl(l.total)) + '</b></td><td class="n">' + esc(l.pct == null ? '' : C.pct(l.pct)) + '</td>';
    }
    var t = '<div class="' + cl('rolagem') + '"><table><thead><tr><th>Linha</th>' + res.meses.map(function (m) { return '<th class="n">' + esc(C.mesCurto(m)) + '</th>'; }).join('') +
      '<th class="n">Total</th><th class="n">% receita</th></tr></thead><tbody>';
    res.linhas.forEach(function (l) {
      t += '<tr class="' + (l.tipo === 'subtotal' ? cl('sub') : cl('lin')) + '"><td>' + esc(l.nome) + '</td>' + celulas(l) + '</tr>';
    });
    var parte = res.aParte.filter(function (l) { return l.qtd > 0; });
    if (parte.length) {
      t += '<tr class="' + cl('parte') + '"><td colspan="' + (res.meses.length + 3) + '"><b>Fora do resultado</b></td></tr>';
      parte.forEach(function (l) { t += '<tr class="' + cl('parte') + ' ' + cl('lin') + '"><td>' + esc(l.nome) + '</td>' + celulas(l) + '</tr>'; });
    }
    return t + '</tbody></table></div>';
  }
  function gerarPainel(res, cliente, opcoes) {
    var p = painelPartes(res, cliente, opcoes);
    return '<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
      '<title>' + esc(p.titulo) + '</title>\n<style>\nhtml,body{margin:0;padding:0;background:#F3F4F6}\n@media print{html,body{background:#fff}@page{margin:10mm}}\n' + p.css + '\n</style>\n</head>\n<body>\n' + p.corpo + '\n</body>\n</html>\n';
  }

  // ---------- estado guardado ----------
  function novoCliente(nome, cor1, cor2, logo) {
    return { id: 'c' + C.id(), nome: texto(nome).slice(0, 80) || 'Cliente', cor1: corValida(cor1, '#0B1B33'), cor2: corValida(cor2, '#5E9BD6'), logo: logoValido(logo), modelo: modeloPadrao(), ligacoes: {}, vistas: {}, mapeamentos: {} };
  }
  function estadoVazio() { return { tipo: 'ferramentas-bpo:dre', versao: 1, clientes: [], clienteAtual: null, config: { bpo: '' } }; }
  function carregarEstado(obj) {
    var e = estadoVazio();
    if (!obj || typeof obj !== 'object' || !Array.isArray(obj.clientes)) return e;
    obj.clientes.forEach(function (c) {
      if (!c || typeof c !== 'object') return;
      var n = novoCliente(c.nome, c.cor1, c.cor2, c.logo);
      if (typeof c.id === 'string' && c.id) n.id = c.id;
      n.modelo = validarModelo(c.modelo) || modeloPadrao();
      if (c.ligacoes && typeof c.ligacoes === 'object') {
        Object.keys(c.ligacoes).forEach(function (k) {
          var l = c.ligacoes[k];
          if (l && typeof l.linha === 'string') n.ligacoes[k] = { linha: l.linha, nome: texto(l.nome) || k };
        });
      }
      if (c.mapeamentos && typeof c.mapeamentos === 'object') n.mapeamentos = c.mapeamentos;
      if (c.vistas && typeof c.vistas === 'object') Object.keys(c.vistas).forEach(function (k) { n.vistas[k] = true; });
      e.clientes.push(n);
    });
    e.clienteAtual = e.clientes.some(function (c) { return c.id === obj.clienteAtual; }) ? obj.clienteAtual : (e.clientes[0] ? e.clientes[0].id : null);
    if (obj.config && typeof obj.config === 'object') e.config.bpo = texto(obj.config.bpo).slice(0, 80);
    return e;
  }
  function ehBackup(obj) { return !!obj && typeof obj === 'object' && Array.isArray(obj.clientes); }
  // Lembra as colunas escolhidas para um relatório com esse cabeçalho
  function lembrarColunas(cliente, cabecalho, escolha, soPago) {
    cliente.mapeamentos = cliente.mapeamentos || {};
    cliente.mapeamentos[assinatura(cabecalho)] = { escolha: copia(escolha), soPago: soPago !== false };
  }
  function colunasLembradas(cliente, cabecalho) {
    var m = cliente && cliente.mapeamentos && cliente.mapeamentos[assinatura(cabecalho)];
    if (!m || !m.escolha) return null;
    var ok = CAMPOS.every(function (c) { var v = m.escolha[c.chave]; return typeof v === 'number' && v >= -1 && v < cabecalho.length; });
    return ok ? { escolha: copia(m.escolha), soPago: m.soPago !== false } : null;
  }
  // Arquivo de modelo para levar a outro cliente
  function exportarModelo(cliente) {
    return { tipo: 'ferramentas-bpo:modelo-dre', versao: 1, origem: cliente.nome, modelo: copia(cliente.modelo), ligacoes: copia(cliente.ligacoes || {}) };
  }
  // Aplica um modelo (de arquivo ou de outro cliente). comLigacoes: copia também as ligações de categorias.
  function aplicarModelo(cliente, dados, comLigacoes) {
    var m = validarModelo(dados && dados.modelo);
    if (!m) return false;
    cliente.modelo = m;
    if (comLigacoes && dados.ligacoes && typeof dados.ligacoes === 'object') {
      cliente.ligacoes = {};
      Object.keys(dados.ligacoes).forEach(function (k) {
        var l = dados.ligacoes[k];
        if (l && typeof l.linha === 'string') cliente.ligacoes[k] = { linha: l.linha, nome: texto(l.nome) || k };
      });
    }
    // ligações que apontam para linhas que não existem mais voltam para "A classificar"
    Object.keys(cliente.ligacoes || {}).forEach(function (k) {
      if (!acharLinha(m, cliente.ligacoes[k].linha)) cliente.ligacoes[k].linha = CLASSIFICAR;
    });
    return true;
  }

  return {
    CHAVE: CHAVE, CLASSIFICAR: CLASSIFICAR, CAMPOS: CAMPOS, GRUPOS: GRUPOS, NOME_GRUPO: NOME_GRUPO, SUBTOTAIS: SUBTOTAIS,
    norm: norm, esc: esc, camposPara: camposPara, faltam: faltam, detectar: detectar, regimeDaColuna: regimeDaColuna,
    assinatura: assinatura, melhorAba: melhorAba, sinalDoTipo: sinalDoTipo, situacaoDe: situacaoDe,
    processar: processar, textoRegra: textoRegra, resumoIgnoradas: resumoIgnoradas,
    modeloPadrao: modeloPadrao, validarModelo: validarModelo, acharLinha: acharLinha, linhasDoGrupo: linhasDoGrupo,
    renomearLinha: renomearLinha, renomearSubtotal: renomearSubtotal, criarLinha: criarLinha, excluirLinha: excluirLinha, moverLinha: moverLinha,
    sugerirLinha: sugerirLinha, sinalNatureza: sinalNatureza, classificarCategorias: classificarCategorias, ligar: ligar, marcarVistas: marcarVistas, confirmarSugestoes: confirmarSugestoes,
    mesesDe: mesesDe, janelaMeses: janelaMeses, mesSeguinte: mesSeguinte, calcular: calcular,
    cartoes: cartoes, maioresSaidas: maioresSaidas, pontosAtencao: pontosAtencao, abasExcel: abasExcel,
    dadosGrafico: dadosGrafico, svgBarras: svgBarras, tabelaHTML: tabelaHTML, painelPartes: painelPartes, gerarPainel: gerarPainel,
    corValida: corValida, logoValido: logoValido,
    novoCliente: novoCliente, estadoVazio: estadoVazio, carregarEstado: carregarEstado, ehBackup: ehBackup,
    lembrarColunas: lembrarColunas, colunasLembradas: colunasLembradas, exportarModelo: exportarModelo, aplicarModelo: aplicarModelo
  };
});

/* Conciliação inteligente, lógica sem tela.
   Casa cada lançamento do extrato do banco com os títulos em aberto do sistema
   (contas a receber e, se quiser, contas a pagar) por valor, nome em pedaços, CPF/CNPJ,
   número do processo, data e regras que a pessoa ensina. Sem IA: cada sugestão diz o motivo.
   Funciona no navegador (window.Conciliar) e no Node (require), para os testes. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./comum.js'), require('./volume-logica.js'));
  else raiz.Conciliar = fabrica(raiz.Comum, raiz.Volume);
})(typeof self !== 'undefined' ? self : this, function (C, V) {
  'use strict';

  var CHAVE = 'ferramentas-bpo:conciliar:v1';
  var OPCOES_PADRAO = { tolerancia: 0.05, diasAntes: 10, diasDepois: 45, saidas: false };

  // ---------- colunas que procuramos nos arquivos ----------
  var CAMPOS_EXTRATO = [
    { chave: 'data', rotulo: 'Data', obrigatorio: true, ajuda: 'Data em que o dinheiro entrou ou saiu.',
      sinonimos: ['data', 'data lancamento', 'data de lancamento', 'data do lancamento', 'data movimento', 'data do movimento',
        'data de movimento', 'data mov', 'data contabil', 'data da transacao', 'data transacao', 'dt lancamento', 'dt movimento',
        'dt mov', 'dt', 'dia', 'data efetiva', 'data credito', 'data do credito'],
      evitar: ['emissao', 'cadastro', 'criacao', 'inclusao', 'vencimento'] },
    { chave: 'historico', rotulo: 'Histórico', obrigatorio: true, ajuda: 'O texto do banco: é nele que a ferramenta procura o nome de quem pagou.',
      sinonimos: ['historico', 'descricao', 'lancamento', 'lancamentos', 'historico do lancamento', 'descricao do lancamento',
        'detalhe', 'detalhes', 'memo', 'complemento', 'favorecido', 'remetente', 'pagador', 'nome', 'movimentacao', 'transacao',
        'identificacao', 'informacoes', 'descricao do movimento'] },
    { chave: 'valor', rotulo: 'Valor', ajuda: 'Entradas positivas e saídas negativas. Se o banco separa em duas colunas, use Crédito e Débito.',
      sinonimos: ['valor', 'valor (r$)', 'valor r$', 'valor em r$', 'valor lancamento', 'valor do lancamento', 'valor movimento',
        'montante', 'quantia', 'vlr', 'vl'],
      evitar: ['saldo', 'credito', 'debito'] },
    { chave: 'credito', rotulo: 'Crédito (entradas)',
      sinonimos: ['credito', 'creditos', 'credito (r$)', 'valor credito', 'entrada', 'entradas', 'recebimentos'] },
    { chave: 'debito', rotulo: 'Débito (saídas)',
      sinonimos: ['debito', 'debitos', 'debito (r$)', 'valor debito', 'saida', 'saidas', 'pagamentos'] },
    { chave: 'tipo', rotulo: 'Tipo (C ou D)', ajuda: 'Só se o valor vem sem sinal e outra coluna diz se é crédito ou débito.',
      sinonimos: ['tipo', 'c/d', 'd/c', 'cd', 'dc', 'natureza', 'tipo de lancamento', 'tipo lancamento', 'sinal'] },
    { chave: 'documento', rotulo: 'Documento',
      sinonimos: ['documento', 'n documento', 'n do documento', 'numero do documento', 'num documento', 'doc', 'nr documento', 'docto', 'n doc'] }
  ];
  var CAMPOS_TITULOS = [
    { chave: 'vencimento', rotulo: 'Vencimento', obrigatorio: true,
      sinonimos: ['vencimento', 'data de vencimento', 'data vencimento', 'data do vencimento', 'venc', 'dt vencimento', 'dt venc', 'vencto', 'data prevista', 'previsao'],
      evitar: ['emissao', 'competencia'] },
    { chave: 'valor', rotulo: 'Valor', obrigatorio: true, ajuda: 'O valor em aberto do título ou da parcela.',
      sinonimos: ['valor em aberto', 'saldo em aberto', 'valor aberto', 'em aberto', 'valor a receber', 'a receber', 'valor a pagar', 'a pagar',
        'valor da parcela', 'valor parcela', 'valor', 'valor (r$)', 'valor r$', 'valor original', 'valor do titulo', 'valor total', 'valor previsto', 'vlr', 'saldo'],
      evitar: ['pago', 'recebido', 'juros', 'multa', 'desconto'] },
    { chave: 'cliente', rotulo: 'Cliente', obrigatorio: true, ajuda: 'De quem a empresa vai receber (ou, nas contas a pagar, o fornecedor).',
      sinonimos: ['cliente', 'nome do cliente', 'cliente/fornecedor', 'razao social', 'contato', 'nome do contato', 'sacado', 'pagador',
        'devedor', 'fornecedor', 'nome do fornecedor', 'favorecido', 'beneficiario', 'nome', 'pessoa', 'parceiro'],
      evitar: ['cpf', 'cnpj', 'codigo', 'documento'] },
    { chave: 'descricao', rotulo: 'Descrição',
      sinonimos: ['descricao', 'historico', 'descricao do titulo', 'descricao da conta', 'referencia', 'servico', 'produto', 'categoria'] },
    { chave: 'observacoes', rotulo: 'Observações',
      sinonimos: ['observacoes', 'observacao', 'obs', 'anotacoes', 'complemento', 'informacoes adicionais', 'notas', 'comentario', 'comentarios'] },
    { chave: 'documento', rotulo: 'Nº do documento ou processo',
      sinonimos: ['processo', 'numero do processo', 'n processo', 'n do processo', 'num processo', 'n documento', 'n do documento',
        'numero do documento', 'documento', 'num documento', 'nosso numero', 'contrato', 'n contrato', 'numero', 'n', 'codigo'] ,
      evitar: ['cpf', 'cnpj'] },
    { chave: 'parcela', rotulo: 'Parcela',
      sinonimos: ['parcela', 'n parcela', 'n da parcela', 'numero da parcela', 'parc', 'parcelas'],
      // "Valor original da parcela (R$)" do Conta Azul é dinheiro, não o número da parcela
      evitar: ['valor', 'r$', 'juros', 'multa', 'desconto', 'pago', 'recebido', 'aberto', 'total'] },
    { chave: 'cpf', rotulo: 'CPF/CNPJ do cliente',
      sinonimos: ['cpf/cnpj', 'cpf cnpj', 'cnpj/cpf', 'cpf', 'cnpj', 'documento do cliente', 'cpf do cliente', 'cnpj do cliente', 'inscricao'] }
  ];
  var CAMPOS_PAGADORES = [
    { chave: 'nome', rotulo: 'Nome do pagador', obrigatorio: true, ajuda: 'Quem pode aparecer no extrato pagando: parte devedora, advogado, sócio, empresa do grupo.',
      sinonimos: ['nome do pagador', 'pagador', 'quem paga', 'nome', 'parte devedora', 'devedor', 'advogado', 'advogado da parte', 'apelido', 'nome no extrato'],
      evitar: ['cliente', 'processo'] },
    { chave: 'cliente', rotulo: 'Cliente', ajuda: 'O cliente do escritório a quem esse pagamento pertence.',
      sinonimos: ['cliente', 'nome do cliente', 'cliente do escritorio', 'cliente da empresa'] },
    { chave: 'processo', rotulo: 'Processo ou título',
      sinonimos: ['processo', 'numero do processo', 'n processo', 'n do processo', 'titulo', 'n documento', 'documento', 'contrato'] },
    { chave: 'cpf', rotulo: 'CPF/CNPJ do pagador',
      sinonimos: ['cpf/cnpj', 'cpf cnpj', 'cpf', 'cnpj', 'documento do pagador'] },
    { chave: 'papel', rotulo: 'Quem é (papel)',
      sinonimos: ['papel', 'tipo', 'relacao', 'quem e', 'vinculo', 'funcao'] }
  ];

  // ---------- texto ----------
  function norm(t) {
    return String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  }
  function palavras(t) { return norm(t).replace(/[^A-Z0-9]+/g, ' ').trim().split(' ').filter(Boolean); }
  function lista(t) { var o = {}; t.split(' ').forEach(function (p) { o[p] = true; }); return o; }

  // palavras que não identificam ninguém (nos nomes e nos históricos)
  var COMUNS_NOME = lista('DE DA DO DOS DAS DI DU E EM NA NO NAS NOS PARA COM POR AO AOS A O AS OS ' +
    'LTDA LTD ME EPP SA S EIRELI CIA MEI SS SLU INC ' +
    'ADV ADVS ADVOCACIA ADVOGADOS ADVOGADO ADVOGADA ADVOGADAS ASSOCIADOS ASSOCIADAS SOCIEDADE SOCIEDADES ESCRITORIO DR DRA SR SRA ' +
    'COMERCIO SERVICOS SERVICO INDUSTRIA HONORARIOS HONORARIO PARCELA PARC PARCELAS PROCESSO PROC ACORDO REF REFERENTE CONTRATO ' +
    'MENSALIDADE MENSAL PARTE DEVEDORA DEVEDOR AUTOR AUTORA REU EXECUTADO EXECUTADA EXEQUENTE CLIENTE PAGAMENTO VALOR TOTAL ' +
    'ENTRADA SALDO NOTA FISCAL NF NFS NFSE OBS OBSERVACAO');
  // palavras dos bancos que aparecem antes ou depois do nome
  var RUIDO_BANCO = lista('PIX RECEBIDO RECEBIDA RECEB REC RECEBIMENTO RECEBIMENTOS TED TEV DOC CRED CREDITO CREDITOS TRANSF TRANSFERENCIA ' +
    'TRANSFERENCIAS TRANSFER TRANS TRANSFERIDO REM REMETENTE DEP DEPOSITO DEPOSITOS ENVIADO ENVIADA ENTRADA BOLETO TIT TITULO LIQ ' +
    'LIQUIDACAO COBRANCA PAGTO PGTO PAG PAGAMENTO OUTRA OUTRO OUTRAS MESMA TITULARIDADE CONTA CORRENTE CC CP AG AGENCIA BCO BANCO ' +
    'INTERNET IB APP ELETRONICO ELETRONICA ONLINE DINHEIRO CHEQUE CH QRCODE QR CODE CHAVE TRANSACAO INST INSTANTANEO RECEBIDOS ' +
    'JUDICIAL TJSP TJ TRT TRF JUSTICA ALVARA DEPOSITANTE ORIGEM DESTINO FAVORECIDO CPF CNPJ ID SIS BB ITAU BRADESCO SANTANDER ' +
    'CEF NUBANK SICOOB SICREDI BANRISUL PAGSEGURO SPI');
  var NOMES_COMUNS = lista('JOSE JOAO MARIA ANA ANTONIO FRANCISCO CARLOS PAULO PEDRO LUCAS LUIZ LUIS MARCOS GABRIEL RAFAEL DANIEL ' +
    'MARCELO BRUNO EDUARDO FELIPE RODRIGO MANOEL MANUEL RAIMUNDO JORGE SEBASTIAO FERNANDO FABIO ROBERTO ANDRE RICARDO SERGIO ' +
    'ALEXANDRE JULIANA FERNANDA PATRICIA ALINE ADRIANA SANDRA CAMILA AMANDA BRUNA JESSICA LETICIA JULIA LUCIANA VANESSA MARCIA ' +
    'CARLA DANIELA RENATA SIMONE ANDREIA CRISTIANE ROSA FRANCISCA ANTONIA MARIANA BEATRIZ GABRIELA LARISSA RITA VERA LUCIA APARECIDA ' +
    'SILVA SANTOS OLIVEIRA SOUZA SOUSA LIMA PEREIRA FERREIRA COSTA RODRIGUES ALMEIDA NASCIMENTO ALVES CARVALHO ARAUJO RIBEIRO ' +
    'GOMES MARTINS ROCHA BARBOSA LOPES MELO MELLO CARDOSO DIAS FERNANDES SOARES MOREIRA MENDES CASTRO VIEIRA MONTEIRO ' +
    'JUNIOR JR FILHO FILHA NETO NETA SOBRINHO');

  function ehComum(p) { return !!NOMES_COMUNS[p]; }

  // Tira datas, números e palavras do banco. Devolve as palavras que sobram, na ordem.
  function semDatas(t) {
    return norm(t)
      .replace(/\b\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}\b/g, ' ')
      .replace(/\b\d{1,2}\/\d{1,2}\b/g, ' ')
      .replace(/\b\d{1,2}:\d{2}(:\d{2})?\b/g, ' ');
  }
  function limparHistorico(t) {
    return palavras(semDatas(t)).filter(function (p) {
      return !/\d/.test(p) && !RUIDO_BANCO[p] && !COMUNS_NOME[p];
    }).join(' ');
  }
  // Números do histórico (CPF, CNPJ, processo): tira pontos e traços entre dígitos
  function numerosDe(t) {
    var s = semDatas(t).replace(/(\d)[.\/\-](?=\d)/g, '$1');
    return (s.match(/\d+/g) || []).filter(function (n) { return n.length >= 5; });
  }
  // PIX costuma mostrar o CPF mascarado: ***.456.789-**  (os 6 do meio)
  function meioCPF(t) {
    var out = [], re = /[*X•\d]{3}\.(\d{3})\.(\d{3})-[*X•\d]{2}/gi, m, s = norm(t);
    while ((m = re.exec(s))) out.push(m[1] + m[2]);
    return out;
  }
  function analisarHistorico(t) {
    var limpo = limparHistorico(t);
    var ps = limpo ? limpo.split(' ') : [];
    return {
      original: String(t == null ? '' : t),
      limpo: limpo,
      tokens: ps.filter(function (p) { return p.length >= 3; }),
      iniciais: ps.filter(function (p) { return p.length === 1; }),
      numeros: numerosDe(t),
      meio6: meioCPF(t)
    };
  }
  function tokensNome(t) {
    return palavras(t).filter(function (p) { return p.length >= 3 && !/\d/.test(p) && !COMUNS_NOME[p]; });
  }
  // chave para comparar nomes de clientes vindos de arquivos diferentes
  function chaveNome(t) {
    return palavras(t).filter(function (p) { return !COMUNS_NOME[p]; }).join(' ');
  }
  function digitos(t) { return String(t == null ? '' : t).replace(/\D/g, ''); }
  function processoBate(a, b) {
    var da = digitos(a), db = digitos(b);
    if (da.length >= 5 && db.length >= 5) return da === db || da.indexOf(db) >= 0 || db.indexOf(da) >= 0;
    var sa = C.simples(a), sb = C.simples(b);
    return !!sa && sa === sb;
  }
  function contemTexto(historico, texto) {
    var h = ' ' + palavras(historico).join(' ') + ' ', t = palavras(texto).join(' ');
    return !!t && h.indexOf(' ' + t + ' ') >= 0;
  }
  function fmtCPF(d) {
    if (d.length === 11) return d.slice(0, 3) + '.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-' + d.slice(9);
    if (d.length === 14) return d.slice(0, 2) + '.' + d.slice(2, 5) + '.' + d.slice(5, 8) + '/' + d.slice(8, 12) + '-' + d.slice(12);
    return d;
  }
  function parcelaDe(parcela, descricao) {
    var m = String(parcela || '').match(/(\d{1,3})\s*(?:\/|de|of)\s*(\d{1,3})/i);
    if (m) return m[1] + '/' + m[2];
    if (/^\s*\d{1,3}\s*$/.test(String(parcela || ''))) return String(parcela).trim();
    m = norm(descricao).match(/PARC(?:ELA)?\.?\s*(\d{1,3})\s*(?:\/|DE)\s*(\d{1,3})/);
    return m ? m[1] + '/' + m[2] : '';
  }
  function pareceNaoCliente(historico) {
    var s = ' ' + palavras(historico).join(' ') + ' ';
    if (/ (REND|RENDIMENTO|RENDIMENTOS|APLIC|APLICACAO|RESGATE|POUPANCA|CDB|INVEST|INVESTIMENTO) /.test(s)) return 'parece rendimento ou resgate de aplicação';
    if (/ (ESTORNO|DEVOLUCAO|DEVOL|CANCELAMENTO) /.test(s)) return 'parece estorno ou devolução';
    if (/ (CASHBACK|TARIFA|IOF|JUROS) /.test(s)) return 'parece movimento do próprio banco';
    if (/ (EMPRESTIMO|FINANCIAMENTO|CAPITAL) /.test(s)) return 'parece empréstimo ou aporte';
    return '';
  }
  var PAPEIS = ['Parte devedora', 'Advogado da parte', 'Sócio', 'Empresa do grupo', 'Outro'];
  function papelTexto(papel) {
    var s = C.simples(papel);
    if (s === 'cliente') return 'o cliente';
    if (s === 'descricao') return 'o texto do título';
    if (/^advogad/.test(s)) return 'o advogado da parte';
    if (/parte|devedor|reu|executad/.test(s)) return 'a parte devedora';
    if (/^soci/.test(s)) return 'o sócio';
    if (/grupo|empresa/.test(s)) return 'a empresa do grupo';
    return s ? 'o pagador cadastrado (' + String(papel).trim().toLowerCase() + ')' : 'o pagador cadastrado';
  }

  // ---------- datas ----------
  function diasEntre(a, b) { // b - a, em dias
    var pa = a.split('-'), pb = b.split('-');
    return Math.round((Date.UTC(+pb[0], +pb[1] - 1, +pb[2]) - Date.UTC(+pa[0], +pa[1] - 1, +pa[2])) / 86400000);
  }

  // ---------- planilhas ----------
  function preparar(linhas, campos) {
    var cab = C.acharCabecalho(linhas, campos);
    var cabecalho = (linhas[cab] || []).map(function (v) { return String(v == null ? '' : v); });
    return { inicio: cab, cabecalho: cabecalho, escolha: C.detectarColunas(cabecalho, campos) };
  }
  function melhorAba(abas, campos) {
    var melhor = 0, nota = -1;
    abas.forEach(function (a, i) {
      var p = preparar(a.linhas, campos);
      var achou = campos.filter(function (c) { return p.escolha[c.chave] >= 0; }).length;
      var n = achou * 1000 + Math.min(a.linhas.length - p.inicio, 999);
      if (n > nota) { nota = n; melhor = i; }
    });
    return melhor;
  }
  function faltandoExtrato(escolha) {
    var f = C.faltando(escolha, CAMPOS_EXTRATO).map(function (c) { return c.rotulo; });
    if (!(escolha.valor >= 0 || escolha.credito >= 0 || escolha.debito >= 0)) f.push('Valor (ou Crédito e Débito)');
    return f;
  }
  function exemploLinha(num, linha) {
    return 'linha ' + num + ': ' + linha.filter(function (v) { return !C.vazio(v); }).join(' | ').slice(0, 100);
  }
  function novoContador(tipos) {
    var r = { lidas: 0, ignoradas: {}, exemplos: {} };
    tipos.forEach(function (t) { r.ignoradas[t] = 0; r.exemplos[t] = []; });
    return r;
  }
  function ignorar(r, tipo, num, linha) {
    r.ignoradas[tipo]++;
    if (r.exemplos[tipo].length < 5) r.exemplos[tipo].push(exemploLinha(num, linha));
  }
  function ehTotal(linha) { return V && V.ehTotal ? V.ehTotal(linha) : C.pareceTotal(linha); }
  function ehSaldo(t) { return V && V.ehSaldo ? V.ehSaldo(t) : /^saldo\b/.test(C.simples(t)); }
  function idLancamento(l, vistos) {
    var base = [l.conta, l.data, l.valor, norm(l.historico).replace(/\s+/g, ' ').trim(), l.documento || ''].join('|');
    vistos[base] = (vistos[base] || 0) + 1;
    return base + '|' + vistos[base];
  }

  // Lê o extrato. conta: nome da conta (arquivo). Devolve {lancamentos, lidas, ignoradas, exemplos}
  function lerExtrato(linhas, inicio, escolha, conta) {
    var r = novoContador(['semData', 'saldo', 'total', 'zero']);
    r.lancamentos = [];
    var vistos = {};
    if (faltandoExtrato(escolha).length) return r;
    function cel(k, l) { return escolha[k] != null && escolha[k] >= 0 ? l[escolha[k]] : ''; }
    for (var i = inicio + 1; i < linhas.length; i++) {
      var l = linhas[i] || [], num = i + 1;
      if (!l.some(function (v) { return !C.vazio(v); })) continue;
      r.lidas++;
      var hist = String(cel('historico', l) == null ? '' : cel('historico', l)).trim();
      if (ehSaldo(hist) || l.some(function (v) { return typeof v === 'string' && ehSaldo(v); })) { ignorar(r, 'saldo', num, l); continue; }
      if (ehTotal(l)) { ignorar(r, 'total', num, l); continue; }
      var iso = C.data(cel('data', l));
      if (!iso) { ignorar(r, 'semData', num, l); continue; }
      var v = null;
      if (escolha.valor >= 0) {
        v = C.valor(cel('valor', l));
        if (v != null && escolha.tipo >= 0) {
          var tp = C.simples(cel('tipo', l));
          if (/^(d|deb|debito|saida|s|-)$/.test(tp)) v = -Math.abs(v);
          else if (/^(c|cred|credito|entrada|e|\+)$/.test(tp)) v = Math.abs(v);
        }
      }
      if (v == null || v === 0) {
        var cr = escolha.credito >= 0 ? C.valor(cel('credito', l)) : null;
        var db = escolha.debito >= 0 ? C.valor(cel('debito', l)) : null;
        if (cr) v = Math.abs(cr);
        else if (db) v = -Math.abs(db);
      }
      if (!v) { ignorar(r, 'zero', num, l); continue; }
      var lanc = { data: iso, historico: hist, valor: C.arred(v), documento: String(cel('documento', l) || '').trim(), conta: conta || 'Extrato', linha: num };
      lanc.id = idLancamento(lanc, vistos);
      r.lancamentos.push(lanc);
    }
    return r;
  }

  // OFX com cada lançamento (o do Monitor de volume só conta por mês)
  function tagOFX(texto, nome) {
    var m = texto.match(new RegExp('<' + nome + '>\\s*([^<\\r\\n]*)', 'i'));
    return m ? m[1].trim() : '';
  }
  function pareceOFX(texto) { return V && V.pareceOFX ? V.pareceOFX(texto) : /<OFX>|<STMTTRN>|OFXHEADER/i.test(texto); }
  function lerOFX(texto, nomeArquivo) {
    var r = novoContador(['semData', 'saldo', 'total', 'zero']);
    r.lancamentos = []; r.contas = [];
    var vistos = {};
    var blocos = String(texto || '').split(/<(?:CC)?STMTRS>/i);
    if (blocos.length < 2) blocos = ['', String(texto || '')];
    var varias = blocos.length > 2;
    for (var b = 1; b < blocos.length; b++) {
      var bloco = blocos[b];
      var acct = tagOFX(bloco, 'ACCTID') || ('conta ' + b);
      var conta = (nomeArquivo || 'OFX') + (varias ? ' | conta ' + acct : '');
      var trans = bloco.split(/<STMTTRN>/i).slice(1);
      if (trans.length) r.contas.push(conta);
      trans.forEach(function (t, k) {
        t = t.split(/<\/STMTTRN>/i)[0];
        r.lidas++;
        var dm = tagOFX(t, 'DTPOSTED').match(/^(\d{4})(\d{2})(\d{2})/);
        var iso = dm ? C.data(dm[1] + '-' + dm[2] + '-' + dm[3]) : null;
        var nome = tagOFX(t, 'NAME'), memo = tagOFX(t, 'MEMO');
        var hist = memo && nome && memo.indexOf(nome) < 0 ? memo + ' ' + nome : (memo || nome);
        var linhaFake = [hist];
        if (!iso) { ignorar(r, 'semData', k + 1, linhaFake); return; }
        if (ehSaldo(hist)) { ignorar(r, 'saldo', k + 1, linhaFake); return; }
        var v = C.valor(tagOFX(t, 'TRNAMT'));
        if (!v) { ignorar(r, 'zero', k + 1, linhaFake); return; }
        var lanc = { data: iso, historico: hist, valor: v, documento: tagOFX(t, 'CHECKNUM') || tagOFX(t, 'REFNUM') || '', conta: conta, linha: k + 1 };
        lanc.id = idLancamento(lanc, vistos);
        r.lancamentos.push(lanc);
      });
    }
    return r;
  }

  // Lê contas a receber (ou a pagar) em aberto. tipo: 'receber' | 'pagar'
  function lerTitulos(linhas, inicio, escolha, tipo, origem) {
    var r = novoContador(['semData', 'semValor', 'semCliente', 'total']);
    r.titulos = [];
    if (C.faltando(escolha, CAMPOS_TITULOS).length) return r;
    function cel(k, l) { var v = escolha[k] != null && escolha[k] >= 0 ? l[escolha[k]] : ''; return v == null ? '' : v; }
    for (var i = inicio + 1; i < linhas.length; i++) {
      var l = linhas[i] || [], num = i + 1;
      if (!l.some(function (v) { return !C.vazio(v); })) continue;
      r.lidas++;
      if (ehTotal(l)) { ignorar(r, 'total', num, l); continue; }
      var venc = C.data(cel('vencimento', l));
      if (!venc) { ignorar(r, 'semData', num, l); continue; }
      var v = C.valor(cel('valor', l));
      if (!v) { ignorar(r, 'semValor', num, l); continue; }
      var cli = String(cel('cliente', l)).trim();
      if (!cli) { ignorar(r, 'semCliente', num, l); continue; }
      var desc = String(cel('descricao', l)).trim();
      r.titulos.push({
        id: (tipo === 'pagar' ? 'P' : 'R') + ':' + (origem || '') + ':' + num,
        tipo: tipo === 'pagar' ? 'pagar' : 'receber',
        vencimento: venc, valor: Math.abs(v), cliente: cli,
        descricao: desc, observacoes: String(cel('observacoes', l)).trim(),
        documento: String(cel('documento', l)).trim(),
        parcela: parcelaDe(cel('parcela', l), desc),
        cpf: digitos(cel('cpf', l)), linha: num
      });
    }
    return r;
  }

  // Lê a planilha de pagadores. Devolve {pagadores, lidas, ignoradas}
  function lerPagadores(linhas, inicio, escolha) {
    var r = novoContador(['semNome', 'semVinculo']);
    r.pagadores = [];
    function cel(k, l) { var v = escolha[k] != null && escolha[k] >= 0 ? l[escolha[k]] : ''; return v == null ? '' : String(v).trim(); }
    if (!(escolha.nome >= 0)) return r;
    for (var i = inicio + 1; i < linhas.length; i++) {
      var l = linhas[i] || [], num = i + 1;
      if (!l.some(function (v) { return !C.vazio(v); })) continue;
      r.lidas++;
      var nome = cel('nome', l);
      if (!nome) { ignorar(r, 'semNome', num, l); continue; }
      var p = novoPagador({ nome: nome, cliente: cel('cliente', l), processo: cel('processo', l), cpf: cel('cpf', l), papel: cel('papel', l) });
      if (!p) { ignorar(r, 'semVinculo', num, l); continue; }
      r.pagadores.push(p);
    }
    return r;
  }

  // ---------- estado ----------
  function copia(o) { return JSON.parse(JSON.stringify(o)); }
  function novoEstado() { return { versao: 1, empresas: [], selecionada: null, ultimoBackup: null }; }
  function novaEmpresa(nome) {
    return { id: C.id(), nome: String(nome || '').trim().slice(0, 80) || 'Empresa sem nome', pagadores: [], regras: [], opcoes: copia(OPCOES_PADRAO) };
  }
  function novoPagador(o) {
    o = o || {};
    var nome = String(o.nome || '').trim().slice(0, 120);
    var cliente = String(o.cliente || '').trim().slice(0, 120), processo = String(o.processo || '').trim().slice(0, 60);
    if (!nome || (!cliente && !processo)) return null;
    return { id: o.id || C.id(), nome: nome, cliente: cliente, processo: processo, cpf: digitos(o.cpf).slice(0, 14), papel: String(o.papel || '').trim().slice(0, 40) };
  }
  function novaRegra(o) {
    o = o || {};
    var texto = palavras(o.texto).join(' ').slice(0, 80);
    var cliente = String(o.cliente || '').trim().slice(0, 120), processo = String(o.processo || '').trim().slice(0, 60);
    if (texto.length < 3 || (!cliente && !processo)) return null;
    return { id: o.id || C.id(), texto: texto, cliente: cliente, processo: processo, criadaEm: o.criadaEm || new Date().toISOString().slice(0, 10) };
  }
  function numPos(v, padrao) { var n = typeof v === 'number' ? v : C.valor(v); return n != null && isFinite(n) && n >= 0 ? n : padrao; }
  function normalizarOpcoes(o) {
    o = o || {};
    return {
      tolerancia: Math.min(numPos(o.tolerancia, OPCOES_PADRAO.tolerancia), 1000),
      diasAntes: Math.round(Math.min(numPos(o.diasAntes, OPCOES_PADRAO.diasAntes), 365)),
      diasDepois: Math.round(Math.min(numPos(o.diasDepois, OPCOES_PADRAO.diasDepois), 730)),
      saidas: !!o.saidas
    };
  }
  function normalizarEmpresa(e) {
    var n = novaEmpresa(e && e.nome);
    if (e && typeof e.id === 'string' && e.id) n.id = e.id;
    n.opcoes = normalizarOpcoes(e && e.opcoes);
    ((e && e.pagadores) || []).forEach(function (p) { var q = novoPagador(p); if (q) n.pagadores.push(q); });
    ((e && e.regras) || []).forEach(function (r) { var q = novaRegra(r); if (q) n.regras.push(q); });
    return n;
  }
  function normalizar(e) {
    var n = novoEstado();
    if (!e || typeof e !== 'object') return n;
    (Array.isArray(e.empresas) ? e.empresas : []).forEach(function (x) { if (x && typeof x === 'object') n.empresas.push(normalizarEmpresa(x)); });
    n.selecionada = typeof e.selecionada === 'string' && n.empresas.some(function (x) { return x.id === e.selecionada; }) ? e.selecionada : (n.empresas[0] ? n.empresas[0].id : null);
    n.ultimoBackup = typeof e.ultimoBackup === 'string' ? e.ultimoBackup : null;
    return n;
  }
  function criarBackup(estado, agoraIso) {
    return { ferramenta: 'conciliacao-inteligente', versao: 1, salvoEm: agoraIso || new Date().toISOString(), dados: copia(estado) };
  }
  function lerBackup(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('Esse arquivo não é um backup da Conciliação.');
    var dados = obj.ferramenta === 'conciliacao-inteligente' ? obj.dados : (Array.isArray(obj.empresas) ? obj : null);
    if (!dados || !Array.isArray(dados.empresas)) throw new Error('Esse arquivo não é um backup da Conciliação.');
    return normalizar(dados);
  }
  // Só os pagadores e as regras de uma empresa, para passar para outra assistente
  function exportarRegras(empresa, agoraIso) {
    return { ferramenta: 'conciliacao-regras', versao: 1, salvoEm: agoraIso || new Date().toISOString(), empresa: empresa.nome,
      pagadores: copia(empresa.pagadores), regras: copia(empresa.regras), opcoes: copia(empresa.opcoes) };
  }
  function importarRegras(empresa, obj) {
    if (!obj || obj.ferramenta !== 'conciliacao-regras') throw new Error('Esse arquivo não tem regras da Conciliação.');
    var r = { pagadores: 0, regras: 0, repetidos: 0 };
    function chaveP(p) { return [chaveNome(p.nome), chaveNome(p.cliente), digitos(p.processo) || C.simples(p.processo)].join('|'); }
    function chaveR(x) { return [x.texto, chaveNome(x.cliente), digitos(x.processo) || C.simples(x.processo)].join('|'); }
    var tem = {};
    empresa.pagadores.forEach(function (p) { tem['p' + chaveP(p)] = true; });
    empresa.regras.forEach(function (x) { tem['r' + chaveR(x)] = true; });
    (obj.pagadores || []).forEach(function (p) {
      var q = novoPagador({ nome: p.nome, cliente: p.cliente, processo: p.processo, cpf: p.cpf, papel: p.papel });
      if (!q) return;
      if (tem['p' + chaveP(q)]) { r.repetidos++; return; }
      tem['p' + chaveP(q)] = true; empresa.pagadores.push(q); r.pagadores++;
    });
    (obj.regras || []).forEach(function (x) {
      var q = novaRegra({ texto: x.texto, cliente: x.cliente, processo: x.processo, criadaEm: x.criadaEm });
      if (!q) return;
      if (tem['r' + chaveR(q)]) { r.repetidos++; return; }
      tem['r' + chaveR(q)] = true; empresa.regras.push(q); r.regras++;
    });
    return r;
  }

  // ---------- quem pode pagar cada título ----------
  function pagadorServe(p, t) {
    if (p.processo && (processoBate(p.processo, t.documento) || (digitos(p.processo).length >= 5 && digitos(t.descricao + ' ' + t.observacoes).indexOf(digitos(p.processo)) >= 0))) return true;
    if (p.cliente && chaveNome(p.cliente) === chaveNome(t.cliente)) return true;
    return false;
  }
  function regraServe(r, t) {
    if (r.processo) return processoBate(r.processo, t.documento) || (digitos(r.processo).length >= 5 && digitos(t.descricao + ' ' + t.observacoes).indexOf(digitos(r.processo)) >= 0);
    return chaveNome(r.cliente) === chaveNome(t.cliente);
  }
  function montarContexto(titulos, empresa) {
    var ctx = { opcoes: normalizarOpcoes(empresa && empresa.opcoes), regras: (empresa && empresa.regras) || [], pagadores: (empresa && empresa.pagadores) || [], pessoas: {}, freq: {} };
    // frequência de cada palavra entre pessoas diferentes (sobrenome raro vale mais)
    var vistos = {};
    function conta(nome) {
      var k = chaveNome(nome);
      if (!k || vistos[k]) return;
      vistos[k] = true;
      var u = {};
      tokensNome(nome).forEach(function (p) { if (!u[p]) { u[p] = true; ctx.freq[p] = (ctx.freq[p] || 0) + 1; } });
    }
    titulos.forEach(function (t) { conta(t.cliente); });
    ctx.pagadores.forEach(function (p) { conta(p.nome); });
    titulos.forEach(function (t) {
      var lista = [{ nome: t.cliente, papel: 'cliente', tokens: tokensNome(t.cliente), cpfs: t.cpf ? [t.cpf] : [], numeros: [] }];
      ctx.pagadores.forEach(function (p) {
        if (pagadorServe(p, t)) lista.push({ nome: p.nome, papel: p.papel || 'Outro', tokens: tokensNome(p.nome), cpfs: p.cpf ? [p.cpf] : [], numeros: [] });
      });
      var texto = (t.descricao + ' ' + t.observacoes).trim();
      var nums = numerosDe(t.documento).concat(numerosDe(texto));
      var cpfsTexto = nums.filter(function (n) { return n.length === 11 || n.length === 14; });
      lista.push({ nome: texto || t.documento, papel: 'descricao', tokens: tokensNome(texto), cpfs: cpfsTexto, numeros: nums, documento: t.documento });
      ctx.pessoas[t.id] = lista;
    });
    return ctx;
  }
  function peso(p, ctx) {
    if (ehComum(p)) return 1;
    return ctx.freq[p] === 1 ? 2.5 : 2;
  }

  // Compara o histórico com uma pessoa. Devolve {pontos, pedacos, motivo}
  function casarPessoa(H, pessoa, ctx) {
    var usados = {}, pontos = 0, pedacos = [], cortou = false, docMotivo = '', iniciais = [];
    H.tokens.forEach(function (t) {
      var melhor = -1, mp = 0;
      pessoa.tokens.forEach(function (n, j) {
        if (usados[j]) return;
        var w = 0;
        if (n === t) w = peso(n, ctx);
        else if (t.length >= 4 && n.indexOf(t) === 0) w = peso(n, ctx) * 0.8;
        if (w > mp) { mp = w; melhor = j; }
      });
      if (melhor >= 0) {
        usados[melhor] = true; pontos += mp; pedacos.push(t);
        if (pessoa.tokens[melhor] !== t) cortou = true;
      }
    });
    if (pedacos.length) {
      H.iniciais.forEach(function (i) {
        for (var j = 0; j < pessoa.tokens.length; j++) {
          if (!usados[j] && pessoa.tokens[j].charAt(0) === i) { usados[j] = true; pontos += 0.5; pedacos.push(i); iniciais.push(i + ' de ' + pessoa.tokens[j]); return; }
        }
      });
    }
    // CPF/CNPJ e número do processo
    pessoa.cpfs.forEach(function (d) {
      if (docMotivo) return;
      if (H.numeros.indexOf(d) >= 0) { pontos += 4; docMotivo = 'o ' + (d.length === 14 ? 'CNPJ ' : 'CPF ') + fmtCPF(d) + ' é d' + quem(pessoa); pedacos.push(d); return; }
      if (d.length === 11) {
        var meio = d.slice(3, 9);
        if (H.meio6.indexOf(meio) >= 0 || H.numeros.indexOf(meio) >= 0) { pontos += 3; docMotivo = 'os 6 dígitos do meio do CPF (' + meio.slice(0, 3) + '.' + meio.slice(3) + ') batem com ' + quem(pessoa); pedacos.push(meio); }
      }
    });
    if (!docMotivo && pessoa.numeros.length) {
      H.numeros.forEach(function (n) {
        if (docMotivo) return;
        for (var k = 0; k < pessoa.numeros.length; k++) {
          var d = pessoa.numeros[k];
          if (d.length === 11 || d.length === 14) continue;
          if (n === d || (n.length >= 5 && d.indexOf(n) >= 0) || (d.length >= 5 && n.indexOf(d) >= 0)) {
            pontos += 4; docMotivo = 'o número ' + n + ' está no ' + (pessoa.documento ? 'processo ou documento ' + pessoa.documento : 'texto do título'); pedacos.push(n); return;
          }
        }
      });
    }
    var motivo = '';
    var nomes = pedacos.filter(function (p) { return !/^\d+$/.test(p); });
    var ordem = H.limpo.split(' ');
    nomes.sort(function (x, y) { return ordem.indexOf(x) - ordem.indexOf(y); });
    if (nomes.length && pessoa.tokens.length) {
      motivo = "'" + nomes.join(' ') + "' bate com " + quem(pessoa) + (cortou ? ', com o nome cortado pelo banco' : '') + (iniciais.length ? ', inicial ' + iniciais.join(', ') : '');
    }
    if (docMotivo) motivo = motivo ? motivo + '; ' + docMotivo : docMotivo;
    return { pontos: pontos, pedacos: pedacos, motivo: motivo, papel: pessoa.papel, nome: pessoa.nome };
  }
  function quem(p) {
    if (p.papel === 'descricao') return 'o texto do título';
    return papelTexto(p.papel) + ' (' + p.nome + ')';
  }
  var LIMITE_NOME = 1.5;
  function casarNome(H, tituloId, ctx) {
    var melhor = { pontos: 0, pedacos: [], motivo: '', bate: false };
    (ctx.pessoas[tituloId] || []).forEach(function (p) {
      var r = casarPessoa(H, p, ctx);
      if (r.pontos > melhor.pontos) melhor = r;
    });
    melhor.bate = melhor.pontos >= LIMITE_NOME;
    return melhor;
  }

  // ---------- avaliação de um lançamento ----------
  function infoData(lanc, venc, op) {
    var dias = diasEntre(venc, lanc.data);
    var dentro = dias >= -op.diasAntes && dias <= op.diasDepois;
    var lim = dias < 0 ? op.diasAntes : op.diasDepois;
    var pts = dentro ? Math.max(1, 20 * (1 - Math.abs(dias) / (lim || 1))) : 0;
    return { dias: dias, dentro: dentro, pontos: pts };
  }
  function textoData(d) {
    var n = Math.abs(d.dias), s = n === 1 ? '1 dia' : n + ' dias';
    var base = d.dias === 0 ? 'pago no dia do vencimento' : d.dias > 0 ? 'pago ' + s + ' depois do vencimento' : 'pago ' + s + ' antes do vencimento';
    return d.dentro ? base : base + ', fora da janela de datas';
  }
  function rotuloParcela(t) { return t.parcela ? 'parcela ' + t.parcela : 'título'; }
  function montarCandidato(lanc, H, tits, ctx, regra) {
    var op = ctx.opcoes, alvo = Math.abs(lanc.valor);
    var soma = C.arred(tits.reduce(function (s, t) { return s + t.valor; }, 0));
    var dif = C.arred(alvo - soma);
    var valorOk = Math.abs(dif) <= op.tolerancia + 1e-9;
    var nome = { pontos: 0, pedacos: [], motivo: '', bate: false };
    tits.forEach(function (t) { var n = casarNome(H, t.id, ctx); if (n.pontos > nome.pontos) nome = n; });
    var datas = tits.map(function (t) { return infoData(lanc, t.vencimento, op); });
    var data = datas.reduce(function (a, b) { return b.pontos > a.pontos || (!a.dentro && Math.abs(b.dias) < Math.abs(a.dias)) ? b : a; });
    var c = {
      titulos: tits, ids: tits.map(function (t) { return t.id; }), tipo: tits.length > 1 ? 'soma' : 'titulo',
      cliente: tits[0].cliente, chaveCliente: chaveNome(tits[0].cliente),
      valorOk: valorOk, diferenca: dif, nome: nome, data: data, regra: regra || null
    };
    c.pontos = (regra ? 100 : 0) + (valorOk ? (tits.length > 1 ? 45 : 50) : 0) + Math.min(40, nome.pontos * 10) + data.pontos;
    var partes = [];
    if (regra) partes.push("regra aprendida: o histórico contém '" + regra.texto + "'");
    if (tits.length > 1) {
      partes.push((valorOk ? 'soma de títulos: ' : 'a soma não bate: ') + tits.map(function (t) { return rotuloParcela(t) + ' (' + C.brl(t.valor) + ')'; }).join(' + '));
    } else if (valorOk) {
      partes.push('valor igual ' + (tits[0].parcela ? 'à parcela ' + tits[0].parcela : 'ao título'));
    } else {
      partes.push('valor diferente do título (' + C.brl(Math.abs(dif)) + (dif > 0 ? ' a mais' : ' a menos') + ')');
    }
    if (valorOk && dif !== 0) partes[partes.length - 1] += ' (diferença de ' + C.brl(Math.abs(dif)) + ')';
    if (nome.motivo) partes.push(nome.motivo);
    partes.push(textoData(data));
    c.motivo = partes.join('; ');
    return c;
  }
  function regraDoLancamento(lanc, ctx) {
    var achou = null;
    ctx.regras.forEach(function (r) {
      if (contemTexto(lanc.historico, r.texto) && (!achou || r.texto.length > achou.texto.length)) achou = r;
    });
    return achou;
  }
  // Agrupa e decide: um só (ou todos do mesmo cliente) dá o status; clientes diferentes vão para Conferir
  function decidir(lista, status) {
    if (!lista.length) return null;
    if (lista.length === 1) return { status: status, cand: lista[0] };
    var cl = {};
    lista.forEach(function (c) { cl[c.chaveCliente] = true; });
    if (Object.keys(cl).length === 1) return { status: 'provavel', cand: lista[0], nota: 'o mesmo cliente tem outro título com esse valor em aberto; sugeri o vencimento mais perto' };
    return { status: 'conferir' };
  }
  function ordenar(cands) {
    return cands.sort(function (a, b) { return b.pontos - a.pontos || Math.abs(a.data.dias) - Math.abs(b.data.dias) || (a.titulos[0].vencimento < b.titulos[0].vencimento ? -1 : 1); });
  }
  // Somas de 2 títulos do mesmo cliente: guarda só o melhor par de cada cliente
  function somasDePares(lanc, H, pool, ctx, regra) {
    var porCliente = {}, out = [];
    pool.forEach(function (t) { var k = chaveNome(t.cliente); (porCliente[k] = porCliente[k] || []).push(t); });
    var alvo = Math.abs(lanc.valor), tol = ctx.opcoes.tolerancia + 1e-9;
    Object.keys(porCliente).forEach(function (k) {
      var ts = porCliente[k], melhor = null;
      if (ts.length < 2 || ts.length > 60) return;
      for (var i = 0; i < ts.length; i++) {
        for (var j = i + 1; j < ts.length; j++) {
          if (Math.abs(alvo - ts[i].valor - ts[j].valor) > tol) continue;
          var par = ts[i].vencimento <= ts[j].vencimento ? [ts[i], ts[j]] : [ts[j], ts[i]];
          var c = montarCandidato(lanc, H, par, ctx, regra);
          if (!regra && !c.data.dentro && !c.nome.bate) continue;
          if (!melhor || c.pontos > melhor.pontos) melhor = c;
        }
      }
      if (melhor) out.push(melhor);
    });
    return out;
  }
  // Avalia um lançamento contra os títulos disponíveis
  function avaliar(lanc, disponiveis, ctx) {
    var H = analisarHistorico(lanc.historico);
    var tipo = lanc.valor > 0 ? 'receber' : 'pagar';
    var pool = disponiveis.filter(function (t) { return t.tipo === tipo; });
    var res = { lanc: lanc, status: 'sempar', sugestao: null, candidatos: [], motivo: '', dica: pareceNaoCliente(lanc.historico), H: H };
    var regra = regraDoLancamento(lanc, ctx);
    if (regra) {
      var daRegra = pool.filter(function (t) { return regraServe(regra, t); });
      if (daRegra.length) {
        var cr = daRegra.map(function (t) { return montarCandidato(lanc, H, [t], ctx, regra); });
        cr = cr.concat(somasDePares(lanc, H, daRegra, ctx, regra));
        ordenar(cr);
        var comValor = cr.filter(function (c) { return c.valorOk; });
        var naJanela = comValor.filter(function (c) { return c.data.dentro; });
        var d = naJanela.length === 1 ? { status: 'certo', cand: naJanela[0] } : decidir(comValor, 'certo');
        res.candidatos = cr.slice(0, 3);
        if (d && d.cand) {
          res.status = d.status; res.sugestao = d.cand;
          res.motivo = d.cand.motivo + (d.nota ? '; ' + d.nota : '');
          return res;
        }
        res.status = 'conferir';
        res.motivo = comValor.length ? 'a regra aprendida aponta para mais de um título com esse valor' :
          "a regra aprendida ('" + regra.texto + "') aponta para " + (regra.processo ? 'o processo ' + regra.processo : regra.cliente) + ', mas o valor não bate com nenhum título em aberto';
        return res;
      }
      res.regraSemTitulo = regra;
    }
    var cands = [];
    pool.forEach(function (t) {
      var c = montarCandidato(lanc, H, [t], ctx, null);
      if ((c.valorOk && (c.data.dentro || c.nome.bate)) || (c.nome.bate && c.data.dentro)) cands.push(c);
    });
    cands = cands.concat(somasDePares(lanc, H, pool, ctx, null));
    ordenar(cands);
    res.candidatos = cands.slice(0, 3);
    if (!cands.length) {
      res.motivo = res.regraSemTitulo ? "a regra aprendida ('" + res.regraSemTitulo.texto + "') aponta para quem não tem título em aberto" : 'nenhum título em aberto com esse valor, nome ou data';
      if (res.dica) res.motivo += '; ' + res.dica;
      return res;
    }
    var fortes = cands.filter(function (c) { return c.valorOk && c.nome.bate && c.data.dentro; });
    var d1 = decidir(fortes, 'certo');
    if (!d1) {
      var vn = cands.filter(function (c) { return c.valorOk && c.nome.bate; });
      d1 = decidir(vn, 'provavel');
    }
    if (!d1) {
      var soValor = cands.filter(function (c) { return c.valorOk; });
      var vd = soValor.filter(function (c) { return c.data.dentro; });
      var cl = {};
      soValor.forEach(function (c) { cl[c.chaveCliente] = true; });
      if (vd.length && Object.keys(cl).length === 1) d1 = decidir(vd, 'provavel');
    }
    if (d1 && d1.cand) {
      res.status = d1.status; res.sugestao = d1.cand;
      res.motivo = d1.cand.motivo + (d1.nota ? '; ' + d1.nota : '');
    } else {
      res.status = 'conferir';
      var n = cands.length;
      res.motivo = n === 1 ? 'só um título parecido, mas falta confirmar' : n + ' títulos possíveis; veja as opções';
      if (cands.filter(function (c) { return c.valorOk; }).length > 1) res.motivo = 'o valor bate com títulos de clientes diferentes; veja as opções';
      if (cands.filter(function (c) { return c.valorOk && c.nome.bate; }).length > 1) res.motivo = 'o nome e o valor batem com mais de um cliente (nomes parecidos ou homônimos); veja as opções';
    }
    return res;
  }

  // ---------- conciliação inteira ----------
  // decisoes: {idLancamento: {tipo:'confirmar', ids:[...]} | {tipo:'nao'}}
  var ORDEM = { certo: 0, provavel: 1, conferir: 2, sempar: 3 };
  function conciliar(lancamentos, titulos, empresa, decisoes) {
    decisoes = decisoes || {};
    var ctx = montarContexto(titulos, empresa);
    var porId = {};
    titulos.forEach(function (t) { porId[t.id] = t; });
    var usados = {}, itens = {}, saidasFora = 0;
    var considerar = lancamentos.filter(function (l) {
      if (l.valor > 0) return true;
      if (ctx.opcoes.saidas) return true;
      saidasFora++;
      return false;
    });
    // 1) o que a pessoa já decidiu
    considerar.forEach(function (l) {
      var d = decisoes[l.id];
      if (!d) return;
      if (d.tipo === 'nao') { itens[l.id] = { lanc: l, status: 'nao', sugestao: null, candidatos: [], motivo: l.valor > 0 ? 'você marcou: não é recebimento de cliente' : 'você marcou: não é pagamento de conta em aberto' }; return; }
      if (d.tipo === 'confirmar') {
        var ts = (d.ids || []).map(function (i) { return porId[i]; }).filter(function (t) { return t && !usados[t.id]; });
        if (!ts.length) return;
        ts.forEach(function (t) { usados[t.id] = l.id; });
        var H = analisarHistorico(l.historico);
        var c = montarCandidato(l, H, ts, ctx, null);
        itens[l.id] = { lanc: l, status: 'confirmado', sugestao: c, candidatos: [c], motivo: 'confirmado por você; ' + c.motivo };
      }
    });
    function livres() { return titulos.filter(function (t) { return !usados[t.id]; }); }
    // 2) primeira passada: avalia todos e ordena do mais certo para o menos certo
    var resto = considerar.filter(function (l) { return !itens[l.id]; });
    var disp = livres();
    var primeira = resto.map(function (l) { return avaliar(l, disp, ctx); });
    // mesmo status: o crédito mais antigo primeiro (parcelas costumam ser pagas em ordem)
    primeira.sort(function (a, b) {
      return ORDEM[a.status] - ORDEM[b.status] || (a.lanc.data < b.lanc.data ? -1 : a.lanc.data > b.lanc.data ? 1 : 0) ||
        ((b.sugestao ? b.sugestao.pontos : 0) - (a.sugestao ? a.sugestao.pontos : 0));
    });
    // 3) de novo, na ordem, tirando os títulos já usados
    primeira.forEach(function (p) {
      var r = avaliar(p.lanc, livres(), ctx);
      if (r.status === 'certo' || r.status === 'provavel') r.sugestao.ids.forEach(function (i) { usados[i] = p.lanc.id; });
      itens[p.lanc.id] = r;
    });
    // 4) quem ficou para conferir é avaliado de novo sem os títulos já usados
    for (var volta = 0; volta < 3; volta++) {
      var mudou = false;
      primeira.forEach(function (p) {
        var atual = itens[p.lanc.id];
        if (atual.status !== 'conferir' && atual.status !== 'sempar') return;
        var r = avaliar(p.lanc, livres(), ctx);
        if (r.status === 'certo' || r.status === 'provavel') { r.sugestao.ids.forEach(function (i) { usados[i] = p.lanc.id; }); mudou = true; }
        itens[p.lanc.id] = r;
      });
      if (!mudou) break;
    }
    var lista = considerar.map(function (l) { return itens[l.id]; }).filter(Boolean);
    lista.forEach(function (it) { delete it.H; });
    var baixados = {};
    lista.forEach(function (it) { if ((it.status === 'certo' || it.status === 'confirmado') && it.sugestao) it.sugestao.ids.forEach(function (i) { baixados[i] = it.lanc.id; }); });
    var abertos = titulos.filter(function (t) { return !baixados[t.id]; });
    var sugeridos = {};
    lista.forEach(function (it) { if (it.status === 'provavel' && it.sugestao) it.sugestao.ids.forEach(function (i) { sugeridos[i] = it; }); });
    return { itens: lista, abertos: abertos, baixados: baixados, sugeridos: sugeridos, totais: totais(lista, abertos), saidasFora: saidasFora, opcoes: ctx.opcoes };
  }
  function totais(lista, abertos) {
    var t = { conciliados: 0, valorConciliado: 0, conferir: 0, valorConferir: 0, semPar: 0, valorSemPar: 0, nao: 0, abertos: abertos.length, valorAbertos: 0, certo: 0, provavel: 0, confirmado: 0, conferirSo: 0 };
    lista.forEach(function (it) {
      var v = Math.abs(it.lanc.valor);
      if (it.status === 'certo' || it.status === 'confirmado') { t.conciliados++; t.valorConciliado += v; }
      else if (it.status === 'provavel' || it.status === 'conferir') { t.conferir++; t.valorConferir += v; }
      else if (it.status === 'sempar') { t.semPar++; t.valorSemPar += v; }
      else if (it.status === 'nao') t.nao++;
      if (it.status === 'certo') t.certo++;
      if (it.status === 'provavel') t.provavel++;
      if (it.status === 'confirmado') t.confirmado++;
      if (it.status === 'conferir') t.conferirSo++;
    });
    abertos.forEach(function (x) { t.valorAbertos += x.valor; });
    ['valorConciliado', 'valorConferir', 'valorSemPar', 'valorAbertos'].forEach(function (k) { t[k] = C.arred(t[k]); });
    return t;
  }

  // Texto sugerido para "Aprender": o pedaço do histórico que identificou
  function sugerirRegra(lanc, cand) {
    var H = analisarHistorico(lanc.historico);
    var ped = cand && cand.nome && cand.nome.pedacos ? cand.nome.pedacos : [];
    var nums = ped.filter(function (p) { return /^\d+$/.test(p); });
    if (nums.length) return nums[0];
    var orig = palavras(semDatas(lanc.historico));
    var marcadas = orig.filter(function (p) { return ped.indexOf(p) >= 0; });
    if (marcadas.length) return marcadas.join(' ');
    return H.limpo || palavras(semDatas(lanc.historico)).filter(function (p) { return !/^\d+$/.test(p); }).join(' ');
  }

  // ---------- rótulos e Excel ----------
  var ROTULO_STATUS = { certo: 'Certo', provavel: 'Provável', conferir: 'Conferir', sempar: 'Sem par', confirmado: 'Confirmado por você', nao: 'Não é de cliente' };
  function rotuloTitulo(t) {
    return t.cliente + (t.documento ? ' | ' + t.documento : '') + (t.parcela ? ' | parcela ' + t.parcela : '') + ' | venc. ' + C.dataBR(t.vencimento) + ' | ' + C.brl(t.valor);
  }
  function planilhaResultado(res, empresaNome) {
    var baixas = [['Data do crédito', 'Valor do crédito', 'Cliente', 'Título / processo', 'Parcela', 'Vencimento', 'Valor a baixar', 'Diferença', 'Conta do banco', 'Histórico do banco', 'Situação', 'Motivo']];
    var conferir = [['Data', 'Valor', 'Histórico do banco', 'Conta do banco', 'Situação', 'Por quê', 'Opção 1', 'Motivo 1', 'Opção 2', 'Motivo 2', 'Opção 3', 'Motivo 3']];
    var semPar = [['Data', 'Valor', 'Histórico do banco', 'Conta do banco', 'Observação']];
    var abertos = [['Cliente', 'Título / processo', 'Parcela', 'Vencimento', 'Valor', 'Descrição', 'Sugestão a conferir']];
    res.itens.forEach(function (it) {
      var l = it.lanc;
      if ((it.status === 'certo' || it.status === 'confirmado') && it.sugestao) {
        var ts = it.sugestao.titulos;
        ts.forEach(function (t, k) {
          var dif = ts.length === 1 ? it.sugestao.diferenca : (k === ts.length - 1 ? it.sugestao.diferenca : 0);
          baixas.push([C.dataBR(l.data), Math.abs(l.valor), t.cliente, t.documento || t.descricao || '', t.parcela, C.dataBR(t.vencimento), t.valor, dif, l.conta, l.historico,
            ROTULO_STATUS[it.status] + (ts.length > 1 ? ' (soma de ' + ts.length + ' títulos)' : ''), it.motivo]);
        });
      } else if (it.status === 'provavel' || it.status === 'conferir') {
        var linha = [C.dataBR(l.data), Math.abs(l.valor), l.historico, l.conta, ROTULO_STATUS[it.status], it.motivo];
        var cs = it.status === 'provavel' && it.sugestao ? [it.sugestao].concat(it.candidatos.filter(function (c) { return c.ids.join() !== it.sugestao.ids.join(); })) : it.candidatos;
        cs.slice(0, 3).forEach(function (c) { linha.push(c.titulos.map(rotuloTitulo).join(' + '), c.motivo); });
        conferir.push(linha);
      } else {
        semPar.push([C.dataBR(l.data), Math.abs(l.valor), l.historico, l.conta, it.motivo]);
      }
    });
    res.abertos.slice().sort(function (a, b) { return a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : 0; }).forEach(function (t) {
      var s = res.sugeridos[t.id];
      abertos.push([t.cliente, t.documento, t.parcela, C.dataBR(t.vencimento), t.valor, t.descricao, s ? 'Provável: crédito de ' + C.dataBR(s.lanc.data) + ' de ' + C.brl(Math.abs(s.lanc.valor)) : '']);
    });
    baixas.push([]);
    baixas.push(['A baixa no sistema (Conta Azul, Nibo, Omie) é feita por você. A ferramenta só aponta o par' + (empresaNome ? ' (' + empresaNome + ')' : '') + '.']);
    return [
      { nome: 'Baixas', linhas: baixas, larguras: [12, 14, 28, 24, 9, 12, 14, 11, 22, 40, 22, 70], formatoMoeda: [1, 6, 7] },
      { nome: 'A conferir', linhas: conferir, larguras: [12, 14, 40, 22, 12, 50, 50, 50, 50, 50, 50, 50], formatoMoeda: [1] },
      { nome: 'Sem par no extrato', linhas: semPar, larguras: [12, 14, 44, 22, 60], formatoMoeda: [1] },
      { nome: 'Títulos ainda em aberto', linhas: abertos, larguras: [30, 26, 9, 12, 14, 36, 44], formatoMoeda: [4] }
    ];
  }
  function diasDesde(iso, agora) {
    if (!iso) return null;
    var t = Date.parse(iso), a = agora ? Date.parse(agora) : Date.now();
    return isFinite(t) ? Math.floor((a - t) / 86400000) : null;
  }

  return {
    CHAVE: CHAVE, OPCOES_PADRAO: OPCOES_PADRAO, CAMPOS_EXTRATO: CAMPOS_EXTRATO, CAMPOS_TITULOS: CAMPOS_TITULOS, CAMPOS_PAGADORES: CAMPOS_PAGADORES,
    PAPEIS: PAPEIS, ROTULO_STATUS: ROTULO_STATUS, LIMITE_NOME: LIMITE_NOME,
    norm: norm, palavras: palavras, limparHistorico: limparHistorico, analisarHistorico: analisarHistorico, tokensNome: tokensNome,
    chaveNome: chaveNome, numerosDe: numerosDe, meioCPF: meioCPF, processoBate: processoBate, contemTexto: contemTexto, parcelaDe: parcelaDe,
    pareceNaoCliente: pareceNaoCliente, papelTexto: papelTexto, diasEntre: diasEntre, ehComum: ehComum,
    preparar: preparar, melhorAba: melhorAba, faltandoExtrato: faltandoExtrato, lerExtrato: lerExtrato, pareceOFX: pareceOFX, lerOFX: lerOFX,
    lerTitulos: lerTitulos, lerPagadores: lerPagadores,
    novoEstado: novoEstado, novaEmpresa: novaEmpresa, novoPagador: novoPagador, novaRegra: novaRegra, normalizarOpcoes: normalizarOpcoes,
    normalizar: normalizar, criarBackup: criarBackup, lerBackup: lerBackup, exportarRegras: exportarRegras, importarRegras: importarRegras,
    montarContexto: montarContexto, casarNome: casarNome, avaliar: avaliar, conciliar: conciliar, sugerirRegra: sugerirRegra,
    rotuloTitulo: rotuloTitulo, planilhaResultado: planilhaResultado, diasDesde: diasDesde
  };
});

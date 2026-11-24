/* Recorrentes para o Conta Azul, lógica sem tela.
   Lê os extratos de até 12 meses de um cliente novo, acha o que se repete (aluguel, folha,
   impostos, assinaturas, recebimentos) e preenche o modelo de importação que a pessoa baixou
   do Conta Azul, sem inventar o formato: as colunas vêm do próprio modelo.
   Funciona no navegador (window.Onboarding) e no Node (require), para os testes. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica(require('./comum.js'), require('./volume-logica.js'));
  else raiz.Onboarding = fabrica(raiz.Comum, raiz.Volume);
})(typeof self !== 'undefined' ? self : this, function (C, V) {
  'use strict';

  var CHAVE = 'ferramentas-bpo:onboarding:v1';
  var TOLERANCIA = 0.05;          // até 5% de diferença conta como valor fixo
  var MIN_MESES_PADRAO = 3;
  var MESES_GERAR_PADRAO = 12;
  var PERIODOS = { mensal: 1, bimestral: 2, trimestral: 3, semestral: 6, anual: 12 };
  var NOME_PERIODO = { 1: 'mensal', 2: 'bimestral', 3: 'trimestral', 6: 'semestral', 12: 'anual' };

  // ---------- colunas do extrato ----------
  var CAMPOS = [
    { chave: 'data', rotulo: 'Data', obrigatorio: true, ajuda: 'Data de cada lançamento.',
      sinonimos: ['data', 'data lancamento', 'data de lancamento', 'data do lancamento', 'data movimento', 'data do movimento',
        'data de movimento', 'data mov', 'data de pagamento', 'data pagamento', 'data contabil', 'data da transacao', 'data transacao',
        'dt lancamento', 'dt movimento', 'dt mov', 'dt', 'dia', 'data efetiva', 'data baixa', 'data de baixa'],
      evitar: ['emissao', 'cadastro', 'criacao', 'inclusao', 'vencimento'] },
    { chave: 'historico', rotulo: 'Histórico ou descrição', obrigatorio: true, ajuda: 'O texto do banco. É dele que sai o nome do fornecedor ou cliente.',
      sinonimos: ['historico', 'descricao', 'lancamento', 'lancamentos', 'historico do lancamento', 'descricao do lancamento', 'detalhe',
        'detalhes', 'memo', 'complemento', 'favorecido', 'movimentacao', 'transacao', 'estabelecimento', 'identificacao'] },
    { chave: 'valor', rotulo: 'Valor', ajuda: 'Saída com sinal de menos (ou use Crédito e Débito).',
      sinonimos: ['valor', 'valor (r$)', 'valor r$', 'valor em r$', 'valor lancamento', 'valor do lancamento', 'valor liquido',
        'valor movimento', 'montante', 'quantia', 'vlr', 'vl'],
      evitar: ['saldo', 'original', 'credito', 'debito'] },
    { chave: 'credito', rotulo: 'Crédito (entradas)',
      sinonimos: ['credito', 'creditos', 'credito (r$)', 'valor credito', 'entrada', 'entradas', 'recebimentos'] },
    { chave: 'debito', rotulo: 'Débito (saídas)',
      sinonimos: ['debito', 'debitos', 'debito (r$)', 'valor debito', 'saida', 'saidas', 'pagamentos'] },
    { chave: 'tipo', rotulo: 'Tipo (D ou C)', ajuda: 'Só se o valor vier sem sinal e outra coluna disser se é débito ou crédito.',
      sinonimos: ['tipo', 'd/c', 'c/d', 'dc', 'natureza', 'sinal', 'tipo lancamento', 'tipo de lancamento', 'credito/debito', 'debito/credito'] }
  ];

  // ---------- texto ----------
  function maiusculo(t) {
    return String(t == null ? '' : t).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ /g, ' ').toUpperCase();
  }
  function soDigitos(t) { return String(t || '').replace(/\D/g, ''); }
  function cpfValido(d) {
    if (!/^\d{11}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
    for (var t = 9; t < 11; t++) {
      var s = 0;
      for (var i = 0; i < t; i++) s += Number(d[i]) * (t + 1 - i);
      if (((s * 10) % 11) % 10 !== Number(d[t])) return false;
    }
    return true;
  }
  function cnpjValido(d) {
    if (!/^\d{14}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
    var pesos = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    for (var t = 12; t < 14; t++) {
      var s = 0;
      for (var i = 0; i < t; i++) s += Number(d[i]) * pesos[i + 13 - t];
      var r = s % 11;
      if ((r < 2 ? 0 : 11 - r) !== Number(d[t])) return false;
    }
    return true;
  }
  function formatarDoc(d) {
    if (!d) return '';
    if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    return d;
  }

  // Palavras que o banco põe antes do nome (tiradas só do começo)
  var PREFIXOS = lista('TAR PAG PAGTO PGTO PAGAMENTO PAGAMENTOS PAGTOS PAGO BOLETO BOLETOS TIT TITULO TITULOS DEB DEBITO CRED CREDITO ' +
    'AUT AUTOM AUTOMATICO AUTOMATICA CONV CONVENIO COMPRA COMPRAS CARTAO CART ELO VISA MASTER MASTERCARD MAESTRO ELETRON ' +
    'ELETRONICO ELETRONICA INT INTERNET SISPAG OUTROS OUTRA OUTRAS BANCOS IF EMIT EMITIDO EMITIDA DES REM PARA DE DA DO DOS ' +
    'NO NA EM VIA PELO PELA ENVIO AGENDADO AGENDAMENTO COBRANCA LIQUIDACAO LIQ ENVIADA ENVIADO RECEBIDA RECEBIDO RECEB ' +
    'TRANSFERENCIA TRANSF TEF TED DOC PIX QRS QR CODE CODIGO CP OP OPERACAO MESMA TITULARIDADE CONTA CONTAS EFETUADO REALIZADO ' +
    'DEBITADO CREDITADO DEPOSITADO');
  // Palavras que não ajudam a dizer quem é (tiradas de qualquer lugar)
  var SEMPRE = lista('PIX QRS TED DOC TEF SISPAG TRANSF TRANSFERENCIA ENVIADO ENVIADA RECEBIDO RECEBIDA PARC PARCELA CP CPF CNPJ AGENCIA AG CC BCO');
  var LIGACOES = lista('DE DA DO DOS DAS E EM');
  function lista(t) { var o = {}; t.split(/\s+/).forEach(function (p) { if (p) o[p] = true; }); return o; }

  // Transforma o histórico do banco numa "chave do favorecido".
  // Devolve {chave, doc, parcela:{atual,total}|null}
  function normalizarHistorico(texto) {
    var s = maiusculo(texto);
    var doc = '';
    function guardaDoc(d) { if (!doc) doc = d; }
    // CNPJ e CPF escritos com pontos
    s = s.replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, function (m) { var d = soDigitos(m); if (cnpjValido(d)) guardaDoc(d); return ' '; });
    s = s.replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, function (m) { var d = soDigitos(m); if (cpfValido(d)) guardaDoc(d); return ' '; });
    // CPF mascarado do Pix (***.456.789-** ou •••.456.789-••)
    s = s.replace(/[*•X]{3}\.?\d{3}\.?\d{3}-?[*•X]{2}/g, ' ');
    // números soltos de 14 ou 11 dígitos que sejam CNPJ ou CPF de verdade
    s = s.replace(/\b\d{14}\b|\b\d{11}\b/g, function (m) { if (m.length === 14 ? cnpjValido(m) : cpfValido(m)) guardaDoc(m); return ' '; });
    // parcela: PARC 03/10, PARCELA 3 DE 10
    var parcela = null;
    var mp = s.match(/\bPARC(?:ELA)?\.?\s*(\d{1,3})\s*(?:\/|DE)\s*(\d{1,3})\b/);
    if (mp && +mp[1] >= 1 && +mp[2] >= 2 && +mp[1] <= +mp[2]) parcela = { atual: +mp[1], total: +mp[2] };
    // rabo com banco, agência e conta (Nubank e outros): "... - BCO DO BRASIL (0001) Agência: 1 Conta: 123"
    if (/ - /.test(s)) {
      var partes = s.split(/\s+-\s+/).filter(function (p) {
        return !/AGENCIA|CONTA:|\(\d{3,4}\)/.test(p) && /[A-Z]{2}/.test(p);
      });
      if (partes.length) s = partes.join(' ');
    }
    s = s.replace(/[^A-Z0-9 ]+/g, ' ');
    var palavras = s.split(/\s+/).filter(function (p) { return p && !/\d/.test(p); });
    while (palavras.length && PREFIXOS[palavras[0]]) palavras.shift();
    palavras = palavras.filter(function (p) { return !SEMPRE[p]; });
    while (palavras.length && LIGACOES[palavras[palavras.length - 1]]) palavras.pop();
    while (palavras.length && LIGACOES[palavras[0]] && palavras[0] !== 'DAS') palavras.shift();
    var chave = palavras.slice(0, 4).join(' ');
    if (!chave) {
      chave = maiusculo(texto).replace(/[^A-Z0-9 ]+/g, ' ').split(/\s+/).filter(function (p) { return p && !/\d/.test(p); }).slice(0, 4).join(' ');
    }
    return { chave: chave || 'SEM NOME', doc: doc, parcela: parcela };
  }

  // Nome bonito a partir da chave: "IMOBILIARIA LAR LTDA" vira "Imobiliaria Lar Ltda"
  var SIGLAS = lista('DAS DARF GPS FGTS INSS ISS ICMS IPTU IPVA IOF CPFL CEMIG ENEL SABESP COPASA CEDAE EMBASA SANEPAR TIM OI NET SKY SP RJ MG PR SC RS BA GO DF ME EPP SA MP CRC CRA CREA OAB CNPJ CPF TV');
  function nomeBonito(chave) {
    return String(chave || '').split(' ').map(function (p, i) {
      if (SIGLAS[p]) return p;
      if (i > 0 && LIGACOES[p]) return p.toLowerCase();
      return p.charAt(0) + p.slice(1).toLowerCase();
    }).join(' ');
  }

  // ---------- categoria sugerida (só sugestão) ----------
  var CATEGORIAS = [
    { nome: 'Impostos e taxas', curto: 'Imposto', palavras: ['DAS', 'SIMPLES NACIONAL', 'DARF', 'GPS', 'INSS', 'FGTS', 'GRF', 'ICMS', 'ISS', 'ISSQN', 'IPTU', 'IPVA', 'GARE', 'TRIBUTO', 'TRIBUTOS', 'IMPOSTO', 'IMPOSTOS', 'RECEITA FEDERAL', 'PREFEITURA', 'SEFAZ', 'DCTFWEB', 'ESOCIAL', 'DETRAN', 'ALVARA', 'TAXA DE FUNCIONAMENTO'] },
    { nome: 'Aluguel e condomínio', curto: 'Aluguel', palavras: ['ALUGUEL', 'ALUGUEIS', 'LOCACAO', 'IMOBILIARIA', 'IMOB', 'CONDOMINIO', 'COND'] },
    { nome: 'Energia elétrica', curto: 'Energia', palavras: ['ENERGIA', 'LUZ', 'CEMIG', 'ENEL', 'CPFL', 'LIGHT', 'COPEL', 'CELESC', 'ELETROPAULO', 'COELBA', 'EQUATORIAL', 'ENERGISA', 'NEOENERGIA', 'CELPE', 'COSERN', 'RGE', 'ELEKTRO', 'EDP', 'CEEE', 'AMAZONAS ENERGIA'] },
    { nome: 'Água e esgoto', curto: 'Água', palavras: ['AGUA', 'AGUAS', 'ESGOTO', 'SABESP', 'SANEPAR', 'COPASA', 'CEDAE', 'EMBASA', 'CAESB', 'CAGECE', 'COMPESA', 'SANEAGO', 'CORSAN', 'CASAN', 'SAAE', 'DAE', 'CESAN', 'DMAE'] },
    { nome: 'Internet e telefone', curto: 'Internet/telefone', palavras: ['VIVO', 'CLARO', 'TIM', 'OI', 'NET', 'INTERNET', 'TELEFONE', 'TELEFONICA', 'TELEFONIA', 'NEXTEL', 'ALGAR', 'BRISANET', 'SKY', 'EMBRATEL', 'FIBRA', 'TELECOM', 'CELULAR'] },
    { nome: 'Folha e salários', curto: 'Salário', palavras: ['SALARIO', 'SALARIOS', 'FOLHA', 'PRO LABORE', 'PROLABORE', 'ADIANTAMENTO', 'FERIAS', 'RESCISAO', 'VALE TRANSPORTE', 'VALE REFEICAO', 'VALE ALIMENTACAO', 'ALELO', 'SODEXO', 'TICKET', 'PLURIXX', 'FLASH BENEFICIOS'] },
    { nome: 'Contabilidade', curto: 'Contabilidade', palavras: ['CONTABIL', 'CONTABILIDADE', 'CONTADOR', 'CONTADORES', 'ESCRITORIO CONTABIL', 'HONORARIOS CONTABEIS'] },
    { nome: 'Tarifas bancárias', curto: 'Tarifa', palavras: ['TARIFA', 'TARIFAS', 'TAR', 'CESTA', 'PACOTE SERVICOS', 'PACOTE DE SERVICOS', 'MANUTENCAO CONTA', 'IOF', 'ANUIDADE CARTAO'] },
    { nome: 'Seguros', curto: 'Seguro', palavras: ['SEGURO', 'SEGUROS', 'SEGURADORA', 'PORTO SEGURO', 'MAPFRE', 'TOKIO MARINE', 'ALLIANZ', 'LIBERTY'] },
    { nome: 'Sistemas e assinaturas', curto: 'Assinatura', palavras: ['NETFLIX', 'SPOTIFY', 'GOOGLE', 'MICROSOFT', 'ADOBE', 'CANVA', 'AMAZON PRIME', 'AWS', 'APPLE', 'DROPBOX', 'ZOOM', 'CONTA AZUL', 'CONTAAZUL', 'OMIE', 'NIBO', 'BLING', 'TINY', 'HOTMART', 'RD STATION', 'ASSINATURA', 'MENSALIDADE', 'SOFTWARE', 'SISTEMA', 'SISTEMAS', 'LICENCA', 'HOSPEDAGEM', 'DOMINIO', 'OPENAI', 'CHATGPT', 'LOCAWEB', 'HOSTGATOR', 'GODADDY', 'YOUTUBE', 'DISNEY', 'GLOBOPLAY', 'MERCADO LIVRE', 'SHOPIFY', 'NUVEMSHOP', 'TRAY'] }
  ];
  var NAO_E_CLIENTE = ['RENDIMENTO', 'RENDIMENTOS', 'ESTORNO', 'RESGATE', 'APLICACAO', 'DEVOLUCAO', 'JUROS', 'CASHBACK', 'REEMBOLSO'];
  var PALAVRAS_ANUAIS = ['SEGURO', 'SEGUROS', 'SEGURADORA', 'IPVA', 'IPTU', 'ANUIDADE', 'LICENCIAMENTO', 'RENOVACAO', 'CRC', 'CRA', 'CREA', 'OAB', 'ALVARA', 'TAXA DE FUNCIONAMENTO', 'CERTIFICADO DIGITAL', 'DOMINIO', 'ANUAL', 'DPVAT', 'BOMBEIROS', 'TFE', 'TLF'];
  function temPalavra(texto, palavras) {
    var t = ' ' + maiusculo(texto).replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
    for (var i = 0; i < palavras.length; i++) if (t.indexOf(' ' + palavras[i] + ' ') >= 0) return palavras[i];
    return null;
  }
  // texto: histórico original (ou vários juntos). Devolve {nome, curto}
  function sugerirCategoria(texto, tipo, doc) {
    for (var i = 0; i < CATEGORIAS.length; i++) {
      if (temPalavra(texto, CATEGORIAS[i].palavras)) return { nome: CATEGORIAS[i].nome, curto: CATEGORIAS[i].curto };
    }
    if (tipo === 'receber') return temPalavra(texto, NAO_E_CLIENTE) ? { nome: 'Outras receitas', curto: '' } : { nome: 'Recebimento de clientes', curto: 'Recebimento' };
    if (doc && doc.length === 11) return { nome: 'Folha e salários', curto: 'Pagamento' };
    return { nome: 'Fornecedores', curto: '' };
  }
  var LISTA_CATEGORIAS = CATEGORIAS.map(function (c) { return c.nome; }).concat(['Fornecedores', 'Recebimento de clientes', 'Outras receitas', 'Outras despesas']);

  // ---------- meses ----------
  function mesIdx(mes) { var p = mes.split('-'); return +p[0] * 12 + (+p[1] - 1); }
  function idxMes(i) { var a = Math.floor(i / 12), m = i % 12 + 1; return a + '-' + (m < 10 ? '0' : '') + m; }
  function somarMeses(mes, n) { return idxMes(mesIdx(mes) + n); }
  function diasNoMes(mes) { var p = mes.split('-'); return new Date(Date.UTC(+p[0], +p[1], 0)).getUTCDate(); }
  function mesValido(m) { return typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m); }
  function mesQueVem(hojeIso) {
    var d = hojeIso ? hojeIso.slice(0, 7) : null;
    if (!d) { var h = new Date(); d = h.getFullYear() + '-' + (h.getMonth() < 9 ? '0' : '') + (h.getMonth() + 1); }
    return somarMeses(d, 1);
  }
  function mediana(lista) {
    if (!lista.length) return null;
    var o = lista.slice().sort(function (a, b) { return a - b; }), m = Math.floor(o.length / 2);
    return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
  }
  function media(lista) { return lista.length ? lista.reduce(function (s, x) { return s + x; }, 0) / lista.length : null; }

  // ---------- ler o extrato ----------
  function prepararAba(linhas) {
    var cab = C.acharCabecalho(linhas, CAMPOS);
    var cabecalho = (linhas[cab] || []).map(function (v) { return String(v == null ? '' : v); });
    var escolha = C.detectarColunas(cabecalho, CAMPOS);
    return { inicio: cab, cabecalho: cabecalho, escolha: escolha };
  }
  function melhorAba(abas) {
    var melhor = 0, nota = -1;
    abas.forEach(function (a, i) {
      var p = prepararAba(a.linhas), r = lerMovimentos(a.linhas, p.inicio, p.escolha, '');
      var n = r.movs.length * 10 + (p.escolha.data >= 0 ? 5 : 0);
      if (n > nota) { nota = n; melhor = i; }
    });
    return melhor;
  }
  function faltandoExtrato(escolha) {
    var f = C.faltando(escolha, CAMPOS).map(function (c) { return c.rotulo; });
    if (!(escolha.valor >= 0 || escolha.credito >= 0 || escolha.debito >= 0)) f.push('Valor (ou Crédito e Débito)');
    return f;
  }
  function sinalDoTipo(t) {
    var s = C.simples(t);
    if (!s) return 0;
    if (/^(d|deb|debito|saida|s|-)$/.test(s) || /^debito|^saida/.test(s)) return -1;
    if (/^(c|cred|credito|entrada|e|\+)$/.test(s) || /^credito|^entrada/.test(s)) return 1;
    return 0;
  }
  // Devolve {movs:[{data, historico, valor, conta}], lidas, ignoradas:{saldo,total,semData,semHistorico,zero}, exemplos, todosPositivos}
  function lerMovimentos(linhas, inicio, escolha, conta) {
    var r = { movs: [], lidas: 0, ignoradas: { saldo: 0, total: 0, semData: 0, semHistorico: 0, zero: 0 }, exemplos: { saldo: [], total: [], semData: [], semHistorico: [], zero: [] }, todosPositivos: false };
    if (!(escolha.data >= 0) || !(escolha.historico >= 0)) return r;
    function exemplo(tipo, num, l) {
      if (r.exemplos[tipo].length < 5) r.exemplos[tipo].push('linha ' + num + ': ' + l.filter(function (v) { return !C.vazio(v); }).join(' | ').slice(0, 90));
    }
    var negativos = 0;
    for (var i = inicio + 1; i < linhas.length; i++) {
      var l = linhas[i] || [];
      if (!l.some(function (v) { return !C.vazio(v); })) continue;
      r.lidas++;
      var num = i + 1, hist = String(l[escolha.historico] == null ? '' : l[escolha.historico]).trim();
      if (V.ehSaldo(hist) || l.some(function (v) { return typeof v === 'string' && V.ehSaldo(v); })) { r.ignoradas.saldo++; exemplo('saldo', num, l); continue; }
      if (V.ehTotal(l)) { r.ignoradas.total++; exemplo('total', num, l); continue; }
      var iso = C.data(l[escolha.data]);
      if (!iso) { r.ignoradas.semData++; exemplo('semData', num, l); continue; }
      if (!hist) { r.ignoradas.semHistorico++; exemplo('semHistorico', num, l); continue; }
      var v = null;
      if (escolha.valor >= 0) {
        v = C.valor(l[escolha.valor]);
        if (v != null && escolha.tipo >= 0) { var sg = sinalDoTipo(l[escolha.tipo]); if (sg) v = sg * Math.abs(v); }
      }
      if (!v && (escolha.credito >= 0 || escolha.debito >= 0)) {
        var cr = escolha.credito >= 0 ? C.valor(l[escolha.credito]) : null, db = escolha.debito >= 0 ? C.valor(l[escolha.debito]) : null;
        v = C.arred((cr ? Math.abs(cr) : 0) - (db ? Math.abs(db) : 0));
      }
      if (!v) { r.ignoradas.zero++; exemplo('zero', num, l); continue; }
      if (v < 0) negativos++;
      r.movs.push({ data: iso, historico: hist, valor: v, conta: conta || '' });
    }
    r.todosPositivos = r.movs.length >= 5 && negativos === 0;
    return r;
  }

  // OFX: o Volume só conta lançamentos; aqui precisamos de cada um (data, valor e histórico)
  function tag(texto, nome) {
    var m = texto.match(new RegExp('<' + nome + '>\\s*([^<\\r\\n]*)', 'i'));
    return m ? m[1].trim() : '';
  }
  function lerOFX(texto, nomeConta) {
    var r = { movs: [], contas: [], lidas: 0, ignoradas: { saldo: 0, total: 0, semData: 0, semHistorico: 0, zero: 0 }, exemplos: { saldo: [], total: [], semData: [], semHistorico: [], zero: [] }, todosPositivos: false };
    var blocos = texto.split(/<(?:CC)?STMTRS>/i);
    if (blocos.length < 2) blocos = ['', texto];
    for (var b = 1; b < blocos.length; b++) {
      var bloco = blocos[b], acct = tag(bloco, 'ACCTID');
      var conta = (nomeConta || 'OFX') + (blocos.length > 2 ? ' conta ' + (acct || b) : '');
      var trans = bloco.split(/<STMTTRN>/i).slice(1);
      if (trans.length) r.contas.push(conta);
      trans.forEach(function (t, k) {
        t = t.split(/<\/STMTTRN>/i)[0];
        r.lidas++;
        var dt = String(tag(t, 'DTPOSTED')).match(/^(\d{4})(\d{2})(\d{2})/);
        var iso = dt ? C.data(dt[1] + '-' + dt[2] + '-' + dt[3]) : null;
        var hist = tag(t, 'MEMO') || tag(t, 'NAME');
        if (!iso) { r.ignoradas.semData++; if (r.exemplos.semData.length < 5) r.exemplos.semData.push('lançamento ' + (k + 1) + ': ' + hist); return; }
        if (V.ehSaldo(hist)) { r.ignoradas.saldo++; if (r.exemplos.saldo.length < 5) r.exemplos.saldo.push(C.dataBR(iso) + ': ' + hist); return; }
        if (!hist) { r.ignoradas.semHistorico++; return; }
        var v = C.valor(tag(t, 'TRNAMT'));
        if (!v) { r.ignoradas.zero++; if (r.exemplos.zero.length < 5) r.exemplos.zero.push(C.dataBR(iso) + ': ' + hist); return; }
        r.movs.push({ data: iso, historico: hist, valor: v, conta: conta });
      });
    }
    return r;
  }

  // ---------- achar recorrentes ----------
  function detectarPeriodo(difs) {
    if (!difs.length) return null;
    var med = mediana(difs), p = null, dist = Infinity;
    [1, 2, 3, 6, 12].forEach(function (c) { var d = Math.abs(med - c); if (d < dist) { dist = d; p = c; } });
    if (dist > Math.max(0.5, p * 0.2)) return null;
    var tol = p >= 3 ? 1 : 0;
    var regulares = difs.filter(function (d) { return Math.abs(d - p) <= tol; }).length;
    return regulares / difs.length >= 0.5 ? p : null;
  }
  function maisComum(contagem) {
    var melhor = '', n = -1;
    Object.keys(contagem).forEach(function (k) { if (contagem[k] > n) { n = contagem[k]; melhor = k; } });
    return melhor;
  }

  // movs: [{data, historico, valor, conta}]. opcoes: {minMeses}
  // Devolve {itens:[...], avulsos:[...], mesInicio, mesFinal, totalMovs}
  function acharRecorrentes(movs, opcoes) {
    opcoes = opcoes || {};
    var minMeses = Math.max(2, Math.round(Number(opcoes.minMeses) || MIN_MESES_PADRAO));
    var grupos = {}, mesInicio = null, mesFinal = null;
    movs.forEach(function (m) {
      var mes = m.data.slice(0, 7);
      if (!mesInicio || mes < mesInicio) mesInicio = mes;
      if (!mesFinal || mes > mesFinal) mesFinal = mes;
      var n = normalizarHistorico(m.historico), tipo = m.valor < 0 ? 'pagar' : 'receber';
      var gk = (tipo === 'pagar' ? 'P:' : 'R:') + n.chave;
      var g = grupos[gk] || (grupos[gk] = { tipo: tipo, chaves: {}, docs: {}, movs: [] });
      g.chaves[n.chave] = (g.chaves[n.chave] || 0) + 1;
      if (n.doc) g.docs[n.doc] = (g.docs[n.doc] || 0) + 1;
      g.movs.push({ data: m.data, historico: m.historico, valor: m.valor, conta: m.conta, parcela: n.parcela });
    });
    // junta grupos do mesmo CPF ou CNPJ (o banco escreveu o nome de jeitos diferentes)
    var porDoc = {};
    Object.keys(grupos).sort(function (a, b) { return grupos[b].movs.length - grupos[a].movs.length; }).forEach(function (gk) {
      var g = grupos[gk], doc = maisComum(g.docs);
      if (!doc) return;
      var dk = g.tipo + ':' + doc;
      if (porDoc[dk] && porDoc[dk] !== gk) {
        var alvo = grupos[porDoc[dk]];
        alvo.movs = alvo.movs.concat(g.movs);
        Object.keys(g.chaves).forEach(function (k) { alvo.chaves[k] = (alvo.chaves[k] || 0) + g.chaves[k]; });
        Object.keys(g.docs).forEach(function (k) { alvo.docs[k] = (alvo.docs[k] || 0) + g.docs[k]; });
        delete grupos[gk];
      } else porDoc[dk] = gk;
    });

    var itens = [], avulsos = [];
    Object.keys(grupos).forEach(function (gk) {
      var g = grupos[gk];
      g.movs.sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });
      var chave = maisComum(g.chaves), doc = maisComum(g.docs);
      var porMes = {};
      g.movs.forEach(function (m) {
        var mes = m.data.slice(0, 7), pm = porMes[mes] || (porMes[mes] = { soma: 0, n: 0, dia: +m.data.slice(8, 10) });
        pm.soma += Math.abs(m.valor); pm.n++;
      });
      var meses = Object.keys(porMes).sort();
      var difs = [];
      for (var i = 1; i < meses.length; i++) difs.push(mesIdx(meses[i]) - mesIdx(meses[i - 1]));
      var p = meses.length >= 2 ? detectarPeriodo(difs) : null;
      var parcelas = null;
      g.movs.forEach(function (m) {
        if (!m.parcela) return;
        if (!parcelas || m.parcela.atual > parcelas.atual) parcelas = { atual: m.parcela.atual, total: m.parcela.total };
      });
      var textos = g.movs.map(function (m) { return m.historico; });
      var possivelAnual = meses.length === 1 && !!temPalavra(textos.join(' '), PALAVRAS_ANUAIS);
      var valores0 = meses.map(function (m) { return porMes[m].soma; }), med0 = mediana(valores0);
      var fixo0 = valores0.every(function (v) { return med0 > 0 && Math.abs(v - med0) / med0 <= TOLERANCIA; });
      // com menos meses que o mínimo, só aceita semestral ou anual de valor fixo, ou parcelado
      var recorrente = !!p && (meses.length >= minMeses || (meses.length >= 2 && ((p >= 6 && fixo0) || !!parcelas)));
      var total = C.arred(g.movs.reduce(function (s, m) { return s + Math.abs(m.valor); }, 0));
      if (!recorrente && !possivelAnual) {
        avulsos.push({ id: gk, nome: nomeBonito(chave), tipo: g.tipo, vezes: g.movs.length, meses: meses, total: total, exemplo: textos[textos.length - 1] });
        return;
      }
      if (possivelAnual) p = 12;
      var valores = meses.map(function (m) { return C.arred(porMes[m].soma); });
      var med = mediana(valores);
      var variavel = valores.some(function (v) { return med > 0 && Math.abs(v - med) / med > TOLERANCIA; });
      var ultimoMes = meses[meses.length - 1];
      var ult3 = valores.slice(-3);
      var dia = Math.round(mediana(meses.map(function (m) { return porMes[m].dia; })));
      var vezesPorMes = mediana(meses.map(function (m) { return porMes[m].n; }));
      var parado = mesIdx(mesFinal) - mesIdx(ultimoMes);
      var terminou = !!(parcelas && parcelas.atual >= parcelas.total);
      var talvezCancelado = !possivelAnual && !terminou && parado >= p + 1;
      var contas = {};
      g.movs.forEach(function (m) { if (m.conta) contas[m.conta] = (contas[m.conta] || 0) + 1; });
      var cat = sugerirCategoria(textos.join(' ') + ' ' + chave, g.tipo, doc);
      var nome = nomeBonito(chave);
      var descricao = cat.curto && C.simples(nome).indexOf(C.simples(cat.curto)) < 0 ? cat.curto + ' ' + nome : nome;
      var valorSug = C.arred(variavel ? media(ult3) : valores[valores.length - 1]);
      var it = {
        id: gk, tipo: g.tipo, chave: chave, doc: doc, conta: maisComum(contas),
        vezes: g.movs.length, meses: meses, valoresMes: valores, ultimoMes: ultimoMes,
        ultimoValor: valores[valores.length - 1], media: C.arred(media(valores)), mediaUlt3: C.arred(media(ult3)),
        variavel: variavel, vezesPorMes: vezesPorMes, periodoDetectado: p, possivelAnual: possivelAnual,
        talvezCancelado: talvezCancelado, mesesSemAparecer: parado,
        parcelas: parcelas ? { atual: parcelas.atual, total: parcelas.total, restantes: Math.max(0, parcelas.total - parcelas.atual) } : null,
        terminou: terminou, exemplos: textos.slice(-3), categoriaSugerida: cat.nome,
        // campos que a pessoa revisa
        incluir: !(talvezCancelado || terminou || possivelAnual),
        nome: nome, descricao: descricao, categoria: cat.nome, dia: dia, valor: valorSug,
        periodicidade: NOME_PERIODO[p], obs: ''
      };
      it.sugestao = { incluir: it.incluir, nome: it.nome, descricao: it.descricao, categoria: it.categoria, dia: it.dia, valor: it.valor, periodicidade: it.periodicidade, tipo: it.tipo };
      it.situacao = situacao(it);
      itens.push(it);
    });
    itens.sort(function (a, b) { return a.tipo !== b.tipo ? (a.tipo === 'pagar' ? -1 : 1) : b.valor - a.valor; });
    avulsos.sort(function (a, b) { return b.vezes - a.vezes || b.total - a.total; });
    return { itens: itens, avulsos: avulsos, mesInicio: mesInicio, mesFinal: mesFinal, totalMovs: movs.length };
  }
  function situacao(it) {
    var s = [];
    if (it.possivelAnual) s.push('apareceu 1 vez: confira se é anual');
    if (it.talvezCancelado) s.push('parou de aparecer há ' + it.mesesSemAparecer + (it.mesesSemAparecer === 1 ? ' mês' : ' meses') + ': talvez cancelado');
    if (it.terminou) s.push('parcelado: terminou (' + it.parcelas.atual + ' de ' + it.parcelas.total + ')');
    else if (it.parcelas) s.push('parcelado: vi a ' + it.parcelas.atual + ' de ' + it.parcelas.total + ', faltam ' + it.parcelas.restantes);
    if (it.variavel) s.push('valor variável: sugeri a média dos últimos 3');
    if (it.vezesPorMes >= 2) s.push('aparece ' + it.vezesPorMes + ' vezes por mês: o valor é a soma do mês');
    return s;
  }

  // ---------- regras lembradas por cliente ----------
  var EDITAVEIS = ['incluir', 'nome', 'descricao', 'categoria', 'dia', 'valor', 'periodicidade', 'tipo'];
  function aplicarRegras(itens, regras) {
    regras = regras || {};
    itens.forEach(function (it) {
      var r = regras[it.id];
      if (!r) return;
      EDITAVEIS.forEach(function (k) { if (r[k] !== undefined) it[k] = r[k]; });
    });
    return itens;
  }
  // Guarda a mudança só se for diferente da sugestão (assim a regra fica pequena)
  function lembrar(regras, it, campo, valor) {
    var atual = regras[it.id] || {};
    var igualSug = it.sugestao && JSON.stringify(it.sugestao[campo]) === JSON.stringify(valor);
    if (igualSug) delete atual[campo]; else atual[campo] = valor;
    if (Object.keys(atual).length) regras[it.id] = atual; else delete regras[it.id];
    it[campo] = valor;
  }
  function validarItem(it) {
    var e = [];
    if (!String(it.nome || '').trim()) e.push('sem nome');
    if (!(it.valor > 0)) e.push('valor zerado');
    if (!(it.dia >= 1 && it.dia <= 31)) e.push('dia fora de 1 a 31');
    if (!PERIODOS[it.periodicidade]) e.push('periodicidade');
    return e;
  }

  // ---------- gerar as ocorrências (uma linha por vencimento) ----------
  // Devolve [{item, mes, vencimento, valor, parcela}]
  function gerarOcorrencias(itens, mesInicial, nMeses, tipos) {
    var ini = mesIdx(mesInicial), fim = ini + Math.max(1, Math.round(nMeses || MESES_GERAR_PADRAO));
    var out = [];
    itens.forEach(function (it) {
      if (!it.incluir) return;
      if (tipos && tipos.indexOf(it.tipo) < 0) return;
      var p = PERIODOS[it.periodicidade] || 1;
      var base = it.ultimoMes ? mesIdx(it.ultimoMes) : ini - p;
      var m = base + p;
      while (m < ini) m += p;
      for (; m < fim; m += p) {
        var parcela = '';
        if (it.parcelas && it.parcelas.total) {
          var n = it.parcelas.atual + Math.round((m - base) / p);
          if (n > it.parcelas.total) break;
          parcela = n + '/' + it.parcelas.total;
        }
        var mes = idxMes(m), dia = Math.min(Math.max(1, Math.round(it.dia || 1)), diasNoMes(mes));
        out.push({ item: it, mes: mes, vencimento: mes + '-' + (dia < 10 ? '0' : '') + dia, valor: C.arred(it.valor), parcela: parcela });
      }
    });
    out.sort(function (a, b) { return a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : a.item.nome.localeCompare(b.item.nome, 'pt-BR'); });
    return out;
  }

  // ---------- o modelo de importação ----------
  var CAMPOS_MODELO = [
    { chave: 'vencimento', rotulo: 'Data de vencimento', data: true,
      sinonimos: ['vencimento', 'data de vencimento', 'data vencimento', 'data do vencimento', 'dt vencimento', 'dt venc', 'venc', 'vence em', 'data prevista', 'previsao', 'data de previsao', 'data prevista de pagamento', 'data esperada', 'data'],
      evitar: ['pagamento', 'pago', 'baixa', 'quitacao', 'recebimento', 'competencia', 'emissao', 'cadastro'] },
    { chave: 'competencia', rotulo: 'Data de competência (mesma do vencimento)', data: true,
      sinonimos: ['competencia', 'data de competencia', 'data competencia', 'mes de competencia', 'data de emissao', 'emissao', 'data do documento', 'data do lancamento', 'data de lancamento'] },
    { chave: 'valor', rotulo: 'Valor', valor: true,
      sinonimos: ['valor', 'valor (r$)', 'valor r$', 'valor total', 'valor do lancamento', 'valor da parcela', 'valor original', 'valor previsto', 'valor bruto', 'montante', 'vlr'],
      evitar: ['pago', 'recebido', 'desconto', 'juros', 'multa', 'acrescimo', 'liquido', 'taxa'] },
    { chave: 'descricao', rotulo: 'Descrição',
      sinonimos: ['descricao', 'historico', 'descricao do lancamento', 'descricao da conta', 'titulo', 'nome do lancamento', 'referencia'] },
    { chave: 'contato', rotulo: 'Fornecedor ou cliente',
      sinonimos: ['fornecedor/cliente', 'cliente/fornecedor', 'fornecedor ou cliente', 'cliente ou fornecedor', 'contato', 'nome do contato', 'favorecido', 'pagador/recebedor', 'razao social', 'pessoa', 'nome'] },
    { chave: 'fornecedor', rotulo: 'Fornecedor (só nas contas a pagar)',
      sinonimos: ['fornecedor', 'nome do fornecedor', 'credor', 'beneficiario', 'recebedor'] },
    { chave: 'cliente', rotulo: 'Cliente (só nas contas a receber)',
      sinonimos: ['cliente', 'nome do cliente', 'pagador', 'sacado', 'devedor'] },
    { chave: 'documento', rotulo: 'CPF ou CNPJ',
      sinonimos: ['cpf/cnpj', 'cnpj/cpf', 'cpf ou cnpj', 'cnpj ou cpf', 'cpf', 'cnpj', 'documento do contato', 'documento do fornecedor', 'documento do cliente'] },
    { chave: 'categoria', rotulo: 'Categoria',
      sinonimos: ['categoria', 'categoria financeira', 'plano de contas', 'conta contabil', 'classificacao', 'natureza financeira', 'subcategoria'] },
    { chave: 'centroCusto', rotulo: 'Centro de custo (não vem do extrato)',
      sinonimos: ['centro de custo', 'centro de custos', 'centro de resultado', 'centro custo'] },
    { chave: 'observacoes', rotulo: 'Observações',
      sinonimos: ['observacoes', 'observacao', 'obs', 'informacoes adicionais', 'comentario', 'comentarios', 'anotacoes', 'notas'] },
    { chave: 'formaPagamento', rotulo: 'Forma de pagamento (não vem do extrato)',
      sinonimos: ['forma de pagamento', 'forma pagamento', 'meio de pagamento', 'forma de recebimento', 'forma de pagamento/recebimento', 'tipo de pagamento'] },
    { chave: 'conta', rotulo: 'Conta financeira (nome da conta do extrato)',
      sinonimos: ['conta financeira', 'conta bancaria', 'conta', 'banco', 'conta de pagamento', 'conta de recebimento', 'conta caixa', 'caixa/banco'] },
    { chave: 'tipo', rotulo: 'Tipo (pagar ou receber)',
      sinonimos: ['tipo', 'tipo de lancamento', 'tipo do lancamento', 'natureza', 'receita/despesa', 'despesa/receita', 'pagar/receber', 'receber/pagar', 'operacao', 'tipo de conta'] },
    { chave: 'parcela', rotulo: 'Parcela (ex.: 3/10)',
      sinonimos: ['parcela', 'parcelas', 'numero da parcela', 'n parcela', 'no parcela'] },
    { chave: 'periodicidade', rotulo: 'Periodicidade (mensal, anual...)', naoSugerir: true,
      sinonimos: ['periodicidade', 'recorrencia', 'frequencia', 'repeticao', 'repetir', 'intervalo'] }
  ];
  function campoModelo(chave) { return CAMPOS_MODELO.filter(function (c) { return c.chave === chave; })[0] || null; }
  function assinatura(cabecalho) {
    return cabecalho.map(function (c) { return C.simples(c); }).join('|').replace(/\|+$/, '');
  }
  // ---------- o modelo de importação do Conta Azul (reconhecido pelo cabeçalho) ----------
  // Aba "Dados", cabeçalho na linha 1, valor positivo = receita e negativo = despesa.
  var ASSINATURA_CONTA_AZUL = 'data de competencia|data de vencimento|data de pagamento|valor|categoria|descricao|cliente/fornecedor|cnpj/cpf cliente/fornecedor|centro de custo|observacoes';
  var MAPA_CONTA_AZUL = ['competencia', 'vencimento', null, 'valor', 'categoria', 'descricao', 'contato', 'documento', null, null];
  function ehModeloContaAzul(cabecalho) { return assinatura(cabecalho || []) === ASSINATURA_CONTA_AZUL; }
  function mapaContaAzul() {
    return MAPA_CONTA_AZUL.map(function (c) { return c ? { modo: 'campo', campo: c } : { modo: 'branco' }; });
  }
  // Regra do Conta Azul: sem ' " ! @ # % ¨ & * ( ) ª º § + _ - ? ° [ { } ] : ; e sem espaços sobrando
  var PROIBIDOS_CONTA_AZUL = /['"!@#%¨&*()ªº§+_\-?°\[\]{}:;]/g;
  function limparTextoContaAzul(t) {
    return semFormula(String(t == null ? '' : t).replace(PROIBIDOS_CONTA_AZUL, ' ').replace(/[\s ]+/g, ' ').trim());
  }
  // Nenhum texto pode virar fórmula no Excel
  function semFormula(t) { return String(t).replace(/^[=\s]+/, '').trim(); }

  // Para cada coluna do modelo: {modo:'campo', campo} | {modo:'branco'} | {modo:'fixo', valor}
  function detectarMapaModelo(cabecalho) {
    if (ehModeloContaAzul(cabecalho)) return mapaContaAzul();
    return cabecalho.map(function (nome) {
      if (C.vazio(nome)) return { modo: 'branco' };
      var melhor = null, nota = 0;
      CAMPOS_MODELO.forEach(function (c) {
        var n = C.notaColuna(nome, c);
        if (n > nota) { nota = n; melhor = c; }
      });
      if (!melhor || nota < 60) return { modo: 'branco' };
      if (melhor.naoSugerir) return { modo: 'branco', reconhecido: melhor.chave };
      return { modo: 'campo', campo: melhor.chave };
    });
  }
  function notaCabecalhoModelo(linha) {
    var n = 0;
    (linha || []).forEach(function (v) {
      if (typeof v !== 'string' || !v.trim() || C.data(v) || C.valor(v) != null) return;
      var m = 0;
      CAMPOS_MODELO.forEach(function (c) { m = Math.max(m, C.notaColuna(v, c)); });
      if (m >= 60) n++;
    });
    return n;
  }
  // linhas com índice de linha verdadeiro da aba (linhas vazias ficam como [])
  function analisarAbaModelo(aba) {
    var melhor = -1, nota = 0;
    for (var i = 0; i < Math.min(aba.linhas.length, 40); i++) {
      var n = notaCabecalhoModelo(aba.linhas[i]);
      if (n > nota) { nota = n; melhor = i; }
    }
    if (melhor < 0) return { linhaCab: -1, nota: 0, cabecalho: [], exemplo: null };
    var cab = aba.linhas[melhor].map(function (v) { return String(v == null ? '' : v).trim(); });
    while (cab.length && !cab[cab.length - 1]) cab.pop();
    return completarAnalise(aba, melhor, cab, nota);
  }
  // Linhas de exemplo (todas as que estão abaixo do cabeçalho) e as células do cabeçalho
  function completarAnalise(aba, linhaCab, cab, nota) {
    var brutas = aba.brutas || [];
    var exemplos = brutas.slice(linhaCab + 1, linhaCab + 21).filter(function (l) { return l && l.some(function (c) { return c && !C.vazio(c.v); }); });
    return { linhaCab: linhaCab, nota: nota, cabecalho: cab, exemplo: exemplos[0] || null, exemplos: exemplos,
      celulasCab: brutas[linhaCab] || [], linhasAbaixo: Math.max(0, aba.linhas.length - linhaCab - 1), contaAzul: ehModeloContaAzul(cab) };
  }
  function melhorAbaModelo(modelo) {
    var melhor = 0, nota = -1;
    modelo.abas.forEach(function (a, i) { var n = analisarAbaModelo(a).nota; if (n > nota) { nota = n; melhor = i; } });
    return melhor;
  }

  // Lê o modelo (xlsx, xls ou csv) guardando os bytes para copiar depois
  function lerModelo(XLSX, bytes, nomeArquivo) {
    var ext = String(nomeArquivo || '').toLowerCase().split('.').pop();
    if (ext === 'csv' || ext === 'txt') {
      var texto = C.decodificar(bytes).replace(/^﻿/, '');
      var linhasTexto = texto.split(/\r?\n/);
      var sep = separador(linhasTexto);
      var linhas = linhasTexto.map(function (l) { return l.trim() ? dividirLinha(l, sep) : []; });
      return { tipo: 'csv', nomeArquivo: nomeArquivo, sep: sep, linhasTexto: linhasTexto,
        abas: [{ nome: 'CSV', linhas: linhas, brutas: linhas.map(function (l) { return l.map(function (v) { return { t: 's', v: v }; }); }) }] };
    }
    var livro = XLSX.read(bytes, { type: 'array', cellNF: true, cellDates: false });
    return { tipo: 'xlsx', ext: ext === 'xls' ? 'xls' : 'xlsx', nomeArquivo: nomeArquivo, bytes: bytes,
      abas: livro.SheetNames.map(function (nome) { return lerFolha(XLSX, livro.Sheets[nome], nome); }) };
  }
  function lerFolha(XLSX, folha, nome) {
    var linhas = [], brutas = [];
    if (folha['!ref']) {
      var area = XLSX.utils.decode_range(folha['!ref']);
      var ate = Math.min(area.e.r, 2000);
      for (var r = 0; r <= ate; r++) {
        var l = [], b = [];
        for (var c = 0; c <= area.e.c; c++) {
          var cel = r >= area.s.r && c >= area.s.c ? folha[XLSX.utils.encode_cell({ r: r, c: c })] : null;
          l.push(cel && cel.v != null ? (cel.t === 'n' || cel.t === 'b' ? cel.v : String(cel.v).trim()) : '');
          b.push(cel ? { t: cel.t, v: cel.v, z: cel.z, w: cel.w } : null);
        }
        linhas.push(l); brutas.push(b);
      }
    }
    return { nome: nome, linhas: linhas, brutas: brutas };
  }
  function separador(linhasTexto) {
    var amostra = linhasTexto.filter(function (l) { return l.trim(); }).slice(0, 10).join('\n');
    var cont = { ';': 0, ',': 0, '\t': 0 };
    Object.keys(cont).forEach(function (s) { cont[s] = amostra.split(s).length - 1; });
    return cont[';'] >= cont[','] && cont[';'] >= cont['\t'] ? ';' : cont['\t'] > cont[','] ? '\t' : ',';
  }
  function dividirLinha(linha, sep) {
    var out = [], atual = '', aspas = false;
    for (var i = 0; i < linha.length; i++) {
      var c = linha[i];
      if (aspas) {
        if (c === '"') { if (linha[i + 1] === '"') { atual += '"'; i++; } else aspas = false; } else atual += c;
      } else if (c === '"') aspas = true;
      else if (c === sep) { out.push(atual.trim()); atual = ''; }
      else atual += c;
    }
    out.push(atual.trim());
    return out;
  }

  // ---------- formatos de data e valor (imita a linha de exemplo do modelo) ----------
  function ehFormatoData(z) { return !!z && /[dmy]/i.test(String(z).replace(/\[[^\]]*\]|"[^"]*"/g, '')) && !/^[#0.,%\s;-]+$/.test(z); }
  function detectarFormatoData(cel) {
    if (cel && (cel.t === 'd' || (cel.t === 'n' && ehFormatoData(cel.z)))) return { tipo: 'serial', z: cel.t === 'd' ? 'dd/mm/yyyy' : cel.z };
    var s = cel && cel.v != null ? String(cel.v).trim() : '';
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return { tipo: 'texto', padrao: 'aaaa-mm-dd' };
    var m = s.match(/^\d{1,2}([\/.\-])\d{1,2}\1(\d{2,4})$/);
    if (m) return { tipo: 'texto', padrao: 'dd' + m[1] + 'mm' + m[1] + (m[2].length === 2 ? 'aa' : 'aaaa') };
    return { tipo: 'texto', padrao: 'dd/mm/aaaa' };
  }
  function serialDe(iso) {
    var p = iso.split('-');
    return Math.round((Date.UTC(+p[0], +p[1] - 1, +p[2]) - Date.UTC(1899, 11, 30)) / 86400000);
  }
  function celulaData(iso, f) {
    f = f || { tipo: 'texto', padrao: 'dd/mm/aaaa' };
    if (f.tipo === 'serial') return { t: 'n', v: serialDe(iso), z: f.z || 'dd/mm/yyyy' };
    var p = iso.split('-');
    if (f.padrao === 'aaaa-mm-dd') return { t: 's', v: iso };
    var sep = f.padrao.charAt(2), ano = /aaaa$/.test(f.padrao) ? p[0] : p[0].slice(2);
    return { t: 's', v: p[2] + sep + p[1] + sep + ano };
  }
  function detectarFormatoValor(cel, csvSep) {
    if (cel && cel.t === 'n' && isFinite(cel.v)) return { tipo: 'numero', z: cel.z && cel.z !== 'General' ? cel.z : '#,##0.00', negativoPagar: cel.v < 0 };
    var s = cel && cel.v != null ? String(cel.v).trim() : '';
    var neg = /^-|^\(|-$/.test(s);
    if (/r\$/i.test(s)) return { tipo: 'brl', negativoPagar: neg };
    if (/\d,\d{1,2}\)?-?$/.test(s)) return { tipo: 'br', milhar: /\d\.\d{3}/.test(s), negativoPagar: neg };
    if (/\d\.\d{1,2}\)?-?$/.test(s)) return { tipo: 'ponto', negativoPagar: neg };
    if (csvSep) return { tipo: csvSep === ',' ? 'ponto' : 'br', milhar: false, negativoPagar: false };
    return { tipo: 'numero', z: '#,##0.00', negativoPagar: false };
  }
  function celulaValor(n, f) {
    f = f || { tipo: 'numero', z: '#,##0.00' };
    n = C.arred(n);
    if (f.tipo === 'numero') return { t: 'n', v: n, z: f.z || '#,##0.00' };
    if (f.tipo === 'brl') return { t: 's', v: C.brl(n) };
    if (f.tipo === 'ponto') return { t: 's', v: n.toFixed(2) };
    var txt = Math.abs(n).toFixed(2).replace('.', ',');
    if (f.milhar) { var pp = Math.abs(n).toFixed(2).split('.'); txt = pp[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + pp[1]; }
    return { t: 's', v: (n < 0 ? '-' : '') + txt };
  }
  function detectarTextosTipo(cel) {
    var s = C.simples(cel && cel.v);
    if (/despesa|receita/.test(s)) return { pagar: 'Despesa', receber: 'Receita' };
    if (/saida|entrada/.test(s)) return { pagar: 'Saída', receber: 'Entrada' };
    if (/debito|credito/.test(s)) return { pagar: 'Débito', receber: 'Crédito' };
    if (/^[dc]$/.test(s)) return { pagar: 'D', receber: 'C' };
    return { pagar: 'Pagar', receber: 'Receber' };
  }
  // Formatos por coluna, a partir da linha de exemplo
  // exemplo: uma linha (lista de células) ou a análise inteira de analisarAbaModelo (usa todas as linhas de exemplo)
  function formatosDoModelo(mapa, exemplo, csvSep) {
    var an = exemplo && !Array.isArray(exemplo) ? exemplo : null;
    var linhasEx = an ? an.exemplos || [] : exemplo ? [exemplo] : [];
    var cabCel = an ? an.celulasCab || [] : [];
    return mapa.map(function (m, i) {
      var cels = linhasEx.map(function (l) { return l[i]; }).filter(function (c) { return c && !C.vazio(c.v); });
      var cel = cels[0] || null;
      var texto = cels.concat([cabCel[i]]).some(function (c) { return c && c.z === '@'; });
      if (m.modo !== 'campo') return texto ? { tipo: 'texto', z: '@' } : null;
      var c = campoModelo(m.campo);
      if (c && c.data) return detectarFormatoData(cel);
      if (c && c.valor) {
        var f = detectarFormatoValor(cel, csvSep);
        if (cels.some(function (x) { return (x.t === 'n' && x.v < 0) || /^-|^\(/.test(String(x.v).trim()); })) f.negativoPagar = true;
        return f;
      }
      if (m.campo === 'documento') return { tipo: 'doc', z: texto ? '@' : null, soDigitos: cel ? /^\d+$/.test(String(cel.v).trim()) : false };
      return texto ? { tipo: 'texto', z: '@' } : null;
    });
  }
  // O sinal do valor separa pagar de receber (o modelo mostra exemplos negativos)
  function sinalSeparaTipos(mapa, formatos) {
    return mapa.some(function (m, i) { return m.modo === 'campo' && m.campo === 'valor' && formatos && formatos[i] && formatos[i].negativoPagar; });
  }

  function textoObs(it) {
    var t = 'Recorrente ' + it.periodicidade + ', achado no extrato';
    if (it.variavel) t += '. Valor variável: média dos últimos 3 meses';
    return t + '.';
  }
  // Valor de um campo da ferramenta para uma ocorrência. Devolve célula {t, v, z} ou null (em branco)
  // opcoes: {competencia:'vencimento'|'dia1', limpar:bool (regra do Conta Azul), contagem:{limpos}}
  function celulaCampo(campo, oc, formato, textosTipo, opcoes) {
    opcoes = opcoes || {};
    var it = oc.item;
    var txt = function (v) { return celulaTexto(v, formato, opcoes); };
    switch (campo) {
      case 'vencimento': return celulaData(oc.vencimento, formato);
      case 'competencia': return celulaData(opcoes.competencia === 'dia1' ? oc.mes + '-01' : oc.vencimento, formato);
      case 'valor': return celulaValor(formato && formato.negativoPagar && it.tipo === 'pagar' ? -oc.valor : oc.valor, formato);
      case 'descricao': return txt(it.descricao || it.nome);
      case 'contato': return txt(it.nome);
      case 'fornecedor': return it.tipo === 'pagar' ? txt(it.nome) : null;
      case 'cliente': return it.tipo === 'receber' ? txt(it.nome) : null;
      case 'documento':
        if (!it.doc || !(it.doc.length === 11 ? cpfValido(it.doc) : cnpjValido(it.doc))) return null;
        return formato && formato.soDigitos ? { t: 's', v: it.doc, z: formato.z || '@' } : txt(formatarDoc(it.doc));
      case 'categoria': return txt(it.categoria);
      case 'observacoes': return txt(it.obs || textoObs(it));
      case 'conta': return txt(it.conta);
      case 'tipo': return txt((textosTipo || {})[it.tipo] || (it.tipo === 'pagar' ? 'Pagar' : 'Receber'));
      case 'parcela': return txt(oc.parcela);
      case 'periodicidade': return txt(it.periodicidade ? it.periodicidade.charAt(0).toUpperCase() + it.periodicidade.slice(1) : '');
      default: return null;
    }
  }
  // Monta as linhas (listas de células) para colocar abaixo do cabeçalho do modelo
  function celulaTexto(v, formato, opcoes) {
    if (v == null || v === '') return null;
    var orig = String(v), limpo = opcoes.limpar ? limparTextoContaAzul(orig) : semFormula(orig);
    if (limpo !== orig && opcoes.contagem) opcoes.contagem.limpos++;
    if (!limpo) return null;
    var cel = { t: 's', v: limpo };
    if (formato && (formato.tipo === 'texto' || formato.tipo === 'doc') && formato.z) cel.z = formato.z;
    return cel;
  }
  // opcoes: {competencia, limpar, contagem:{limpos:0}} (a contagem diz quantos textos foram limpos)
  function montarLinhasModelo(ocorrencias, mapa, formatos, textosTipo, opcoes) {
    opcoes = opcoes || {};
    return ocorrencias.map(function (oc) {
      return mapa.map(function (m, i) {
        var f = formatos && formatos[i];
        if (m.modo === 'campo') return celulaCampo(m.campo, oc, f, textosTipo, opcoes);
        if (m.modo === 'fixo' && !C.vazio(m.valor)) return celulaTexto(m.valor, f, opcoes);
        return null;
      });
    });
  }
  // Nome do arquivo de saída no mesmo formato do modelo
  function extensaoSaida(modelo) { return modelo.tipo === 'csv' ? 'csv' : modelo.ext === 'xls' ? 'xls' : 'xlsx'; }
  function faltandoModelo(mapa) {
    var usados = {};
    mapa.forEach(function (m) { if (m.modo === 'campo') usados[m.campo] = true; });
    var f = [];
    if (!usados.vencimento) f.push('Data de vencimento');
    if (!usados.valor) f.push('Valor');
    if (!usados.descricao && !usados.contato && !usados.fornecedor && !usados.cliente) f.push('Descrição ou Fornecedor/cliente');
    return f;
  }
  function temColunaTipo(mapa) { return mapa.some(function (m) { return m.modo === 'campo' && m.campo === 'tipo'; }); }
  // Abas separadas de pagar e receber no mesmo modelo
  function abasPagarReceber(modelo) {
    var pagar = -1, receber = -1;
    modelo.abas.forEach(function (a, i) {
      var s = C.simples(a.nome);
      if (analisarAbaModelo(a).nota < 2) return;
      if (pagar < 0 && /pagar|despesa|saida/.test(s)) pagar = i;
      else if (receber < 0 && /receber|receita|entrada/.test(s)) receber = i;
    });
    return pagar >= 0 && receber >= 0 ? { pagar: pagar, receber: receber } : null;
  }

  // Preenche uma aba do SheetJS abaixo do cabeçalho, mantendo tudo que está acima
  function preencherFolha(XLSX, folha, linhaCab, linhas) {
    var area = folha['!ref'] ? XLSX.utils.decode_range(folha['!ref']) : { s: { r: 0, c: 0 }, e: { r: linhaCab, c: 0 } };
    Object.keys(folha).forEach(function (k) {
      if (k.charAt(0) === '!') return;
      if (XLSX.utils.decode_cell(k).r > linhaCab) delete folha[k];
    });
    if (folha['!merges']) folha['!merges'] = folha['!merges'].filter(function (m) { return m.s.r <= linhaCab; });
    if (folha['!rows']) folha['!rows'] = folha['!rows'].slice(0, linhaCab + 1);
    var maxC = area.e.c;
    linhas.forEach(function (l, i) {
      l.forEach(function (cel, c) {
        if (!cel) return;
        var o = { t: cel.t, v: cel.v };
        if (cel.z) o.z = cel.z;
        folha[XLSX.utils.encode_cell({ r: linhaCab + 1 + i, c: c })] = o;
        if (c > maxC) maxC = c;
      });
    });
    area.e.r = Math.max(linhaCab, linhaCab + linhas.length);
    area.e.c = maxC;
    if (area.s.r > linhaCab) area.s.r = linhaCab;
    folha['!ref'] = XLSX.utils.encode_range(area);
    return folha;
  }
  // Copia o modelo e preenche. partes: [{abaIdx, linhaCab, linhas}]. Devolve bytes (xlsx) ou texto (csv)
  function gerarArquivoModelo(XLSX, modelo, partes) {
    if (modelo.tipo === 'csv') {
      var p = partes[0], sep = modelo.sep;
      var topo = modelo.linhasTexto.slice(0, p.linhaCab + 1);
      var novas = p.linhas.map(function (l) {
        return l.map(function (cel) { return csvCampo(cel ? textoCSV(cel, sep) : '', sep); }).join(sep);
      });
      return '﻿' + topo.concat(novas).join('\r\n') + '\r\n';
    }
    var livro = XLSX.read(modelo.bytes, { type: 'array', cellNF: true, cellStyles: true });
    partes.forEach(function (p) { preencherFolha(XLSX, livro.Sheets[livro.SheetNames[p.abaIdx]], p.linhaCab, p.linhas); });
    return XLSX.write(livro, { type: 'array', bookType: modelo.ext === 'xls' ? 'biff8' : 'xlsx' });
  }
  function textoCSV(cel, sep) {
    if (cel.t === 'n') return sep === ',' ? String(cel.v) : String(cel.v.toFixed ? cel.v.toFixed(2) : cel.v).replace('.', ',');
    return String(cel.v);
  }
  function csvCampo(t, sep) { return /["\r\n]/.test(t) || t.indexOf(sep) >= 0 ? '"' + t.replace(/"/g, '""') + '"' : t; }

  // ---------- planilhas de conferência ----------
  function linhasLista(itens) {
    var out = [['Incluir', 'Tipo', 'Fornecedor ou cliente', 'Descrição', 'Categoria', 'Dia', 'Periodicidade', 'Valor sugerido', 'Valor variável', 'Último valor', 'Média', 'Média dos últimos 3', 'Vezes', 'Meses em que apareceu', 'Situação', 'CPF ou CNPJ', 'Exemplo de histórico']];
    itens.forEach(function (it) {
      out.push([it.incluir ? 'Sim' : 'Não', it.tipo === 'pagar' ? 'Pagar' : 'Receber', it.nome, it.descricao, it.categoria, it.dia, it.periodicidade,
        it.valor, it.variavel ? 'Sim' : 'Não', it.ultimoValor, it.media, it.mediaUlt3, it.vezes, it.meses.map(C.mesCurto).join(', '),
        it.situacao.join('; '), formatarDoc(it.doc), it.exemplos[it.exemplos.length - 1] || '']);
    });
    return out;
  }
  function linhasSimples(ocorrencias) {
    var out = [['Descrição', 'Fornecedor/Cliente', 'Categoria', 'Vencimento', 'Valor', 'Tipo']];
    ocorrencias.forEach(function (oc) {
      out.push([oc.item.descricao || oc.item.nome, oc.item.nome, oc.item.categoria, C.dataBR(oc.vencimento), oc.valor, oc.item.tipo === 'pagar' ? 'Pagar' : 'Receber']);
    });
    return out;
  }

  // ---------- estado, clientes e backup ----------
  function novoEstado() { return { versao: 1, clientes: [], clienteAtual: null, minMeses: MIN_MESES_PADRAO, mesesGerar: MESES_GERAR_PADRAO, mapas: {}, ultimoBackup: null }; }
  function copia(o) { return JSON.parse(JSON.stringify(o)); }
  function acharCliente(estado, nome) {
    var s = C.simples(nome);
    return estado.clientes.filter(function (c) { return C.simples(c.nome) === s; })[0] || null;
  }
  function garantirCliente(estado, nome) {
    nome = String(nome || '').trim();
    if (!nome) return null;
    var c = acharCliente(estado, nome);
    if (!c) { c = { id: C.id(), nome: nome.slice(0, 80), regras: {} }; estado.clientes.push(c); }
    estado.clienteAtual = c.id;
    return c;
  }
  function normalizar(e) {
    var n = novoEstado();
    if (!e || typeof e !== 'object') return n;
    var mm = Number(e.minMeses); if (mm >= 2 && mm <= 12) n.minMeses = Math.round(mm);
    var mg = Number(e.mesesGerar); if (mg >= 1 && mg <= 36) n.mesesGerar = Math.round(mg);
    n.ultimoBackup = typeof e.ultimoBackup === 'string' ? e.ultimoBackup : null;
    (Array.isArray(e.clientes) ? e.clientes : []).forEach(function (c) {
      if (!c || typeof c !== 'object' || !String(c.nome || '').trim()) return;
      var nc = { id: typeof c.id === 'string' && c.id ? c.id : C.id(), nome: String(c.nome).trim().slice(0, 80), regras: {} };
      Object.keys(c.regras || {}).forEach(function (k) {
        var r = c.regras[k], nr = {};
        if (!r || typeof r !== 'object') return;
        EDITAVEIS.forEach(function (f) { if (r[f] !== undefined) nr[f] = r[f]; });
        if (Object.keys(nr).length) nc.regras[k] = nr;
      });
      n.clientes.push(nc);
    });
    if (n.clientes.some(function (c) { return c.id === e.clienteAtual; })) n.clienteAtual = e.clienteAtual;
    Object.keys(e.mapas || {}).forEach(function (k) {
      var m = e.mapas[k];
      if (m && Array.isArray(m.colunas)) n.mapas[k] = { colunas: m.colunas.map(function (c) {
        if (c && c.modo === 'campo' && campoModelo(c.campo)) return { modo: 'campo', campo: c.campo };
        if (c && c.modo === 'fixo') return { modo: 'fixo', valor: String(c.valor == null ? '' : c.valor) };
        return { modo: 'branco' };
      }), textosTipo: m.textosTipo && typeof m.textosTipo === 'object' ? { pagar: String(m.textosTipo.pagar || 'Pagar'), receber: String(m.textosTipo.receber || 'Receber') } : null };
    });
    return n;
  }
  function criarBackup(estado, agoraIso) { return { ferramenta: 'recorrentes-conta-azul', versao: 1, salvoEm: agoraIso || new Date().toISOString(), dados: copia(estado) }; }
  function lerBackup(obj) {
    if (!obj || typeof obj !== 'object') throw new Error('Esse arquivo não é um backup da ferramenta Recorrentes.');
    var dados = obj.ferramenta === 'recorrentes-conta-azul' ? obj.dados : null;
    if (!dados || !Array.isArray(dados.clientes)) throw new Error('Esse arquivo não é um backup da ferramenta Recorrentes.');
    return normalizar(dados);
  }
  function diasDesde(iso, agora) {
    if (!iso) return null;
    var t = Date.parse(iso), a = agora ? Date.parse(agora) : Date.now();
    return isFinite(t) ? Math.floor((a - t) / 86400000) : null;
  }

  return {
    CHAVE: CHAVE, CAMPOS: CAMPOS, CAMPOS_MODELO: CAMPOS_MODELO, PERIODOS: PERIODOS, NOME_PERIODO: NOME_PERIODO, TOLERANCIA: TOLERANCIA,
    LISTA_CATEGORIAS: LISTA_CATEGORIAS, MIN_MESES_PADRAO: MIN_MESES_PADRAO, MESES_GERAR_PADRAO: MESES_GERAR_PADRAO, EDITAVEIS: EDITAVEIS,
    cpfValido: cpfValido, cnpjValido: cnpjValido, formatarDoc: formatarDoc, normalizarHistorico: normalizarHistorico, nomeBonito: nomeBonito,
    sugerirCategoria: sugerirCategoria, mesIdx: mesIdx, idxMes: idxMes, somarMeses: somarMeses, diasNoMes: diasNoMes, mesValido: mesValido, mesQueVem: mesQueVem,
    prepararAba: prepararAba, melhorAba: melhorAba, faltandoExtrato: faltandoExtrato, lerMovimentos: lerMovimentos, lerOFX: lerOFX,
    detectarPeriodo: detectarPeriodo, acharRecorrentes: acharRecorrentes, aplicarRegras: aplicarRegras, lembrar: lembrar, validarItem: validarItem,
    gerarOcorrencias: gerarOcorrencias, campoModelo: campoModelo, assinatura: assinatura, detectarMapaModelo: detectarMapaModelo,
    analisarAbaModelo: analisarAbaModelo, melhorAbaModelo: melhorAbaModelo, lerModelo: lerModelo, lerFolha: lerFolha,
    detectarFormatoData: detectarFormatoData, celulaData: celulaData, detectarFormatoValor: detectarFormatoValor, celulaValor: celulaValor,
    detectarTextosTipo: detectarTextosTipo, formatosDoModelo: formatosDoModelo, montarLinhasModelo: montarLinhasModelo, faltandoModelo: faltandoModelo,
    temColunaTipo: temColunaTipo, sinalSeparaTipos: sinalSeparaTipos, extensaoSaida: extensaoSaida, completarAnalise: completarAnalise,
    ehModeloContaAzul: ehModeloContaAzul, limparTextoContaAzul: limparTextoContaAzul, ASSINATURA_CONTA_AZUL: ASSINATURA_CONTA_AZUL,
    abasPagarReceber: abasPagarReceber, preencherFolha: preencherFolha, gerarArquivoModelo: gerarArquivoModelo, serialDe: serialDe,
    linhasLista: linhasLista, linhasSimples: linhasSimples, textoObs: textoObs,
    novoEstado: novoEstado, acharCliente: acharCliente, garantirCliente: garantirCliente, normalizar: normalizar,
    criarBackup: criarBackup, lerBackup: lerBackup, diasDesde: diasDesde
  };
});

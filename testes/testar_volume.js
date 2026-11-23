// Testes do Monitor de volume. Rode: node testes/testar_volume.js
const fs = require('fs');
const TRAVESSAO = new RegExp('[' + String.fromCharCode(8211) + String.fromCharCode(8212) + ']');
const path = require('path');
const C = require('../comum.js');
const V = require('../volume-logica.js');
const XLSX = require('../vendor/xlsx.full.min.js');
let ok = 0, falhou = 0;
function igual(obtido, esperado, nome) {
  const a = JSON.stringify(obtido), b = JSON.stringify(esperado);
  if (a === b) ok++; else { falhou++; console.log('FALHOU:', nome, '\n  obtido  ', a, '\n  esperado', b); }
}
function perto(obtido, esperado, nome, tol) {
  if (obtido != null && Math.abs(obtido - esperado) <= (tol || 0.005)) ok++;
  else { falhou++; console.log('FALHOU:', nome, '\n  obtido  ', obtido, '\n  esperado', esperado); }
}

// ---------- linhas de saldo e total ----------
['SALDO ANTERIOR', 'Saldo do dia', 'SALDO FINAL', 'S A L D O', 'Saldo', 'SALDO DISPONÍVEL', 'Saldo em 31/08'].forEach(t => igual(V.ehSaldo(t), true, 'saldo: ' + t));
['PAGTO SALDO DEVEDOR', 'PIX RECEBIDO', ''].forEach(t => igual(V.ehSaldo(t), false, 'não é saldo: ' + t));
igual(V.ehTotal(['', 'Total', '', '100']), true, 'linha Total');
igual(V.ehTotal(['', 'Total de lançamentos', '']), true, 'linha Total de lançamentos');
igual(V.ehTotal(['01/08/2026', 'PIX', '10']), false, 'linha comum não é total');

// ---------- contagem por mês numa planilha com título, saldos e total ----------
const planilha = [
  ['BANCO EXEMPLO'], ['Extrato de conta corrente'], [],
  ['Data', 'Histórico', 'Documento', 'Valor (R$)', 'Saldo (R$)'],
  ['31/07/2026', 'SALDO ANTERIOR', '', '', '1.000,00'],
  ['03/08/2026', 'PIX RECEBIDO', '1', '100,00', ''],
  ['03/08/2026', 'TARIFA', '2', '-10,00', ''],
  ['03/08/2026', 'SALDO DO DIA', '', '', '1.090,00'],
  ['15/08/2026', 'ESTORNO', '3', '0,00', ''],
  ['02/09/2026', 'PAGTO BOLETO', '4', '-50,00', ''],
  ['xx', 'linha estranha', '', '5,00', ''],
  ['01/10/2026', 'TED', '5', '200,00', ''],
  ['01/10/2026', 'S A L D O', '', '', '1.240,00'],
  ['', 'Total', '', '240,00', '']
];
const prep = V.prepararAba(planilha);
igual(prep.inicio, 3, 'acha a linha do cabeçalho depois do título do banco');
igual([prep.escolha.data, prep.escolha.descricao, prep.escolha.valor, prep.escolha.saldo], [0, 1, 3, 4], 'detecta Data, Histórico, Valor e Saldo');
igual(prep.contagem.porMes, { '2026-08': 2, '2026-09': 1, '2026-10': 1 }, 'conta por mês com vários meses no arquivo');
igual(prep.contagem.ignoradas, { semData: 1, saldo: 3, total: 1, zero: 1 }, 'motivos das linhas ignoradas');
igual(prep.contagem.lidas, 10, 'linhas lidas');
igual(prep.contagem.contadas, 4, 'linhas contadas');
// sem coluna de valor, linha com valor zero conta (não dá para saber)
const semValor = V.contarLinhas(planilha, 3, { data: 0, descricao: 1, valor: -1, credito: -1, debito: -1, saldo: -1 });
igual(semValor.contadas, 5, 'sem coluna de valor não ignora zero');
// sem a coluna Data não conta nada
igual(V.contarLinhas(planilha, 3, { data: -1, descricao: 1, valor: 3 }).contadas, 0, 'sem Data não conta');
igual(C.faltando({ data: -1 }, V.CAMPOS).map(c => c.chave), ['data'], 'Data é obrigatória');

// colunas Crédito e Débito (estilo Nibo/Omie) e nomes de data de sistemas
const cabSist = ['Data de pagamento', 'Data de vencimento', 'Descrição', 'Crédito', 'Débito', 'Saldo'];
const escSist = C.detectarColunas(cabSist, V.CAMPOS);
igual([escSist.data, escSist.descricao, escSist.credito, escSist.debito, escSist.saldo], [0, 2, 3, 4, 5], 'detecta Data de pagamento, Crédito e Débito');
igual(C.detectarColunas(['Data lançamento', 'Lançamento', 'Valor'], V.CAMPOS).data, 0, 'detecta Data lançamento');
igual(C.detectarColunas(['Data movimento', 'Histórico', 'Valor (R$)'], V.CAMPOS).valor, 2, 'detecta Valor (R$)');
const cd = [cabSist, ['05/08/2026', '', 'Venda', '100,00', '', ''], ['06/08/2026', '', 'Compra', '', '30,00', ''], ['07/08/2026', '', 'Nada', '', '', '']];
igual(V.contarLinhas(cd, 0, escSist).porMes, { '2026-08': 2 }, 'crédito ou débito conta, linha sem valor não');

// várias abas: escolhe a que tem lançamentos
igual(V.melhorAba([{ nome: 'Leia', linhas: [['Informações'], ['texto']] }, { nome: 'Extrato', linhas: planilha }]), 1, 'escolhe a aba com lançamentos');

// ---------- OFX ----------
const sgml = `OFXHEADER:100
DATA:OFXSGML
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>0341<ACCTID>123-4</BANKACCTFROM><BANKTRANLIST>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260805120000[-3:BRT]<TRNAMT>-45.90<MEMO>PAGTO
</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260930<TRNAMT>100,00<MEMO>PIX
</STMTTRN>
<STMTTRN><TRNTYPE>OTHER<DTPOSTED>20260930<TRNAMT>0.00<MEMO>AJUSTE
</STMTTRN>
<STMTTRN><TRNTYPE>OTHER<DTPOSTED>xx<TRNAMT>5.00<MEMO>SEM DATA
</STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
const oS = V.lerOFX(sgml);
igual(V.pareceOFX(sgml), true, 'reconhece OFX');
igual(oS.contas.length, 1, 'OFX SGML: uma conta');
igual(oS.contas[0].conta, '123-4', 'OFX SGML: número da conta');
igual(oS.contas[0].porMes, { '2026-08': 1, '2026-09': 1 }, 'OFX SGML: lançamentos por mês');
igual([oS.ignoradas.zero, oS.ignoradas.semData], [1, 1], 'OFX SGML: ignora valor zero e sem data');
const xml = `<?xml version="1.0"?><OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><ACCTID>A1</ACCTID></BANKACCTFROM><BANKTRANLIST>
<STMTTRN><DTPOSTED>20261001</DTPOSTED><TRNAMT>-1.50</TRNAMT><MEMO>X</MEMO></STMTTRN>
<STMTTRN><DTPOSTED>20261102</DTPOSTED><TRNAMT>2.00</TRNAMT><MEMO>Y</MEMO></STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS>
<STMTTRNRS><STMTRS><BANKACCTFROM><ACCTID>B2</ACCTID></BANKACCTFROM><BANKTRANLIST>
<STMTTRN><DTPOSTED>20261103</DTPOSTED><TRNAMT>9.00</TRNAMT><MEMO>Z</MEMO></STMTTRN>
</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
const oX = V.lerOFX(xml);
igual(oX.contas.map(c => [c.conta, c.porMes]), [['A1', { '2026-10': 1, '2026-11': 1 }], ['B2', { '2026-11': 1 }]], 'OFX XML com duas contas');
igual(V.fontesDoOFX('banco.ofx', oX).map(f => f.nome), ['banco.ofx | conta A1', 'banco.ofx | conta B2'], 'OFX com duas contas vira duas fontes');
igual(V.fontesDoOFX('um.ofx', oS).map(f => f.nome), ['um.ofx'], 'OFX com uma conta usa o nome do arquivo');

// ---------- soma de arquivos, substituição e contas ----------
const cli = V.novoCliente('Teste', 1000, '2026-08');
V.registrarFonte(cli, 'itau.xlsx', { '2026-08': 100, '2026-09': 110 });
V.registrarFonte(cli, 'nubank.ofx', { '2026-09': 20 });
igual(V.lancamentosDoMes(cli.meses['2026-09']), 130, 'arquivos diferentes no mesmo mês somam');
igual(V.contasDoMes(cli.meses['2026-09']), 2, 'contas = nº de arquivos do mês');
igual(V.contasDoMes(cli.meses['2026-08']), 1, 'contas = 1 arquivo em agosto');
V.registrarFonte(cli, 'itau.xlsx', { '2026-08': 105 });
igual(V.lancamentosDoMes(cli.meses['2026-08']), 105, 'mesmo nome de arquivo substitui');
igual(V.lancamentosDoMes(cli.meses['2026-09']), 20, 'substituição tira o mês que o arquivo novo não tem');
V.definirValor(cli, '2026-09', 'contas', 3);
igual(V.contasDoMes(cli.meses['2026-09']), 3, 'correção manual das contas');
V.definirValor(cli, '2026-09', 'contas', '');
igual(V.contasDoMes(cli.meses['2026-09']), 1, 'apagar a correção volta ao nº de arquivos');
V.definirValor(cli, '2026-09', 'lancamentos', 50);
igual(V.lancamentosDoMes(cli.meses['2026-09']), 50, 'lançamentos digitados por cima');
V.definirValor(cli, '2026-09', 'lancamentos', null);
igual(V.lancamentosDoMes(cli.meses['2026-09']), 20, 'apagar volta à contagem dos arquivos');
V.adicionarMes(cli, '2026-12');
igual(V.mesesOrdenados(cli), ['2026-08', '2026-09', '2026-12'], 'adicionar mês');
V.excluirMes(cli, '2026-12');
igual(V.mesesOrdenados(cli), ['2026-08', '2026-09'], 'excluir mês');
igual(V.adicionarMes(cli, '2026-13'), false, 'mês inválido não entra');

// ---------- horas, honorário por hora e proporcional ----------
const P = V.PREMISSAS_PADRAO;
igual(P, { lancamento: 2, nota: 3, funcionario: 15, conta: 60 }, 'premissas padrão');
perto(V.horas({ lancamentos: 120, contas: 1, funcionarios: 8, notas: 0 }, P), 7, 'horas: 120 lanç, 1 conta, 8 func = 7 h');
perto(V.horas({ lancamentos: 60, contas: 0, funcionarios: null, notas: 20 }, P), 3, 'horas com funcionários não informados');
const c2 = V.novoCliente('Padaria', 1400, '2026-08');
V.registrarFonte(c2, 'a.xlsx', { '2026-08': 120, '2026-09': 130, '2026-10': 150 });
['2026-08', '2026-09', '2026-10'].forEach(m => V.definirValor(c2, m, 'funcionarios', 8));
const r2 = V.resumo(c2, P, 0.2);
perto(r2.horasBase, 7, 'horas base');
perto(r2.horasAgora, (150 * 2 + 60 + 120) / 60, 'horas agora');
perto(r2.hhBase, 200, 'honorário por hora base');
perto(r2.hhAgora, 1400 / 8, 'honorário por hora agora');
perto(r2.proporcional, 1600, 'proporcional = honorário x horas agora / horas base');
perto(r2.indicadores.lancamentos.variacao, 0.25, 'variação dos lançamentos');
perto(r2.indicadores.lancamentos.varAnterior, 150 / 130 - 1, 'variação contra o mês anterior');
igual([r2.mesBase, r2.ultimo, r2.anterior], ['2026-08', '2026-10', '2026-09'], 'meses comparados');
igual(r2.status, 'revisar', '25% passa do limite');

// limite exato: 20% conta como alerta
const c3 = V.novoCliente('Exato', 1000, '2026-08');
V.registrarFonte(c3, 'x.csv', { '2026-08': 100, '2026-09': 120 });
igual(V.resumo(c3, P, 0.2).status, 'revisar', '20% exato é alerta');
V.registrarFonte(c3, 'x.csv', { '2026-08': 100, '2026-09': 119 });
igual(V.resumo(c3, P, 0.2).status, 'ok', '19% não é alerta');
igual(V.resumo(c3, P, 0.1).status, 'revisar', 'limite editável');

// mês base vazio usa o primeiro mês com dados
const c4 = V.novoCliente('Sem base', 500, '');
V.registrarFonte(c4, 'y.csv', { '2026-09': 50, '2026-10': 55 });
const r4 = V.resumo(c4, P, 0.2);
igual(r4.mesBase, '2026-09', 'mês base vazio usa o primeiro mês');
igual(r4.avisos.some(a => /primeiro mês/.test(a)), true, 'avisa que usou o primeiro mês');
// mês base sem dados
const c4b = V.novoCliente('Base sem dados', 500, '2026-01');
V.registrarFonte(c4b, 'y.csv', { '2026-09': 50, '2026-10': 55 });
igual(V.resumo(c4b, P, 0.2).mesBase, '2026-09', 'mês base sem dados cai no primeiro mês');

// só 1 mês
const c5 = V.novoCliente('Um mês', 800, '');
V.registrarFonte(c5, 'z.csv', { '2026-11': 40 });
const r5 = V.resumo(c5, P, 0.2);
igual(r5.status, 'precisa', 'cliente com 1 mês precisa de mais um');
igual(r5.avisos.indexOf('Precisa de mais um mês para comparar.') >= 0, true, 'mensagem de 1 mês');
igual(V.resumo(V.novoCliente('Vazio'), P, 0.2).status, 'vazio', 'cliente sem meses');

// indicador novo e não informado
const c6 = V.novoCliente('Novo', 600, '2026-08');
V.registrarFonte(c6, 'w.csv', { '2026-08': 100, '2026-09': 100 });
V.definirValor(c6, '2026-08', 'notas', 0);
V.definirValor(c6, '2026-09', 'notas', 10);
V.definirValor(c6, '2026-09', 'funcionarios', 5);
const r6 = V.resumo(c6, P, 0.2);
igual([r6.indicadores.notas.novo, r6.status], [true, 'revisar'], 'notas de 0 para 10 é alerta');
igual(r6.indicadores.funcionarios.semBase, true, 'funcionários sem dado no mês base');
igual(r6.indicadores.funcionarios.alerta, false, 'sem dado no mês base não dá alerta');
perto(r6.horasAgora, (100 * 2 + 60 + 30) / 60, 'funcionários sem base ficam fora das horas');

// ordenação: alertas primeiro
const est = V.novoEstado();
est.clientes.push(c5, c3, c2, c6, V.novoCliente('Zé Vazio'));
const ordem = V.resumos(est).map(r => r.nome);
igual(ordem, ['Novo', 'Padaria', 'Exato', 'Um mês', 'Zé Vazio'], 'ordenação: alertas primeiro, maior variação antes');

// ---------- texto para o cliente ----------
const txt = V.textoCliente(c2, r2, { contato: 'Maria' });
igual(TRAVESSAO.test(txt), false, 'texto sem travessão');
igual(txt.indexOf('Olá, Maria!') === 0, true, 'texto começa com o nome');
igual(txt.indexOf('agosto de 2026') >= 0 && txt.indexOf('outubro de 2026') >= 0, true, 'texto tem mês base e último mês');
igual(txt.indexOf('25,0% a mais') >= 0, true, 'texto tem a variação');
igual(txt.indexOf('R$ 1.600,00') >= 0, true, 'texto tem o valor proporcional');
igual(V.textoCliente(c5, r5), '', 'sem texto com 1 mês');
const txtOk = V.textoCliente(c3, V.resumo(c3, P, 0.2));
igual(/estável/.test(txtOk) || /R\$/.test(txtOk), true, 'texto para cliente sem alerta');

// ---------- Excel ----------
const lp = V.linhasPainel(est);
igual(lp.length, 6, 'painel do Excel: cabeçalho + 5 clientes');
igual(lp[0].length, lp[1].length, 'painel do Excel: colunas iguais');
igual([lp[0][22], lp[1][0]], ['Honorário proporcional ao volume (R$)', 'Novo'], 'painel do Excel: coluna do proporcional e ordem');
const lh = V.linhasHistorico(est);
igual(lh[0].slice(0, 4), ['Cliente', 'Mês', 'Lançamentos', 'Contas bancárias'], 'histórico do Excel');

// ---------- backup e restauração ----------
est.premissas.conta = 45; est.limite = 0.3;
const bk = V.criarBackup(est, '2026-11-01T10:00:00.000Z');
const volta = V.lerBackup(JSON.parse(JSON.stringify(bk)));
igual(volta.clientes.length, 5, 'backup volta com todos os clientes');
igual([volta.premissas.conta, volta.limite], [45, 0.3], 'backup volta com premissas e limite');
igual(V.resumo(volta.clientes.find(c => c.nome === 'Padaria'), volta.premissas, volta.limite).indicadores.lancamentos.agora, 150, 'backup preserva os números');
igual(volta.clientes.find(c => c.nome === 'Novo').meses['2026-08'].notas, 0, 'backup preserva zero digitado');
let erro = '';
try { V.lerBackup({ qualquer: 1 }); } catch (e) { erro = e.message; }
igual(/não é um backup/.test(erro), true, 'arquivo errado não é aceito');
igual(V.diasDesde('2026-11-01T10:00:00.000Z', '2026-11-10T10:00:00.000Z'), 9, 'dias desde o último backup');
igual(V.normalizar(null).clientes.length, 0, 'estado vazio');

// ---------- exemplos gerados (se existirem) ----------
const pasta = path.join(__dirname, '..', 'exemplos', 'volume');
if (fs.existsSync(path.join(pasta, 'padaria-modelo-extrato-ago-a-nov-2026.xlsx'))) {
  const ler = n => { const abas = C.lerPlanilha(XLSX, new Uint8Array(fs.readFileSync(path.join(pasta, n))), n); return { abas, i: V.melhorAba(abas) }; };
  const pad = ler('padaria-modelo-extrato-ago-a-nov-2026.xlsx');
  igual(pad.abas[pad.i].nome, 'Extrato', 'exemplo xlsx: escolhe a aba Extrato');
  igual(V.prepararAba(pad.abas[pad.i].linhas).contagem.porMes, { '2026-08': 120, '2026-09': 125, '2026-10': 140, '2026-11': 160 }, 'exemplo xlsx da Padaria');
  const oti = ler('otica-visao-clara-extrato-ago-a-nov-2026.csv');
  igual(V.prepararAba(oti.abas[oti.i].linhas).contagem.porMes, { '2026-08': 80, '2026-09': 82, '2026-10': 85, '2026-11': 88 }, 'exemplo csv da Ótica');
  igual(V.lerOFX(fs.readFileSync(path.join(pasta, 'studio-pilates-leve-conta-corrente.ofx'), 'latin1')).contas[0].porMes, { '2026-08': 40, '2026-09': 42, '2026-10': 44, '2026-11': 45 }, 'exemplo ofx SGML');
  igual(V.lerOFX(fs.readFileSync(path.join(pasta, 'studio-pilates-leve-conta-digital.ofx'), 'utf8')).contas[0].porMes, { '2026-10': 10, '2026-11': 12 }, 'exemplo ofx XML');
  const bkEx = V.lerBackup(JSON.parse(fs.readFileSync(path.join(pasta, 'backup-exemplo-monitor-de-volume.json'), 'utf8')));
  const rs = V.resumos(bkEx);
  igual(rs.map(r => [r.nome, r.status]), [['Studio Pilates Leve', 'revisar'], ['Padaria Modelo', 'revisar'], ['Ótica Visão Clara', 'ok']], 'backup de exemplo: quem passa do limite');
  perto(rs[1].proporcional, 1839.29, 'backup de exemplo: proporcional da Padaria');
}

// ---------- nenhum travessão nos arquivos da ferramenta ----------
['volume.html', 'volume-logica.js', 'volume-app.js', 'volume.css', 'testes/gerar_exemplos_volume.js', 'testes/testar_volume.js', 'exemplos/volume/numeros-esperados.txt', 'exemplos/volume/backup-exemplo-monitor-de-volume.json'].forEach(f => {
  const t = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  igual(TRAVESSAO.test(t), false, 'sem travessão em ' + f);
});

console.log(`\n${ok} testes ok, ${falhou} falharam`);
process.exit(falhou ? 1 : 0);

// Gera os arquivos de exemplo do Monitor de volume em exemplos/volume/.
// Rode: node testes/gerar_exemplos_volume.js
// Clientes fictícios, agosto a novembro de 2026:
//   Padaria Modelo: extrato .xlsx com linhas de título do banco, SALDO ANTERIOR, SALDO DO DIA e linha de total.
//   Ótica Visão Clara: extrato .csv com ';', colunas Crédito e Débito, linhas de saldo e uma linha com valor zero.
//   Studio Pilates Leve: dois .ofx (conta corrente em SGML antigo e conta digital em XML, aberta em outubro).
const fs = require('fs');
const path = require('path');
const XLSX = require('../vendor/xlsx.full.min.js');
const V = require('../volume-logica.js');
const C = require('../comum.js');

const pasta = path.join(__dirname, '..', 'exemplos', 'volume');
fs.mkdirSync(pasta, { recursive: true });

// números esperados (lançamentos por mês)
const ESPERADO = {
  padaria: { '2026-08': 120, '2026-09': 125, '2026-10': 140, '2026-11': 160 },
  otica: { '2026-08': 80, '2026-09': 82, '2026-10': 85, '2026-11': 88 },
  pilatesCorrente: { '2026-08': 40, '2026-09': 42, '2026-10': 44, '2026-11': 45 },
  pilatesDigital: { '2026-10': 10, '2026-11': 12 }
};

// sorteio que sempre dá o mesmo resultado
let semente = 7;
function sorte() { semente = (semente * 1103515245 + 12345) % 2147483648; return semente / 2147483648; }
function escolher(lista) { return lista[Math.floor(sorte() * lista.length)]; }
function dinheiro(min, max) { return Math.round((min + sorte() * (max - min)) * 100) / 100; }
function dois(n) { return (n < 10 ? '0' : '') + n; }
function diasDoMes(mes) { const [a, m] = mes.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).getUTCDate(); }
// Espalha n lançamentos nos dias úteis do mês. Devolve lista de dias (números) em ordem.
function espalhar(mes, n) {
  const [a, m] = mes.split('-').map(Number);
  const uteis = [];
  for (let d = 1; d <= diasDoMes(mes); d++) { const s = new Date(Date.UTC(a, m - 1, d)).getUTCDay(); if (s !== 0 && s !== 6) uteis.push(d); }
  const dias = [];
  for (let i = 0; i < n; i++) dias.push(uteis[Math.floor(i * uteis.length / n)]);
  return dias;
}
const ENTRADAS = ['PIX RECEBIDO', 'VENDA CARTAO DEBITO', 'VENDA CARTAO CREDITO', 'DEPOSITO', 'TED RECEBIDA'];
const SAIDAS = ['PAGTO FORNECEDOR', 'PIX ENVIADO', 'TARIFA BANCARIA', 'PAGTO BOLETO', 'DEBITO AUTOMATICO ENERGIA', 'FOLHA DE PAGAMENTO'];
function lancamento() {
  const entrada = sorte() < 0.55;
  return { hist: escolher(entrada ? ENTRADAS : SAIDAS), valor: entrada ? dinheiro(20, 2500) : -dinheiro(15, 1800) };
}

// ---------- Padaria Modelo (.xlsx) ----------
{
  const linhas = [
    ['BANCO EXEMPLO S.A.'],
    ['Extrato de conta corrente'],
    ['Cliente: PADARIA MODELO LTDA', '', 'Agência 0001', 'Conta 12345-6'],
    ['Período: 01/08/2026 a 30/11/2026'],
    [],
    ['Data', 'Histórico', 'Documento', 'Valor (R$)', 'Saldo (R$)'],
    [new Date(2026, 6, 31), 'SALDO ANTERIOR', '', '', 8000]
  ];
  let saldo = 8000, total = 0;
  Object.keys(ESPERADO.padaria).forEach(mes => {
    const [a, m] = mes.split('-').map(Number);
    const dias = espalhar(mes, ESPERADO.padaria[mes]);
    dias.forEach((d, i) => {
      const l = lancamento();
      saldo = Math.round((saldo + l.valor) * 100) / 100; total += l.valor;
      linhas.push([new Date(a, m - 1, d), l.hist, String(100000 + linhas.length), l.valor, '']);
      if (dias[i + 1] !== d) linhas.push([new Date(a, m - 1, d), 'SALDO DO DIA', '', '', saldo]);
    });
  });
  linhas.push(['', 'Total', '', Math.round(total * 100) / 100, '']);
  const ws = XLSX.utils.aoa_to_sheet(linhas, { cellDates: false });
  ws['!cols'] = [{ wch: 12 }, { wch: 30 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Informações'], ['Este extrato é fictício, feito para treinar.']]), 'Leia');
  XLSX.utils.book_append_sheet(wb, ws, 'Extrato');
  fs.writeFileSync(path.join(pasta, 'padaria-modelo-extrato-ago-a-nov-2026.xlsx'), Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })));
}

// ---------- Ótica Visão Clara (.csv com ;) ----------
{
  const L = ['Data;Lançamento;Crédito (R$);Débito (R$);Saldo (R$)', '31/07/2026;SALDO ANTERIOR;;;3.200,00'];
  let saldo = 3200;
  const br = v => C.num(v, 2);
  Object.keys(ESPERADO.otica).forEach(mes => {
    const [a, m] = mes.split('-');
    const dias = espalhar(mes, ESPERADO.otica[mes]);
    dias.forEach((d, i) => {
      const l = lancamento();
      saldo = Math.round((saldo + l.valor) * 100) / 100;
      const data = dois(d) + '/' + m + '/' + a;
      L.push([data, '"' + l.hist + '"', l.valor > 0 ? br(l.valor) : '', l.valor < 0 ? br(-l.valor) : '', ''].join(';'));
      if (i === 3) L.push([data, 'ESTORNO TARIFA', '0,00', '', ''].join(';'));
      if (dias[i + 1] !== d && i % 5 === 0) L.push([data, 'S A L D O', '', '', br(saldo)].join(';'));
    });
  });
  L.push(';SALDO FINAL;;;' + br(saldo));
  fs.writeFileSync(path.join(pasta, 'otica-visao-clara-extrato-ago-a-nov-2026.csv'), Buffer.from(L.join('\r\n') + '\r\n', 'latin1'));
}

// ---------- Studio Pilates Leve (.ofx) ----------
function transacoesOFX(porMes, fecha) {
  let s = '', n = 0;
  Object.keys(porMes).forEach(mes => {
    const [a, m] = mes.split('-');
    espalhar(mes, porMes[mes]).forEach(d => {
      const l = lancamento(); n++;
      const valor = l.valor.toFixed(2);
      if (fecha) s += `<STMTTRN>\n<TRNTYPE>${l.valor > 0 ? 'CREDIT' : 'DEBIT'}</TRNTYPE>\n<DTPOSTED>${a}${m}${dois(d)}100000[-3:BRT]</DTPOSTED>\n<TRNAMT>${valor}</TRNAMT>\n<FITID>${a}${m}${dois(d)}${n}</FITID>\n<MEMO>${l.hist}</MEMO>\n</STMTTRN>\n`;
      else s += `<STMTTRN>\n<TRNTYPE>${l.valor > 0 ? 'CREDIT' : 'DEBIT'}\n<DTPOSTED>${a}${m}${dois(d)}100000[-3:BRT]\n<TRNAMT>${valor}\n<FITID>${a}${m}${dois(d)}${n}\n<MEMO>${l.hist}\n</STMTTRN>\n`;
    });
  });
  return s;
}
{
  // conta corrente, SGML antigo (sem fechar as tags)
  const ofx = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<SIGNONMSGSRSV1>
<SONRS>
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<DTSERVER>20261201080000[-3:BRT]
<LANGUAGE>POR
</SONRS>
</SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>1001
<STATUS>
<CODE>0
<SEVERITY>INFO
</STATUS>
<STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>0999
<BRANCHID>0001
<ACCTID>11111-1
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20260801100000[-3:BRT]
<DTEND>20261130100000[-3:BRT]
${transacoesOFX(ESPERADO.pilatesCorrente, false)}</BANKTRANLIST>
<LEDGERBAL>
<BALAMT>4321.00
<DTASOF>20261130100000[-3:BRT]
</LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;
  fs.writeFileSync(path.join(pasta, 'studio-pilates-leve-conta-corrente.ofx'), ofx);
  // conta digital, XML (com tags de fechamento), aberta em outubro
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<?OFX OFXHEADER="200" VERSION="211" SECURITY="NONE" OLDFILEUID="NONE" NEWFILEUID="NONE"?>
<OFX>
<SIGNONMSGSRSV1><SONRS><STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS><DTSERVER>20261201080000</DTSERVER><LANGUAGE>POR</LANGUAGE></SONRS></SIGNONMSGSRSV1>
<BANKMSGSRSV1>
<STMTTRNRS>
<TRNUID>2002</TRNUID>
<STATUS><CODE>0</CODE><SEVERITY>INFO</SEVERITY></STATUS>
<STMTRS>
<CURDEF>BRL</CURDEF>
<BANKACCTFROM><BANKID>0888</BANKID><BRANCHID>0001</BRANCHID><ACCTID>22222-2</ACCTID><ACCTTYPE>CHECKING</ACCTTYPE></BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20261001</DTSTART>
<DTEND>20261130</DTEND>
${transacoesOFX(ESPERADO.pilatesDigital, true)}</BANKTRANLIST>
<LEDGERBAL><BALAMT>980.00</BALAMT><DTASOF>20261130</DTASOF></LEDGERBAL>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>
`;
  fs.writeFileSync(path.join(pasta, 'studio-pilates-leve-conta-digital.ofx'), xml);
}

// ---------- confere lendo de volta, monta um backup de exemplo e escreve os números esperados ----------
function contarPlanilha(nome) {
  const abas = C.lerPlanilha(XLSX, new Uint8Array(fs.readFileSync(path.join(pasta, nome))), nome);
  const p = V.prepararAba(abas[V.melhorAba(abas)].linhas);
  return p.contagem;
}
function contarOFX(nome) { return V.lerOFX(fs.readFileSync(path.join(pasta, nome), 'latin1')); }
const cPad = contarPlanilha('padaria-modelo-extrato-ago-a-nov-2026.xlsx');
const cOti = contarPlanilha('otica-visao-clara-extrato-ago-a-nov-2026.csv');
const cCor = contarOFX('studio-pilates-leve-conta-corrente.ofx');
const cDig = contarOFX('studio-pilates-leve-conta-digital.ofx');
const confere = (a, b, nome) => { if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('DIFERENTE:', nome, JSON.stringify(a), JSON.stringify(b)); process.exitCode = 1; } };
confere(cPad.porMes, ESPERADO.padaria, 'padaria');
confere(cOti.porMes, ESPERADO.otica, 'otica');
confere(cCor.contas[0].porMes, ESPERADO.pilatesCorrente, 'pilates corrente');
confere(cDig.contas[0].porMes, ESPERADO.pilatesDigital, 'pilates digital');

const estado = V.novoEstado();
const pad = V.novoCliente('Padaria Modelo', 1500, '2026-08');
const oti = V.novoCliente('Ótica Visão Clara', 900, '2026-08');
const pil = V.novoCliente('Studio Pilates Leve', 700, '2026-08');
V.registrarFonte(pad, 'padaria-modelo-extrato-ago-a-nov-2026.xlsx', cPad.porMes);
V.registrarFonte(oti, 'otica-visao-clara-extrato-ago-a-nov-2026.csv', cOti.porMes);
V.registrarFonte(pil, 'studio-pilates-leve-conta-corrente.ofx', cCor.contas[0].porMes);
V.registrarFonte(pil, 'studio-pilates-leve-conta-digital.ofx', cDig.contas[0].porMes);
const manuais = {
  pad: [pad, { '2026-08': [8, null], '2026-09': [8, null], '2026-10': [9, null], '2026-11': [9, null] }],
  oti: [oti, { '2026-08': [3, 40], '2026-09': [3, 41], '2026-10': [3, 43], '2026-11': [3, 45] }],
  pil: [pil, { '2026-08': [2, 20], '2026-09': [2, 20], '2026-10': [2, 21], '2026-11': [2, 22] }]
};
Object.values(manuais).forEach(([cli, meses]) => Object.keys(meses).forEach(m => {
  V.definirValor(cli, m, 'funcionarios', meses[m][0]);
  V.definirValor(cli, m, 'notas', meses[m][1]);
}));
estado.clientes.push(pad, oti, pil);
estado.ultimoBackup = '2026-11-23T12:00:00.000Z';
fs.writeFileSync(path.join(pasta, 'backup-exemplo-monitor-de-volume.json'), JSON.stringify(V.criarBackup(estado, '2026-11-23T12:00:00.000Z'), null, 2));

const linhas = [
  'MONITOR DE VOLUME: NÚMEROS ESPERADOS DOS EXEMPLOS',
  '',
  'Tempos de referência padrão: 2 min por lançamento, 3 por nota fiscal, 15 por funcionário, 60 por conta bancária. Limite de alerta: 20%.',
  'Mês base de todos: agosto de 2026. Último mês: novembro de 2026.',
  'Funcionários e notas fiscais não vêm no extrato: estão só no backup-exemplo-monitor-de-volume.json (Restaurar backup).',
  '',
  'Lançamentos por mês (ago, set, out, nov):',
  '  Padaria Modelo (.xlsx, uma aba "Leia" e a aba "Extrato"; ignora SALDO ANTERIOR, SALDO DO DIA e Total): ' + Object.values(cPad.porMes).join(', ') +
    '. Linhas de saldo ignoradas: ' + cPad.ignoradas.saldo + ', total: ' + cPad.ignoradas.total + '.',
  '  Ótica Visão Clara (.csv com ;, ignora SALDO ANTERIOR, S A L D O, SALDO FINAL e ESTORNO TARIFA de valor zero): ' + Object.values(cOti.porMes).join(', ') +
    '. Saldo ignoradas: ' + cOti.ignoradas.saldo + ', valor zero: ' + cOti.ignoradas.zero + '.',
  '  Studio Pilates Leve, conta corrente (.ofx SGML): ' + Object.values(cCor.contas[0].porMes).join(', '),
  '  Studio Pilates Leve, conta digital (.ofx XML, só out e nov): ' + Object.values(cDig.contas[0].porMes).join(', '),
  '',
  'Resultado com o backup de exemplo:'
];
V.resumos(estado).forEach(r => {
  const i = r.indicadores;
  linhas.push('  ' + r.nome + ': ' + V.ROT_STATUS[r.status]);
  linhas.push('    lançamentos ' + i.lancamentos.base + ' -> ' + i.lancamentos.agora + ' (' + C.pct(i.lancamentos.variacao) + '), contas ' + i.contas.base + ' -> ' + i.contas.agora +
    ', funcionários ' + i.funcionarios.base + ' -> ' + i.funcionarios.agora + ', notas ' + (i.notas.base == null ? 'não informadas' : i.notas.base + ' -> ' + i.notas.agora));
  linhas.push('    horas de referência ' + C.num(r.horasBase, 2) + ' -> ' + C.num(r.horasAgora, 2) + ', honorário por hora ' + C.brl(r.hhBase) + ' -> ' + C.brl(r.hhAgora) +
    ', honorário proporcional ao volume ' + C.brl(r.proporcional));
});
fs.writeFileSync(path.join(pasta, 'numeros-esperados.txt'), linhas.join('\r\n') + '\r\n');
console.log(linhas.join('\n'));
console.log('\nArquivos gerados em ' + pasta);

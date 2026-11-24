// Gera os arquivos de exemplo da ferramenta Recorrentes em exemplos/onboarding/.
// Rode: node testes/gerar_exemplos_onboarding.js
// Cliente fictício "Escritório Modelo", dezembro de 2025 a novembro de 2026 (12 meses):
//   conta corrente .xlsx com título do banco, SALDO ANTERIOR, SALDO DO DIA e linha de Total;
//   conta digital .csv com ';', colunas Crédito e Débito e linhas de saldo;
//   modelo_importacao_EXEMPLO.xlsx: modelo genérico, NÃO é o oficial do Conta Azul.
const fs = require('fs');
const path = require('path');
const XLSX = require('../vendor/xlsx.full.min.js');
const C = require('../comum.js');
const O = require('../onboarding-logica.js');

const pasta = path.join(__dirname, '..', 'exemplos', 'onboarding');
fs.mkdirSync(pasta, { recursive: true });

const MESES = ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11'];
function dois(n) { return (n < 10 ? '0' : '') + n; }
function br(iso) { return C.dataBR(iso); }
function dm(iso) { return iso.slice(8, 10) + '/' + iso.slice(5, 7); }
function digitoCNPJ(base12) {
  let d = base12;
  [[5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]].forEach(p => {
    const s = p.reduce((t, w, i) => t + w * Number(d[i]), 0), r = s % 11;
    d += r < 2 ? 0 : 11 - r;
  });
  return d;
}
const CNPJ_IMOB = '11222333000181';
const CNPJ_CONTAB = digitoCNPJ('987654320001');
const fmtCNPJ = O.formatarDoc;
function digitoCPF(base9) {
  let d = base9;
  [10, 11].forEach(t => { const s = [...d].reduce((x, c, i) => x + Number(c) * (t - i), 0); d += ((s * 10) % 11) % 10; });
  return d;
}
const CPF_MARIA = digitoCPF('529982247'), CPF_JOAO = digitoCPF('111444777');

// valores variáveis (um por mês, dez a nov)
const ENERGIA = [412.37, 455.10, 498.62, 470.15, 430.80, 395.44, 380.21, 388.90, 401.33, 420.75, 446.18, 489.02];
const DIA_ENERGIA = [12, 11, 12, 13, 12, 12, 11, 12, 13, 12, 12, 12];
const DAS = [812.40, 905.33, 1020.10, 880.00, 950.45, 1105.80, 990.12, 1010.00, 870.66, 940.20, 1080.35, 1150.90];
const MERCADO = [1210.00, 1350.50, 1280.00, 1495.20, 1320.00, 1410.75, 1255.30, 1388.00, 1300.00, 1450.00, 1365.40, 1480.10];
const SABESP = [98.40, 112.75, 130.20, 125.60, 104.30, 95.10, 90.80, 99.95, 118.45, 140.10, 152.33, 159.80];

// ---------- conta corrente (.xlsx) ----------
const corrente = [];
function add(lista, iso, hist, valor, doc) { lista.push({ iso, hist, valor, doc: doc || '' }); }
MESES.forEach((mes, i) => {
  const d = dia => mes + '-' + dois(dia);
  add(corrente, d(1), 'TAR PACOTE SERVICOS', -59.90);
  add(corrente, d(5), 'PIX ENVIADO IMOBILIARIA LAR LTDA ' + fmtCNPJ(CNPJ_IMOB), -3500.00);
  add(corrente, d(5), 'PIX ENVIADO ' + fmtCNPJ(CPF_MARIA) + ' MARIA SOUZA', -2200.00);
  add(corrente, d(5), 'PIX ENVIADO ' + fmtCNPJ(CPF_JOAO) + ' JOAO LIMA', -1900.00);
  add(corrente, d(10), 'PIX ENVIADO CONTABILIDADE EXATA ' + fmtCNPJ(CNPJ_CONTAB), -650.00);
  add(corrente, d(10), 'PIX RECEBIDO CLINICA BEM ESTAR LTDA', 2500.00);
  add(corrente, d(DIA_ENERGIA[i]), 'PAG BOLETO ' + (40001 + i * 37) + ' CEMIG DISTRIBUICAO', -ENERGIA[i], String(40001 + i * 37));
  add(corrente, d(15), 'DEB AUT VIVO FIBRA ' + mes.slice(5, 7) + '/' + mes.slice(2, 4), -149.90);
  add(corrente, d(15), 'TED RECEBIDA 033 0001 PADARIA PAO BOM', 1800.00);
  add(corrente, d(20), 'PAGAMENTO DAS SIMPLES NACIONAL 0720' + (2512345 + i), -DAS[i]);
  if (i <= 8) add(corrente, d(8), 'COMPRA CARTAO DEB MP*CANVA ' + dm(d(8)), -34.90); // assinatura que parou em agosto
  if (i >= 3) add(corrente, d(10), 'PAG TRIBUTO PREFEITURA IPTU 2026 PARC ' + dois(i - 2) + '/10', -420.00); // mar a nov: parcelas 1 a 9
});
add(corrente, '2026-03-18', 'PAG BOLETO PORTO SEGURO EMPRESA', -1890.00); // seguro anual
// avulsos (não são recorrentes)
add(corrente, '2026-02-09', 'COMPRA CARTAO KALUNGA', -187.45);
add(corrente, '2026-04-22', 'PIX ENVIADO JOSE PEREIRA', -300.00);
add(corrente, '2026-01-14', 'PAG BOLETO LEROY MERLIN', -642.10);
add(corrente, '2026-06-17', 'PAG BOLETO LEROY MERLIN', -229.90);
add(corrente, '2025-12-19', 'PIX QRS PADARIA DO ZE ' + '19/12', -48.00);
add(corrente, '2026-01-23', 'PIX QRS PADARIA DO ZE ' + '23/01', -36.50);
add(corrente, '2026-06-04', 'PIX QRS PADARIA DO ZE ' + '04/06', -52.00);
add(corrente, '2026-02-11', 'COMPRA CARTAO POSTO SHELL', -210.00);
add(corrente, '2026-07-07', 'COMPRA CARTAO POSTO SHELL', -195.00);
add(corrente, '2026-08-21', 'COMPRA CARTAO POSTO SHELL', -230.00);
add(corrente, '2026-10-13', 'COMPRA CARTAO POSTO SHELL', -188.00);
add(corrente, '2026-07-28', 'PIX RECEBIDO VENDA AVULSA', 350.00);
corrente.sort((a, b) => a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0);

// monta a planilha com título, saldos e total
const aoa = [['BANCO EXEMPLO S.A.'], ['Extrato de conta corrente | Escritório Modelo | Ag. 0001 C/C 12345-6'], ['Período: 01/12/2025 a 30/11/2026'], [],
  ['Data', 'Histórico', 'Documento', 'Valor (R$)', 'Saldo (R$)']];
let saldo = 20000;
aoa.push([O.serialDe('2025-11-30'), 'SALDO ANTERIOR', '', '', saldo]);
let saldosDoDia = 0;
corrente.forEach((m, k) => {
  saldo = Math.round((saldo + m.valor) * 100) / 100;
  aoa.push([O.serialDe(m.iso), m.hist, m.doc, m.valor, '']);
  const prox = corrente[k + 1];
  if ((!prox || prox.iso !== m.iso) && m.iso.endsWith('-15')) { aoa.push([O.serialDe(m.iso), 'SALDO DO DIA', '', '', saldo]); saldosDoDia++; }
});
aoa.push(['', 'Total', '', Math.round(corrente.reduce((s, m) => s + m.valor, 0) * 100) / 100, '']);
const folha = XLSX.utils.aoa_to_sheet(aoa);
const area = XLSX.utils.decode_range(folha['!ref']);
for (let r = 5; r <= area.e.r; r++) {
  const c0 = folha[XLSX.utils.encode_cell({ r, c: 0 })];
  if (c0 && c0.t === 'n') c0.z = 'dd/mm/yyyy';
  [3, 4].forEach(c => { const cel = folha[XLSX.utils.encode_cell({ r, c })]; if (cel && cel.t === 'n') cel.z = '#,##0.00'; });
}
folha['!cols'] = [{ wch: 12 }, { wch: 52 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
const livro = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(livro, folha, 'Extrato');
const ARQ_CORRENTE = 'escritorio-modelo-conta-corrente-dez25-a-nov26.xlsx';
fs.writeFileSync(path.join(pasta, ARQ_CORRENTE), Buffer.from(XLSX.write(livro, { type: 'array', bookType: 'xlsx' })));

// ---------- conta digital (.csv com ;) ----------
const digital = [];
MESES.forEach((mes, i) => {
  const d = dia => mes + '-' + dois(dia);
  add(digital, d(3), 'COMPRA CARTAO GOOGLE*WORKSPACE', -45.00);
  add(digital, d(22), 'DEBITO AUTOMATICO SABESP ' + (880100 + i), -SABESP[i]);
  add(digital, d(25), 'Pix recebido: "Mercado Boa Vista"', MERCADO[i]);
});
add(digital, '2026-05-09', 'Pix enviado: "Fulano Eventos"', -480.00);
add(digital, '2026-03-30', 'COMPRA CARTAO AMAZON MARKETPLACE', -159.90);
add(digital, '2026-09-12', 'COMPRA CARTAO AMAZON MARKETPLACE', -89.90);
digital.sort((a, b) => a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0);
function brNum(v) { return v ? C.brl(Math.abs(v)).replace('R$ ', '') : ''; }
const csv = ['Conta Digital Exemplo;;;;', 'Extrato de 01/12/2025 a 30/11/2026;;;;', 'Data;Descrição;Crédito;Débito;Saldo', '30/11/2025;SALDO ANTERIOR;;;5.000,00'];
let saldo2 = 5000;
digital.forEach(m => {
  saldo2 = Math.round((saldo2 + m.valor) * 100) / 100;
  const h = m.hist.indexOf(';') >= 0 || m.hist.indexOf('"') >= 0 ? '"' + m.hist.replace(/"/g, '""') + '"' : m.hist;
  csv.push([br(m.iso), h, m.valor > 0 ? brNum(m.valor) : '', m.valor < 0 ? brNum(m.valor) : '', ''].join(';'));
});
csv.push('30/11/2026;SALDO FINAL;;;' + brNum(saldo2));
const ARQ_DIGITAL = 'escritorio-modelo-conta-digital-dez25-a-nov26.csv';
fs.writeFileSync(path.join(pasta, ARQ_DIGITAL), '﻿' + csv.join('\r\n') + '\r\n');

// ---------- modelo de importação genérico (EXEMPLO, não é o oficial) ----------
const modeloAoa = [
  ['MODELO DE EXEMPLO PARA TESTE (não é o modelo oficial do Conta Azul)'],
  ['Preencha a partir da linha 4. Uma linha por vencimento. Datas no formato dd/mm/aaaa.'],
  ['Data de competência', 'Data de vencimento', 'Descrição', 'Valor', 'Fornecedor/Cliente', 'CPF/CNPJ', 'Categoria', 'Centro de custo', 'Forma de pagamento', 'Conta financeira', 'Observações', 'Tipo'],
  ['05/01/2026', '05/01/2026', 'Exemplo: aluguel de janeiro', 1500, 'Imobiliária Exemplo', '', 'Aluguel', '', 'Boleto', 'Conta corrente', '', 'Despesa']
];
const fModelo = XLSX.utils.aoa_to_sheet(modeloAoa);
fModelo['D4'].z = '#,##0.00';
fModelo['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } }];
fModelo['!cols'] = [16, 16, 34, 12, 28, 18, 22, 16, 18, 18, 30, 10].map(w => ({ wch: w }));
const livroModelo = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(livroModelo, fModelo, 'Lançamentos');
XLSX.utils.book_append_sheet(livroModelo, XLSX.utils.aoa_to_sheet([['Instruções'], ['Este arquivo é só um exemplo para testar a ferramenta.'], ['Baixe o modelo de verdade dentro do Conta Azul do cliente.']]), 'Instruções');
const ARQ_MODELO = 'modelo_importacao_EXEMPLO.xlsx';
fs.writeFileSync(path.join(pasta, ARQ_MODELO), Buffer.from(XLSX.write(livroModelo, { type: 'array', bookType: 'xlsx' })));

// ---------- confere lendo de volta, como a página faz ----------
function lerExtrato(arquivo) {
  const abas = C.lerPlanilha(XLSX, new Uint8Array(fs.readFileSync(path.join(pasta, arquivo))), arquivo);
  const a = abas[O.melhorAba(abas)], p = O.prepararAba(a.linhas);
  return O.lerMovimentos(a.linhas, p.inicio, p.escolha, arquivo.replace(/\.[^.]+$/, ''));
}
const lidoC = lerExtrato(ARQ_CORRENTE), lidoD = lerExtrato(ARQ_DIGITAL);
const achado = O.acharRecorrentes(lidoC.movs.concat(lidoD.movs), { minMeses: 3 });
const incluidos = achado.itens.filter(i => i.incluir);
const ocorr = O.gerarOcorrencias(achado.itens, '2026-12', 12);

const linhas = [
  'RECORRENTES PARA O CONTA AZUL: NÚMEROS ESPERADOS DOS EXEMPLOS',
  '',
  'Cliente fictício: Escritório Modelo. Extratos de dezembro de 2025 a novembro de 2026 (12 meses). Mínimo de meses: 3.',
  'O arquivo ' + ARQ_MODELO + ' é um modelo GENÉRICO de teste. Não é o modelo oficial do Conta Azul.',
  '',
  'Leitura dos extratos:',
  '  ' + ARQ_CORRENTE + ': ' + lidoC.movs.length + ' lançamentos (' + lidoC.ignoradas.saldo + ' linhas de saldo e ' + lidoC.ignoradas.total + ' de total ignoradas)',
  '  ' + ARQ_DIGITAL + ': ' + lidoD.movs.length + ' lançamentos (' + lidoD.ignoradas.saldo + ' linhas de saldo ignoradas)',
  '',
  'Recorrentes achados: ' + achado.itens.length + ' (' + incluidos.length + ' já marcados para incluir). Avulsos que ficaram de fora: ' + achado.avulsos.length + '.',
  ''
];
achado.itens.forEach(it => {
  linhas.push('  [' + (it.incluir ? 'x' : ' ') + '] ' + (it.tipo === 'pagar' ? 'Pagar  ' : 'Receber') + ' | ' + it.nome + ' | ' + it.categoria + ' | dia ' + it.dia + ' | ' + it.periodicidade +
    ' | ' + C.brl(it.valor) + (it.variavel ? ' (variável)' : '') + ' | ' + it.vezes + (it.vezes === 1 ? ' vez' : ' vezes') + (it.situacao.length ? ' | ' + it.situacao.join('; ') : ''));
});
linhas.push('', 'Avulsos (não recorrentes):');
achado.avulsos.forEach(a => linhas.push('  ' + a.nome + ' (' + a.tipo + ', ' + a.vezes + (a.vezes === 1 ? ' vez' : ' vezes') + ', meses ' + a.meses.map(C.mesCurto).join(' ') + ')'));
linhas.push('', 'Gerando a partir de dezembro de 2026 por 12 meses, só os marcados: ' + ocorr.length + ' linhas (' +
  ocorr.filter(o => o.item.tipo === 'pagar').length + ' a pagar e ' + ocorr.filter(o => o.item.tipo === 'receber').length + ' a receber).',
  '  O IPTU gera só 1 linha (10/10 em 10/12/2026). A energia sai com ' + C.brl(achado.itens.find(i => /CEMIG/.test(i.chave)).valor) + ' (média dos últimos 3 meses).',
  '  Se marcar o seguro anual, ele entra 1 vez, em 18/03/2027. Se marcar o Canva, entra 12 vezes no dia 8.');
fs.writeFileSync(path.join(pasta, 'numeros-esperados.txt'), linhas.join('\r\n') + '\r\n');
console.log(linhas.join('\n'));
console.log('\nArquivos gerados em ' + pasta);

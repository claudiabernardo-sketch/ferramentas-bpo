// Testes da base comum. Rode: node testes/testar_comum.js
const C = require('../comum.js');
const XLSX = require('../vendor/xlsx.full.min.js');
let ok = 0, falhou = 0;
function igual(obtido, esperado, nome) {
  const a = JSON.stringify(obtido), b = JSON.stringify(esperado);
  if (a === b) ok++; else { falhou++; console.log('FALHOU:', nome, '\n  obtido  ', a, '\n  esperado', b); }
}

// números
[['1.234,56', 1234.56], ['R$ 1.234,56', 1234.56], ['-1.234,56', -1234.56], ['(1.234,56)', -1234.56],
 ['1.234,56-', -1234.56], ['1.234,56 D', -1234.56], ['1.234,56 C', 1234.56], ['1,234.56', 1234.56],
 ['1234.5', 1234.5], ['1.234', 1234], ['12,5', 12.5], ['R$ -50,00', -50], ['- R$ 50,00', -50], [' 7 ', 7],
 [1234.567, 1234.57], ['', null], ['abc', null], ['12/05/2026', null], ['1.234.567,89', 1234567.89],
 ['0,99', 0.99], ['R$ 1.000,00', 1000], ['+300,00', 300]
].forEach(([e, s]) => igual(C.valor(e), s, 'valor ' + e));

// datas
[['05/11/2026', '2026-11-05'], ['5/11/26', '2026-11-05'], ['2026-11-05', '2026-11-05'], ['2026-11-05T10:00:00', '2026-11-05'],
 ['05-11-2026', '2026-11-05'], ['05.11.2026', '2026-11-05'], ['31/02/2026', null], ['46331', '2026-11-05'], [46331, '2026-11-05'],
 ['05/nov/2026', '2026-11-05'], ['5 de', null], ['', null], ['05/11/2026 14:32', '2026-11-05'], [12.5, null]
].forEach(([e, s]) => igual(C.data(e), s, 'data ' + e));

igual(C.brl(1234.5), 'R$ 1.234,50', 'brl');
igual(C.brl(-0.5), '-R$ 0,50', 'brl neg');
igual(C.pct(0.1234), '12,3%', 'pct');
igual(C.mesCurto('2026-11'), 'nov/26', 'mesCurto');
igual(C.mesLongo('2026-03'), 'março de 2026', 'mesLongo');
igual(C.mesAnterior('2026-01'), '2025-12', 'mesAnterior');

// CSV com ; e aspas, e com vírgula
igual(C.lerCSV('﻿Data;Descrição;Valor\n01/11/2026;"Aluguel; loja";-1.500,00\n'), [['Data', 'Descrição', 'Valor'], ['01/11/2026', 'Aluguel; loja', '-1.500,00']], 'csv ;');
igual(C.lerCSV('Data,Valor\n2026-11-01,"1,500.00"\n2026-11-02,20'), [['Data', 'Valor'], ['2026-11-01', '1,500.00'], ['2026-11-02', '20']], 'csv ,');
igual(C.decodificar(Uint8Array.from([0x44, 0x65, 0x73, 0x63, 0x72, 0x69, 0xe7, 0xe3, 0x6f])), 'Descrição', 'latin1');

// cabeçalho com linhas de título antes
const campos = [
  { chave: 'data', rotulo: 'Data', obrigatorio: true, sinonimos: ['data', 'data movimento', 'data de pagamento', 'vencimento'] },
  { chave: 'valor', rotulo: 'Valor', obrigatorio: true, sinonimos: ['valor', 'valor (r$)', 'valor pago'], evitar: ['valor original'] },
  { chave: 'categoria', rotulo: 'Categoria', obrigatorio: true, sinonimos: ['categoria', 'categoria 1', 'plano de contas'] },
  { chave: 'descricao', rotulo: 'Descrição', sinonimos: ['descricao', 'historico', 'observacao'] }
];
const linhas = [
  ['Empresa Teste LTDA', '', '', ''],
  ['Relatório de movimentações de 01/11/2026 a 30/11/2026', '', '', ''],
  ['', '', '', ''],
  ['Data movimento', 'Descrição', 'Categoria 1', 'Valor original', 'Valor (R$)'],
  ['01/11/2026', 'Aluguel', 'Aluguel', '1.500,00', '-1.500,00'],
  ['Total', '', '', '', '-1.500,00']
];
const cab = C.acharCabecalho(linhas, campos);
igual(cab, 3, 'acha cabeçalho');
const esc = C.detectarColunas(linhas[cab], campos);
igual(esc, { data: 0, valor: 4, categoria: 2, descricao: 1 }, 'detecta colunas');
igual(C.faltando({ data: 0, valor: -1, categoria: 2 }, campos).map(c => c.chave), ['valor'], 'faltando');
igual(C.linhasComCampos(linhas, cab, esc).length, 2, 'linhas com campos');
igual(C.pareceTotal(linhas[5]), true, 'linha de total');
igual(C.pareceTotal(linhas[4]), false, 'linha normal');

// planilha xlsx de verdade, com data como número de série
const ws = XLSX.utils.aoa_to_sheet([['Relatório'], ['Data', 'Valor'], [new Date(2026, 10, 5), 10.5]], { cellDates: false });
const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Movimentos');
const bytes = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
const abas = C.lerPlanilha(XLSX, new Uint8Array(bytes), 'teste.xlsx');
igual(abas[0].nome, 'Movimentos', 'nome aba');
igual(abas[0].linhas[2], ['2026-11-05', 10.5], 'data do excel vira texto');
// csv pelo lerPlanilha
const csvBytes = new TextEncoder().encode('Data;Valor\n05/11/2026;10,50');
igual(C.lerPlanilha(XLSX, csvBytes, 'x.CSV')[0].linhas[1], ['05/11/2026', '10,50'], 'csv por lerPlanilha');

console.log(`\n${ok} testes ok, ${falhou} falharam`);
process.exit(falhou ? 1 : 0);

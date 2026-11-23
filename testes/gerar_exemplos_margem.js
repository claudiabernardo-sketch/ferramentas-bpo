// Gera os arquivos de exemplo da ferramenta Vendas e margem. Rode: node testes/gerar_exemplos_margem.js
// Ótica Visão Clara, novembro de 2026: vendas do sistema da loja (.xlsx), maquininha Cielo (.xlsx) e Stone (.csv).
// Divergências plantadas (os números esperados estão em testes/testar_margem.js):
//   dia 10: venda de R$ 350,00 na Cielo (crédito) que não está no sistema
//   dia 18: venda de R$ 120,00 na Stone (débito) que não está no sistema
//   dia 13: venda de R$ 480,00 lançada como "Débito Visa" no sistema, que foi crédito à vista na Cielo
//   dia 21: venda de R$ 890,00 "Cartão Crédito 3x" no sistema que não passou na maquininha
//   dia 25: venda de R$ 200,00 cancelada no sistema e estornada na Stone
//   dia 07: venda de R$ 150,00 em dinheiro cancelada no sistema
//   dia 14: venda paga com duas formas (PIX 300,00 + Cartão Débito 200,00), custo repetido nas duas linhas
//   31/10: uma venda na Cielo de outubro (o portal exportou um dia a mais)
const fs = require('fs');
const path = require('path');
const XLSX = require('../vendor/xlsx.full.min.js');

const pasta = path.join(__dirname, '..', 'exemplos', 'margem');
fs.mkdirSync(pasta, { recursive: true });

function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(2026);
const r2 = n => Math.round(n * 100) / 100;
const br = n => n.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const dd = n => String(n).padStart(2, '0');
const gravar = (livro, nome) => fs.writeFileSync(path.join(pasta, nome), XLSX.write(livro, { type: 'buffer', bookType: 'xlsx' }));

const FORMAS = [
  ['Dinheiro', 'dinheiro', 2], ['PIX', 'pix', 2], ['Pix', 'pix', 1],
  ['Débito Visa', 'debito', 2], ['Débito Master', 'debito', 1], ['Cartão Débito', 'debito', 2],
  ['Cartão Crédito à vista', 'credito_vista', 2], ['Crédito Visa', 'credito_vista', 1],
  ['Cartão Crédito 3x', 'credito_parcelado', 2], ['Crédito 6x', 'credito_parcelado', 1], ['Credito parcelado 10x', 'credito_parcelado', 1],
  ['Crediário', 'boleto', 1], ['Boleto', 'boleto', 1]
];
const sacola = [];
FORMAS.forEach(f => { for (let i = 0; i < f[2]; i++) sacola.push(f); });
const CLIENTES = ['Ana Souza', 'Bruno Lima', 'Carla Dias', 'Diego Rocha', 'Eva Martins', 'Fábio Nunes', 'Gisele Prado', 'Hugo Alves', 'Iara Melo', 'João Pires'];
const TAXA = {
  cielo: { debito: 0.0137, credito_vista: 0.0289, p2a6: 0.0349, p7a12: 0.0399 },
  stone: { debito: 0.0119, credito_vista: 0.0269, parcelado: 0.0329, pix: 0.0075 }
};
function taxaDe(maq, classe, parcelas) {
  if (maq === 'cielo') {
    if (classe === 'credito_parcelado') return parcelas <= 6 ? TAXA.cielo.p2a6 : TAXA.cielo.p7a12;
    return TAXA.cielo[classe];
  }
  if (classe === 'credito_parcelado') return TAXA.stone.parcelado;
  return TAXA.stone[classe];
}

const vendas = [];      // sistema
const cielo = [];       // {dia, mes, classe, bandeira, parcelas, bruto, liquido, status}
const stone = [];
let numVenda = 10400, nsu = 700100;

function bandeiraDoTexto(t) {
  if (/visa/i.test(t)) return 'Visa';
  if (/master/i.test(t)) return 'Mastercard';
  const b = ['Visa', 'Mastercard', 'Elo'];
  return b[Math.floor(rnd() * 3)];
}
function parcelasDoTexto(t) { const m = t.match(/(\d+)x/); return m ? +m[1] : 1; }
function maqTransacao(qual, dia, mes, classe, bandeira, parcelas, bruto, status) {
  const tx = taxaDe(qual, classe, parcelas);
  const liquido = r2(bruto * (1 - tx));
  const t = { dia, mes, classe, bandeira, parcelas, bruto, liquido, status: status || 'Aprovada', nsu: String(nsu++), hora: dd(9 + Math.floor(rnd() * 9)) + ':' + dd(Math.floor(rnd() * 60)) };
  (qual === 'cielo' ? cielo : stone).push(t);
  return t;
}
function addVenda(dia, forma, classe, valor, custo, situacao) {
  const v = { dia, numero: String(++numVenda), cliente: CLIENTES[Math.floor(rnd() * CLIENTES.length)], forma, classe, valor, custo, situacao: situacao || 'Concluída' };
  vendas.push(v);
  return v;
}

for (let dia = 1; dia <= 30; dia++) {
  const dow = new Date(Date.UTC(2026, 10, dia)).getUTCDay();
  if (dow === 0) continue; // domingo fechado
  const k = 4 + Math.floor(rnd() * 4);
  for (let i = 0; i < k; i++) {
    const f = sacola[Math.floor(rnd() * sacola.length)];
    const valor = r2(Math.floor(80 + rnd() * 1700) + 0.1 + Math.floor(rnd() * 9) / 10 + 0.09 * (i % 2)); // sempre com centavos
    const custo = r2(valor * (0.3 + rnd() * 0.15));
    const v = addVenda(dia, f[0], f[1], valor, custo);
    if (['debito', 'credito_vista', 'credito_parcelado'].includes(f[1])) {
      const qual = rnd() < 0.55 ? 'cielo' : 'stone';
      maqTransacao(qual, dia, 11, f[1], bandeiraDoTexto(f[0]), f[1] === 'credito_parcelado' ? parcelasDoTexto(f[0]) : 1, v.valor);
    } else if (f[1] === 'pix' && numVenda % 2 === 0) {
      maqTransacao('stone', dia, 11, 'pix', '', 1, v.valor); // metade dos pix passa no QR da Stone
    }
  }
}

// ---------- divergências plantadas ----------
maqTransacao('cielo', 10, 11, 'credito_vista', 'Visa', 1, 350.00);                       // só na maquininha
maqTransacao('stone', 18, 11, 'debito', 'Mastercard', 1, 120.00);                        // só na maquininha
addVenda(13, 'Débito Visa', 'debito', 480.00, 190.00);                                   // forma trocada
maqTransacao('cielo', 13, 11, 'credito_vista', 'Visa', 1, 480.00);
addVenda(21, 'Cartão Crédito 3x', 'credito_parcelado', 890.00, 360.00);                   // não passou na maquininha
addVenda(25, 'Débito Master', 'debito', 200.00, 80.00, 'Cancelada');                      // cancelada e estornada
maqTransacao('stone', 25, 11, 'debito', 'Mastercard', 1, 200.00, 'Estornada');
addVenda(7, 'Dinheiro', 'dinheiro', 150.00, 60.00, 'Cancelada');                         // cancelada
// venda paga com duas formas: duas linhas, mesmo número e custo repetido
const dupla = String(++numVenda);
vendas.push({ dia: 14, numero: dupla, cliente: 'Lia Campos', forma: 'PIX', classe: 'pix', valor: 300.00, custo: 210.00, situacao: 'Concluída' });
vendas.push({ dia: 14, numero: dupla, cliente: 'Lia Campos', forma: 'Cartão Débito', classe: 'debito', valor: 200.00, custo: 210.00, situacao: 'Concluída' });
maqTransacao('cielo', 14, 11, 'debito', 'Elo', 1, 200.00);
// outubro na Cielo
maqTransacao('cielo', 31, 10, 'credito_vista', 'Elo', 1, 410.00);

vendas.sort((a, b) => a.dia - b.dia || +a.numero - +b.numero);

// ---------- arquivo do sistema da loja ----------
const NOME_CL = { debito: 'Débito', credito_vista: 'Crédito à vista', credito_parcelado: 'Crédito parcelado loja', pix: 'Pix' };
const sis = [
  ['Ótica Visão Clara LTDA'],
  ['Relatório de vendas por período: 01/11/2026 a 30/11/2026'],
  [],
  ['Data', 'Nº venda', 'Cliente', 'Forma de pagamento', 'Valor total', 'Custo total', 'Situação']
];
vendas.forEach(v => sis.push([new Date(2026, 10, v.dia), v.numero, v.cliente, v.forma, v.valor, v.custo, v.situacao]));
const ok = vendas.filter(v => v.situacao !== 'Cancelada');
sis.push(['', '', '', 'Total', r2(ok.reduce((s, v) => s + v.valor, 0)), r2(ok.reduce((s, v) => s + v.custo, 0)), '']);
const wb1 = XLSX.utils.book_new();
const ws1 = XLSX.utils.aoa_to_sheet(sis);
ws1['!cols'] = [{ wch: 12 }, { wch: 10 }, { wch: 18 }, { wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
XLSX.utils.book_append_sheet(wb1, ws1, 'Vendas');
XLSX.utils.book_append_sheet(wb1, XLSX.utils.aoa_to_sheet([['Filtros usados'], ['Loja', 'Matriz'], ['Período', '01/11/2026 a 30/11/2026']]), 'Filtros');
gravar(wb1, 'vendas-sistema-otica-novembro-2026.xlsx');

// ---------- Cielo (.xlsx) ----------
const ci = [
  ['Relatório de vendas'],
  ['Estabelecimento: 1020304050  Ótica Visão Clara'],
  ['Período: 31/10/2026 a 30/11/2026'],
  ['Data da venda', 'Hora da venda', 'Forma de pagamento', 'Bandeira', 'Quantidade de parcelas', 'Valor bruto', 'Taxa/tarifa', 'Valor líquido', 'NSU/DOC', 'Código de autorização', 'Status']
];
cielo.sort((a, b) => a.mes - b.mes || a.dia - b.dia);
cielo.forEach(t => ci.push([new Date(2026, t.mes - 1, t.dia), t.hora, NOME_CL[t.classe], t.bandeira, t.parcelas, t.bruto, r2(t.liquido - t.bruto), t.liquido, t.nsu, 'A' + t.nsu.slice(-5), t.status]));
const wb2 = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb2, XLSX.utils.aoa_to_sheet(ci), 'Vendas');
gravar(wb2, 'maquininha-cielo-novembro-2026.xlsx');

// ---------- Stone (.csv com ;) ----------
const TIPO_ST = { debito: 'Débito', credito_vista: 'Crédito', credito_parcelado: 'Crédito', pix: 'Pix' };
stone.sort((a, b) => a.dia - b.dia);
const st = ['DATA DA VENDA;TIPO;BANDEIRA;Nº DE PARCELAS;VALOR BRUTO;VALOR LÍQUIDO;STATUS;STONE ID'];
stone.forEach(t => st.push([dd(t.dia) + '/' + dd(t.mes) + '/2026 ' + t.hora, TIPO_ST[t.classe], t.bandeira, t.parcelas, br(t.bruto), br(t.liquido), t.status === 'Aprovada' ? 'Aprovado' : t.status, 'ST' + t.nsu].join(';')));
fs.writeFileSync(path.join(pasta, 'maquininha-stone-novembro-2026.csv'), '﻿' + st.join('\r\n') + '\r\n', 'utf8');

// ---------- gabarito (para conferir e escrever nos testes) ----------
const nov = arr => arr.filter(t => t.mes === 11 && t.status === 'Aprovada');
const CARTAO = ['debito', 'credito_vista', 'credito_parcelado'];
const soma = (arr, f) => r2(arr.reduce((s, x) => s + f(x), 0));
const maqNov = nov(cielo).concat(nov(stone));
const custoDupla = 210;
const gab = {
  linhasSistema: vendas.length, canceladas: vendas.length - ok.length, vendasValidas: ok.length,
  transCielo: cielo.length, transStone: stone.length,
  vendas: soma(ok, v => v.valor),
  cartaoSistema: soma(ok.filter(v => CARTAO.includes(v.classe)), v => v.valor),
  maquininha: soma(maqNov.filter(t => CARTAO.includes(t.classe)), t => t.bruto),
  taxas: soma(maqNov, t => t.bruto - t.liquido),
  brutoTodas: soma(maqNov, t => t.bruto),
  cmvColuna: r2(soma(ok, v => v.custo) - custoDupla),
  pixSistema: soma(ok.filter(v => v.classe === 'pix'), v => v.valor),
  pixMaquininha: soma(maqNov.filter(t => t.classe === 'pix'), t => t.bruto),
  porClasse: {}
};
ok.forEach(v => { gab.porClasse[v.classe] = r2((gab.porClasse[v.classe] || 0) + v.valor); });
console.log(JSON.stringify(gab, null, 2));
console.log('Arquivos em', pasta);

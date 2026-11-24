// Gera os arquivos de exemplo da Conciliação inteligente em exemplos/conciliar/.
// Rode: node testes/gerar_exemplos_conciliar.js
// Empresa fictícia: Escritório Modelo Advocacia (nomes, CPFs e processos inventados).
//   6 clientes, 12 títulos em aberto (honorários, parcelas de acordo, êxito em processo).
//   Pagadores: parte devedora e advogado da parte de um processo, sócios de clientes empresa.
//   Extrato de novembro de 2026 (Excel e OFX com os mesmos lançamentos).
const fs = require('fs');
const path = require('path');
const XLSX = require('../vendor/xlsx.full.min.js');
const K = require('../conciliar-logica.js');

const pasta = path.join(__dirname, '..', 'exemplos', 'conciliar');
fs.mkdirSync(pasta, { recursive: true });

const PROC_A = '0001234-56.2025.8.26.0100';
const PROC_C = '1009876-11.2026.5.02.0011';

// títulos em aberto (estilo exportação de contas a receber do Conta Azul)
const TITULOS = [
  // vencimento, cliente, descrição, nº do documento, parcela, valor, observações, CPF/CNPJ
  ['10/11/2026', 'Construtora Horizonte Ltda', 'Honorários de êxito', PROC_A, '', 4800, 'Valor será depositado em juízo', '11.222.333/0001-44'],
  ['18/11/2026', 'Construtora Horizonte Ltda', 'Consultoria trabalhista novembro', 'NF 1088', '', 2000, '', '11.222.333/0001-44'],
  ['05/11/2026', 'Maria Aparecida Souza', 'Honorários inventário', 'INV-77', '1/3', 1200, '', '987.654.321-00'],
  ['05/12/2026', 'Maria Aparecida Souza', 'Honorários inventário', 'INV-77', '2/3', 1200, '', '987.654.321-00'],
  ['10/11/2026', 'Roberto Tavares Lins', 'Acordo trabalhista (honorários 30%)', PROC_C, '1/4', 2500, 'Quem paga é a reclamada ou o advogado dela', '111.222.333-44'],
  ['10/12/2026', 'Roberto Tavares Lins', 'Acordo trabalhista (honorários 30%)', PROC_C, '2/4', 2500, '', '111.222.333-44'],
  ['05/10/2026', 'Fernanda Prado Queiroz', 'Honorários mensais', 'CT-12', '10/12', 800, '', '222.333.444-55'],
  ['05/11/2026', 'Fernanda Prado Queiroz', 'Honorários mensais', 'CT-12', '11/12', 800, '', '222.333.444-55'],
  ['10/11/2026', 'Padaria Pão Dourado Ltda', 'Honorários contrato societário', 'NF 1090', '', 1500, '', '33.444.555/0001-66'],
  ['15/11/2026', 'Clínica Bem Estar Ltda', 'Assessoria mensal novembro', 'NF 1091', '', 2000, '', '44.555.666/0001-77'],
  ['20/11/2026', 'Clínica Bem Estar Ltda', 'Custas e diligências', 'ND 31', '', 950, '', '44.555.666/0001-77'],
  ['22/11/2026', 'Construtora Horizonte Ltda', 'Custas e diligências', 'ND 32', '', 950, '', '11.222.333/0001-44']
];

const PAGADORES = [
  // cliente, processo, nome do pagador, CPF/CNPJ, papel
  ['', PROC_C, 'Metalúrgica Ferraz Ltda', '12.345.678/0001-90', 'Parte devedora'],
  ['', PROC_C, 'Joaquim Silva', '', 'Advogado da parte'],
  ['Padaria Pão Dourado Ltda', '', 'Ricardo Menezes', '123.456.789-00', 'Sócio'],
  ['Construtora Horizonte Ltda', '', 'Paulo Rezende', '', 'Sócio'],
  ['Clínica Bem Estar Ltda', '', 'Paulo Rezende Filho', '', 'Sócio']
];

// extrato do banco, novembro de 2026
const EXTRATO = [
  // data, histórico, documento, valor
  ['03/11/2026', 'REND PAGO APLIC AUT MAIS', '', 37.15],
  ['06/11/2026', 'TED 341 MARIA APARECID SOUZ', '000341', 1200],
  ['09/11/2026', 'PIX RECEBIDO FERNANDA P QUEIROZ', '', 1600],
  ['10/11/2026', 'PIX RECEB 123.456.789-00', '', 1500],
  ['11/11/2026', 'PIX RECEBIDO J SILVA ADV', '', 2500],
  ['12/11/2026', 'DEP JUDICIAL TJSP 0001234', '', 4800],
  ['17/11/2026', 'DOC RECEBIDO', '000777', 2000],
  ['21/11/2026', 'PIX RECEBIDO PAULO REZENDE', '', 950],
  ['24/11/2026', 'PIX ENVIADO ALUGUEL SALA', '', -3200],
  ['25/11/2026', 'TARIFA PACOTE SERVICOS', '', -89.9],
  ['26/11/2026', 'PIX RECEBIDO JOSEFA TEIXEIRA', '', 300],
  ['28/11/2026', 'PIX RECEBIDO METALURGICA FERRAZ', '', 2500]
];

// o que a ferramenta deve sugerir (sem nenhuma regra aprendida, opções padrão)
const ESPERADO = [
  { hist: 'REND PAGO APLIC AUT MAIS', status: 'sempar', titulos: [], porque: 'rendimento de aplicação, não é cliente' },
  { hist: 'TED 341 MARIA APARECID SOUZ', status: 'certo', titulos: ['Maria Aparecida Souza 1/3'], porque: 'nome cortado pelo banco (APARECID, SOUZ), valor da parcela 1/3, 1 dia depois do vencimento' },
  { hist: 'PIX RECEBIDO FERNANDA P QUEIROZ', status: 'certo', titulos: ['Fernanda Prado Queiroz 10/12', 'Fernanda Prado Queiroz 11/12'], porque: 'soma de 2 parcelas pagas juntas' },
  { hist: 'PIX RECEB 123.456.789-00', status: 'certo', titulos: ['Padaria Pão Dourado Ltda'], porque: 'CPF do sócio Ricardo Menezes' },
  { hist: 'PIX RECEBIDO J SILVA ADV', status: 'certo', titulos: ['Roberto Tavares Lins 1/4'], porque: 'J SILVA = Joaquim Silva, advogado da parte devedora no processo' },
  { hist: 'DEP JUDICIAL TJSP 0001234', status: 'certo', titulos: ['Construtora Horizonte Ltda (êxito)'], porque: 'o número 0001234 está no processo' },
  { hist: 'DOC RECEBIDO', status: 'conferir', titulos: [], porque: 'R$ 2.000,00 bate com a Construtora e com a Clínica, sem nome' },
  { hist: 'PIX RECEBIDO PAULO REZENDE', status: 'conferir', titulos: [], porque: 'homônimo: Paulo Rezende (Construtora) e Paulo Rezende Filho (Clínica), os dois com R$ 950,00' },
  { hist: 'PIX RECEBIDO JOSEFA TEIXEIRA', status: 'sempar', titulos: [], porque: 'ninguém com esse nome nem esse valor' },
  { hist: 'PIX RECEBIDO METALURGICA FERRAZ', status: 'provavel', titulos: ['Roberto Tavares Lins 2/4'], porque: 'parte devedora pagou a parcela 2/4 adiantada (a 1/4 já foi usada pelo J SILVA)' }
];

function dataOFX(br) { const [d, m, a] = br.split('/'); return a + m + d; }

// ---------- extrato em Excel (com linhas de título e saldo, como os bancos) ----------
function gerarExtratoXlsx() {
  const linhas = [['BANCO MODELO S.A.'], ['Extrato de conta corrente  Ag 0001  CC 12345-6'], ['Período: 01/11/2026 a 30/11/2026'], [],
    ['Data', 'Histórico', 'Documento', 'Valor (R$)', 'Saldo (R$)']];
  let saldo = 15000;
  linhas.push(['31/10/2026', 'SALDO ANTERIOR', '', '', saldo]);
  EXTRATO.forEach(([d, h, doc, v]) => { saldo = Math.round((saldo + v) * 100) / 100; linhas.push([d, h, doc, v, saldo]); });
  linhas.push(['30/11/2026', 'SALDO FINAL', '', '', saldo]);
  const folha = XLSX.utils.aoa_to_sheet(linhas);
  folha['!cols'] = [{ wch: 12 }, { wch: 40 }, { wch: 12 }, { wch: 14 }, { wch: 14 }];
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, folha, 'Extrato');
  fs.writeFileSync(path.join(pasta, 'escritorio-modelo-extrato-nov-2026.xlsx'), Buffer.from(XLSX.write(livro, { type: 'array', bookType: 'xlsx' })));
}
// ---------- o mesmo extrato em OFX ----------
function gerarExtratoOfx() {
  let s = 'OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nENCODING:USASCII\n\n<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><CURDEF>BRL\n' +
    '<BANKACCTFROM><BANKID>0999<ACCTID>12345-6<ACCTTYPE>CHECKING</BANKACCTFROM>\n<BANKTRANLIST><DTSTART>20261101<DTEND>20261130\n';
  EXTRATO.forEach(([d, h, doc, v], i) => {
    s += '<STMTTRN><TRNTYPE>' + (v > 0 ? 'CREDIT' : 'DEBIT') + '<DTPOSTED>' + dataOFX(d) + '120000[-3:BRT]<TRNAMT>' + v.toFixed(2) +
      '<FITID>' + (1000 + i) + (doc ? '<CHECKNUM>' + doc : '') + '<MEMO>' + h + '\n</STMTTRN>\n';
  });
  s += '</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>\n';
  fs.writeFileSync(path.join(pasta, 'escritorio-modelo-extrato-nov-2026.ofx'), s);
}
// ---------- contas a receber em aberto ----------
function gerarTitulos() {
  const linhas = [['Contas a receber em aberto'], ['Escritório Modelo Advocacia'], [],
    ['Data de vencimento', 'Cliente', 'Descrição', 'Nº do documento', 'Parcela', 'Valor (R$)', 'Observações', 'CPF/CNPJ']];
  TITULOS.forEach(t => linhas.push(t));
  const total = TITULOS.reduce((s, t) => s + t[5], 0);
  linhas.push(['', 'Total', '', '', '', total, '', '']);
  const folha = XLSX.utils.aoa_to_sheet(linhas);
  folha['!cols'] = [{ wch: 14 }, { wch: 28 }, { wch: 36 }, { wch: 28 }, { wch: 8 }, { wch: 12 }, { wch: 40 }, { wch: 20 }];
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, folha, 'Contas a receber');
  fs.writeFileSync(path.join(pasta, 'escritorio-modelo-contas-a-receber.xlsx'), Buffer.from(XLSX.write(livro, { type: 'array', bookType: 'xlsx' })));
}
// ---------- pagadores ----------
function gerarPagadores() {
  const linhas = [['Cliente', 'Processo', 'Nome do pagador', 'CPF/CNPJ', 'Papel']].concat(PAGADORES);
  const folha = XLSX.utils.aoa_to_sheet(linhas);
  folha['!cols'] = [{ wch: 28 }, { wch: 28 }, { wch: 28 }, { wch: 20 }, { wch: 20 }];
  const livro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(livro, folha, 'Pagadores');
  fs.writeFileSync(path.join(pasta, 'escritorio-modelo-pagadores.xlsx'), Buffer.from(XLSX.write(livro, { type: 'array', bookType: 'xlsx' })));
}
// ---------- backup com a empresa e os pagadores já cadastrados ----------
function gerarBackup() {
  const estado = K.novoEstado();
  const emp = K.novaEmpresa('Escritório Modelo Advocacia');
  emp.id = 'exemplo-escritorio';
  PAGADORES.forEach(([cliente, processo, nome, cpf, papel], i) => {
    const p = K.novoPagador({ cliente, processo, nome, cpf, papel });
    p.id = 'pag' + (i + 1);
    emp.pagadores.push(p);
  });
  estado.empresas.push(emp);
  estado.selecionada = emp.id;
  fs.writeFileSync(path.join(pasta, 'backup-exemplo-conciliacao.json'), JSON.stringify(K.criarBackup(estado, '2026-11-24T12:00:00.000Z'), null, 2));
  return emp;
}
function gerarEsperado() {
  const nomes = { certo: 'Certo', provavel: 'Provável', conferir: 'Conferir', sempar: 'Sem par' };
  let t = 'Conciliação inteligente: resultados esperados com os arquivos de exemplo\n' +
    'Empresa: Escritório Modelo Advocacia (fictícia). Opções padrão: tolerância R$ 0,05, janela de 10 dias antes a 45 depois.\n' +
    'Traga o extrato (Excel ou OFX), as contas a receber e restaure o backup (ou importe a planilha de pagadores).\n\n';
  ESPERADO.forEach(e => {
    t += '- ' + e.hist + ': ' + nomes[e.status] + (e.titulos.length ? ' com ' + e.titulos.join(' + ') : '') + '. ' + e.porque + '.\n';
  });
  t += '\nSaídas (aluguel e tarifa) ficam de fora, porque a opção de conciliar saídas vem desligada.\n';
  t += 'Totais: 5 conciliados, 3 a conferir (2 Conferir e 1 Provável), 2 sem par.\n';
  t += 'Títulos ainda em aberto: 6 (Construtora R$ 2.000,00 e R$ 950,00, Maria Aparecida 2/3, Roberto 2/4, Clínica R$ 2.000,00 e R$ 950,00).\n';
  t += '\nPara testar a regra aprendida: no lançamento DOC RECEBIDO, escolha a Clínica Bem Estar, confirme e use Aprender com o texto DOC RECEBIDO.\n';
  t += 'Na próxima conciliação ele já vem como Certo.\n';
  fs.writeFileSync(path.join(pasta, 'resultados-esperados.txt'), t);
}

gerarExtratoXlsx();
gerarExtratoOfx();
gerarTitulos();
gerarPagadores();
gerarBackup();
gerarEsperado();
console.log('Exemplos gerados em', pasta);

module.exports = { TITULOS, PAGADORES, EXTRATO, ESPERADO, PROC_A, PROC_C };

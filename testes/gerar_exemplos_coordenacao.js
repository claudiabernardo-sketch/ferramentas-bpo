// Gera os arquivos de exemplo do Painel da coordenação em exemplos/coordenacao/.
// Rode: node testes/gerar_exemplos_coordenacao.js
// Equipe fictícia: 3 assistentes e 6 empresas. Data de referência fixa: 24/11/2026.
//   carteira-equipe.xlsx: colunas Empresa e Assistente, com linha de título.
//   Padaria Pão Quente e Clínica Sorriso: estilo Conta Azul (.xlsx, 2 linhas de título e total no fim).
//   Ótica Visão Clara: estilo Nibo (.csv com ';' e valores 1.234,56, total no fim).
//   Studio Pilates Leve: estilo Omie (.xlsx, 2 linhas de título e total no fim).
//   Mercadinho Bom Preço: .csv; o de receber não tem coluna de situação (só os títulos em aberto).
//   Pet Shop Amigo Fiel: um relatório só, com coluna Tipo (Despesa ou Receita).
//   Clínica Sorriso também tem um extrato com a coluna Conciliação.
//   backup-exemplo-painel-coordenacao.json: tudo já carregado, para ver o painel pronto.
const fs = require('fs');
const path = require('path');
const XLSX = require('../vendor/xlsx.full.min.js');
const C = require('../comum.js');
const K = require('../coordenacao-logica.js');

const pasta = path.join(__dirname, '..', 'exemplos', 'coordenacao');
fs.mkdirSync(pasta, { recursive: true });
const REF = '2026-11-24';

const ASSISTENTES = ['Ana Souza', 'Bruna Lima', 'Carla Mendes'];
// [empresa, assistente]
const CARTEIRA = [
  ['Padaria Pão Quente', 'Ana Souza'],
  ['Ótica Visão Clara', 'Ana Souza'],
  ['Studio Pilates Leve', 'Bruna Lima'],
  ['Mercadinho Bom Preço', 'Bruna Lima'],
  ['Clínica Sorriso', 'Carla Mendes'],
  ['Pet Shop Amigo Fiel', 'Carla Mendes']
];
// Títulos: [dias em relação à referência, valor, situação, contato, descrição]
const SPEC = {
  'Padaria Pão Quente': {
    pagar: [[-10, 1200, 'Atrasado', 'Moinho Trigo Bom', 'Farinha de trigo'], [-2, 350.5, 'Atrasado', 'Energia Luz Forte', 'Conta de luz'],
      [-5, 800, 'Pago', 'Embalagens Sul', 'Sacos de papel'], [0, 150, 'Em aberto', 'Água Limpa', 'Conta de água'],
      [3, 2300, 'Em aberto', 'Laticínios Serra', 'Leite e queijo'], [12, 900, 'Em aberto', 'Imobiliária Centro', 'Aluguel']],
    receber: [[-4, 480, 'Atrasado', 'Hotel Central', 'Pães para o café'], [-20, 300, 'Recebido', 'Restaurante Sabor', 'Encomenda'],
      [5, 1250.75, 'Em aberto', 'Hotel Central', 'Fornecimento semanal'], [15, 600, 'Em aberto', 'Escola Aprender', 'Lanches']],
    conc: { pendentes: 4, ultima: '2026-11-21' }
  },
  'Ótica Visão Clara': {
    pagar: [[-1, 2450, 'Vencido', 'Lentes Brasil', 'Lentes'], [2, 1890.3, 'A vencer', 'Armações Prime', 'Armações'],
      [-30, 500, 'Quitado', 'Gráfica Rápida', 'Panfletos'], [20, 1000, 'A vencer', 'Contabilidade Exata', 'Honorários']],
    receber: [[-8, 320, 'Vencido', 'Maria Silva', 'Óculos, parcela 2'], [-3, 1150, 'Vencido', 'João Pereira', 'Óculos de grau'],
      [1, 410, 'A vencer', 'Carla Dias', 'Parcela 1'], [-10, 700, 'Recebido', 'Pedro Alves', 'Óculos de sol']],
    conc: { pendentes: 0, ultima: '2026-11-23' }
  },
  'Studio Pilates Leve': {
    pagar: [[4, 650, 'A vencer', 'Imobiliária Centro', 'Aluguel da sala'], [10, 120, 'A vencer', 'Internet Rápida', 'Internet'],
      [-15, 90, 'Pago', 'Papelaria Ponto', 'Material de escritório']],
    receber: [[2, 380, 'A vencer', 'Aluna Paula', 'Mensalidade'], [6, 380, 'A vencer', 'Aluna Renata', 'Mensalidade'],
      [-6, 380, 'Recebido', 'Aluna Sônia', 'Mensalidade']],
    conc: { pendentes: 0, ultima: '2026-11-24' }
  },
  'Mercadinho Bom Preço': {
    pagar: [[-40, 3200, 'Atrasado', 'Distribuidora Norte', 'Mercadorias'], [-1, 210, 'Em aberto', 'Gás Fácil', 'Gás'],
      [7, 1500, 'Em aberto', 'Atacado Bom', 'Bebidas'], [8, 400, 'Em aberto', 'Limpeza Total', 'Produtos de limpeza'],
      [-3, 1000, 'Pago', 'Frios Bons', 'Frios']],
    // sem coluna de situação: o relatório já vem só com o que está em aberto
    receber: [[-45, 150, null, 'Condomínio Flores', 'Fiado do mês'], [-2, 89.9, null, 'Bar do Zé', 'Compra a prazo'],
      [3, 260, null, 'Restaurante Bom', 'Compra a prazo']],
    conc: { pendentes: 12, ultima: '2026-11-10' },
    receberAtualizadoEm: '2026-11-14'
  },
  'Clínica Sorriso': {
    pagar: [[-3, 980, 'Atrasado', 'Dental Supply', 'Materiais'], [1, 4200, 'Em aberto', 'Equipe', 'Salários'],
      [25, 350, 'Em aberto', 'Lavanderia Limpa', 'Jalecos']],
    receber: [[-12, 600, 'Atrasado', 'Convênio Saúde Mais', 'Repasse'], [0, 250, 'Em aberto', 'Paciente Lucas', 'Clareamento'],
      [4, 1800, 'Em aberto', 'Convênio Odonto Já', 'Repasse']],
    // extrato: 6 conciliados, 2 não conciliados, 1 pendente
    extrato: ['Conciliado', 'Conciliado', 'Não conciliado', 'Conciliado', 'Conciliado', 'Pendente', 'Conciliado', 'Não conciliado', 'Conciliado'],
    conc: { pendentes: null, ultima: '2026-11-19' }
  },
  'Pet Shop Amigo Fiel': {
    pagar: [[-6, 540, 'Em aberto', 'Ração Total', 'Ração'], [2, 300, 'Em aberto', 'Pet Distribuidora', 'Acessórios'],
      [-1, 75, 'Pago', 'Água Limpa', 'Conta de água']],
    receber: [[-1, 95, 'Em aberto', 'Cliente Rex', 'Banho e tosa'], [5, 180, 'Em aberto', 'Cliente Mel', 'Consulta'],
      [-2, 60, 'Recebido', 'Cliente Bob', 'Banho']],
    conc: { pendentes: null, ultima: null }
  }
};

const dataIso = d => K.somarDias(REF, d);
const dataBR = d => C.dataBR(dataIso(d));
const dataJS = d => { const p = dataIso(d).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); };
const br = v => C.num(v, 2);
const aberto = s => s == null || !/^(pago|quitado|recebido)$/i.test(s);
function gravarXlsx(nome, linhas, larguras) {
  const livro = XLSX.utils.book_new();
  const folha = XLSX.utils.aoa_to_sheet(linhas);
  if (larguras) folha['!cols'] = larguras.map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(livro, folha, 'Relatório');
  fs.writeFileSync(path.join(pasta, nome), Buffer.from(XLSX.write(livro, { type: 'array', bookType: 'xlsx' })));
}
function gravarCsv(nome, linhas) {
  fs.writeFileSync(path.join(pasta, nome), Buffer.from(linhas.join('\r\n') + '\r\n', 'latin1'));
}
const soma = lista => Math.round(lista.reduce((s, t) => s + t[1], 0) * 100) / 100;

// ---------- carteira ----------
gravarXlsx('carteira-equipe.xlsx', [['Carteira de clientes do BPO'], [], ['Empresa', 'Assistente', 'CNPJ']]
  .concat(CARTEIRA.map((c, i) => [c[0], c[1], '00.000.000/000' + (i + 1) + '-00'])), [28, 20, 22]);

// ---------- Conta Azul (.xlsx) ----------
function contaAzul(empresa, tipo, nome) {
  const t = SPEC[empresa][tipo];
  const linhas = [[tipo === 'pagar' ? 'Contas a pagar' : 'Contas a receber'], ['Empresa: ' + empresa + '   Período: 01/10/2026 a 31/12/2026'],
    ['Data de vencimento', 'Descrição', tipo === 'pagar' ? 'Fornecedor' : 'Cliente', 'Categoria', 'Valor (R$)', 'Situação']];
  t.forEach(x => linhas.push([dataJS(x[0]), x[4], x[3], tipo === 'pagar' ? 'Despesas operacionais' : 'Receita de vendas', x[1], x[2]]));
  linhas.push(['Total', '', '', '', soma(t), '']);
  gravarXlsx(nome, linhas, [18, 28, 26, 24, 14, 14]);
}
contaAzul('Padaria Pão Quente', 'pagar', 'contas-a-pagar-padaria-pao-quente.xlsx');
contaAzul('Padaria Pão Quente', 'receber', 'contas-a-receber-padaria-pao-quente.xlsx');
contaAzul('Clínica Sorriso', 'pagar', 'clinica-sorriso-contas-a-pagar.xlsx');
contaAzul('Clínica Sorriso', 'receber', 'clinica-sorriso-contas-a-receber.xlsx');

// ---------- Nibo (.csv) ----------
function nibo(empresa, tipo, nome) {
  const t = SPEC[empresa][tipo];
  const L = ['Vencimento;Contato;Descrição;Categoria;Valor;Status'];
  t.forEach(x => L.push([dataBR(x[0]), x[3], '"' + x[4] + '"', tipo === 'pagar' ? 'Fornecedores' : 'Vendas', br(x[1]), x[2]].join(';')));
  L.push(';;;Total;' + br(soma(t)) + ';');
  gravarCsv(nome, L);
}
nibo('Ótica Visão Clara', 'pagar', 'otica-visao-clara-contas-a-pagar.csv');
nibo('Ótica Visão Clara', 'receber', 'otica-visao-clara-contas-a-receber.csv');

// ---------- Omie (.xlsx) ----------
function omie(empresa, tipo, nome) {
  const t = SPEC[empresa][tipo];
  const linhas = [[empresa.toUpperCase()], ['Relatório de ' + (tipo === 'pagar' ? 'Contas a Pagar' : 'Contas a Receber') + ' emitido em 24/11/2026'],
    ['Data de Vencimento', tipo === 'pagar' ? 'Fornecedor' : 'Cliente', 'Valor da Conta', 'Situação', 'Observação']];
  t.forEach(x => linhas.push([dataJS(x[0]), x[3], x[1], x[2], x[4]]));
  linhas.push(['', 'Total Geral', soma(t), '', '']);
  gravarXlsx(nome, linhas, [18, 26, 14, 12, 28]);
}
omie('Studio Pilates Leve', 'pagar', 'Studio Pilates Leve - Contas a Pagar.xlsx');
omie('Studio Pilates Leve', 'receber', 'Studio Pilates Leve - Contas a Receber.xlsx');

// ---------- Mercadinho (.csv) ----------
{
  const e = 'Mercadinho Bom Preço';
  const L = ['Vencimento;Fornecedor;Descrição;Valor (R$);Status'];
  SPEC[e].pagar.forEach(x => L.push([dataBR(x[0]), x[3], x[4], br(x[1]), x[2]].join(';')));
  L.push(';TOTAL;;' + br(soma(SPEC[e].pagar)) + ';');
  gravarCsv('mercadinho-bom-preco-pagar.csv', L);
  const R = ['Vencimento;Cliente;Descrição;Valor em aberto'];
  SPEC[e].receber.forEach(x => R.push([dataBR(x[0]), x[3], x[4], br(x[1])].join(';')));
  gravarCsv('mercadinho-bom-preco-receber-em-aberto.csv', R);
}

// ---------- Pet Shop (um relatório com Tipo) ----------
{
  const e = 'Pet Shop Amigo Fiel';
  const linhas = [['Lançamentos financeiros'], ['Pet Shop Amigo Fiel, novembro de 2026'],
    ['Vencimento', 'Tipo', 'Contato', 'Descrição', 'Valor', 'Situação']];
  const todos = SPEC[e].pagar.map(x => ['Despesa'].concat([x])).concat(SPEC[e].receber.map(x => ['Receita'].concat([x])));
  todos.sort((a, b) => a[1][0] - b[1][0]).forEach(([tipo, x]) => linhas.push([dataJS(x[0]), tipo, x[3], x[4], x[1], x[2]]));
  linhas.push(['Total', '', '', '', Math.round((soma(SPEC[e].receber) - soma(SPEC[e].pagar)) * 100) / 100, '']);
  gravarXlsx('pet-shop-amigo-fiel-contas-novembro.xlsx', linhas, [14, 10, 22, 22, 12, 12]);
}

// ---------- Extrato com conciliação (Clínica) ----------
{
  const e = 'Clínica Sorriso';
  const linhas = [['Extrato da conta corrente'], ['Clínica Sorriso, Banco Exemplo, agência 0001'], ['Data', 'Descrição', 'Valor', 'Conciliação']];
  SPEC[e].extrato.forEach((s, i) => linhas.push([dataJS(-9 + i), i % 2 ? 'PIX RECEBIDO' : 'PAGTO BOLETO', i % 2 ? 150 + i * 10 : -(80 + i * 5), s]));
  gravarXlsx('clinica-sorriso-extrato-conciliacao.xlsx', linhas, [14, 24, 12, 18]);
}

// ---------- números esperados, calculados direto da lista acima ----------
const ESPERADO = {};
const fim7 = 7;
Object.keys(SPEC).forEach(e => {
  const s = SPEC[e];
  const ab = t => t.filter(x => aberto(x[2]));
  const venc = t => ab(t).filter(x => x[0] < 0);
  const prox = t => ab(t).filter(x => x[0] >= 0 && x[0] <= fim7);
  ESPERADO[e] = {
    pagarAbertos: ab(s.pagar).length, receberAbertos: ab(s.receber).length,
    pagarVencidoQtd: venc(s.pagar).length, pagarVencidoValor: soma(venc(s.pagar)),
    pagarMaiorAtraso: Math.max(0, ...venc(s.pagar).map(x => -x[0])),
    receberVencidoQtd: venc(s.receber).length, receberVencidoValor: soma(venc(s.receber)),
    receberMaiorAtraso: Math.max(0, ...venc(s.receber).map(x => -x[0])),
    proximosQtd: prox(s.pagar).length + prox(s.receber).length, proximosPagar: soma(prox(s.pagar)), proximosReceber: soma(prox(s.receber)),
    pagosIgnorados: s.pagar.length - ab(s.pagar).length + s.receber.length - ab(s.receber).length
  };
});
ESPERADO['Clínica Sorriso'].pendentesExtrato = SPEC['Clínica Sorriso'].extrato.filter(x => x !== 'Conciliado').length;
const tot = { pagarVencidoQtd: 0, pagarVencidoValor: 0, receberVencidoQtd: 0, receberVencidoValor: 0, proximosQtd: 0 };
Object.values(ESPERADO).forEach(x => Object.keys(tot).forEach(k => { tot[k] = Math.round((tot[k] + x[k]) * 100) / 100; }));

const txt = ['Painel da coordenação: números esperados na data de referência 24/11/2026', ''];
Object.keys(ESPERADO).forEach(e => {
  const x = ESPERADO[e];
  txt.push(e + ' (' + CARTEIRA.find(c => c[0] === e)[1] + ')');
  txt.push('  a pagar vencido: ' + x.pagarVencidoQtd + ' títulos, ' + C.brl(x.pagarVencidoValor) + (x.pagarVencidoQtd ? ', mais antigo há ' + x.pagarMaiorAtraso + ' dias' : ''));
  txt.push('  a receber vencido: ' + x.receberVencidoQtd + ' títulos, ' + C.brl(x.receberVencidoValor) + (x.receberVencidoQtd ? ', mais antigo há ' + x.receberMaiorAtraso + ' dias' : ''));
  txt.push('  vencem nos próximos 7 dias: ' + x.proximosQtd + ' (' + C.brl(x.proximosPagar) + ' a pagar, ' + C.brl(x.proximosReceber) + ' a receber)');
});
txt.push('', 'Total: ' + tot.pagarVencidoQtd + ' a pagar vencidos (' + C.brl(tot.pagarVencidoValor) + '), ' + tot.receberVencidoQtd + ' a receber vencidos (' + C.brl(tot.receberVencidoValor) + '), ' + tot.proximosQtd + ' vencem em 7 dias.');
txt.push('Extrato da Clínica Sorriso: ' + ESPERADO['Clínica Sorriso'].pendentesExtrato + ' lançamentos pendentes de conciliação.');
fs.writeFileSync(path.join(pasta, 'numeros-esperados.txt'), txt.join('\r\n') + '\r\n');

// ---------- backup pronto (usa a própria ferramenta para ler os arquivos gerados) ----------
{
  const est = K.novoEstado();
  CARTEIRA.forEach(c => K.adicionarEmpresa(est, c[0], K.adicionarAssistente(est, c[1]).id));
  // ids fixos para o arquivo não mudar a cada geração
  est.assistentes.forEach((a, i) => { const velho = a.id; a.id = 'a' + (i + 1); est.empresas.forEach(e => { if (e.assistenteId === velho) e.assistenteId = a.id; }); });
  est.empresas.forEach((e, i) => { e.id = 'e' + (i + 1); });
  fs.readdirSync(pasta).filter(n => /\.(xlsx|csv)$/.test(n) && n !== 'carteira-equipe.xlsx').sort().forEach(n => {
    const abas = C.lerPlanilha(XLSX, new Uint8Array(fs.readFileSync(path.join(pasta, n))), n);
    const p = K.prepararArquivo(abas, n, est.empresas);
    const emp = K.empresa(est, p.empresaId);
    if (!emp || !p.prep.tipo) throw new Error('Não reconheci ' + n);
    const dataCarga = p.prep.tipo === 'receber' && SPEC[emp.nome].receberAtualizadoEm ? SPEC[emp.nome].receberAtualizadoEm : REF;
    K.guardarCarga(emp, p.prep.tipo, p.prep.resultado, n, dataCarga);
  });
  est.empresas.forEach(e => {
    const c = SPEC[e.nome].conc;
    if (c.pendentes != null) { e.conc.pendentes = c.pendentes; e.conc.origem = 'manual'; }
    e.conc.ultima = c.ultima;
  });
  fs.writeFileSync(path.join(pasta, 'backup-exemplo-painel-coordenacao.json'), JSON.stringify(K.criarBackup(est, '2026-11-24T12:00:00.000Z'), null, 2));
}

console.log(JSON.stringify({ ESPERADO, tot }, null, 1));
console.log('Arquivos gravados em', pasta);

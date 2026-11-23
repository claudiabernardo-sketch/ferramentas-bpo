// Gera os arquivos de exemplo da DRE em exemplos/dre/. Rode: node testes/gerar_exemplos_dre.js
// Clientes fictícios. Os nomes das colunas imitam exportações do Conta Azul, Nibo e Omie,
// mas são simulações (não foram copiados de arquivos reais desses sistemas).
const fs = require('fs');
const path = require('path');
const XLSX = require('../vendor/xlsx.full.min.js');

const pasta = path.join(__dirname, '..', 'exemplos', 'dre');
fs.mkdirSync(pasta, { recursive: true });
const MESES = [9, 10, 11]; // setembro a novembro de 2026

function brl(n) { // 1234.5 -> "1.234,50"
  const p = Math.abs(n).toFixed(2).split('.');
  return p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + p[1];
}
function br(d, m) { return String(d).padStart(2, '0') + '/' + String(m).padStart(2, '0') + '/2026'; }

// ---------- Ótica Visão Clara (estilo Conta Azul) ----------
// [dia, descrição, categoria, contato, valores por mês (set, out, nov); negativo = despesa]
const otica = [
  [5, 'Vendas de óculos no balcão', 'Vendas de produtos', 'Clientes balcão', [18000, 20000, 16000]],
  [12, 'Vendas de lentes de contato', 'Vendas de produtos', 'Clientes balcão', [6000, 7000, 5000]],
  [15, 'Exames de vista', 'Receita de serviços', 'Clientes balcão', [3000, 3500, 2500]],
  [20, 'DAS do mês anterior', 'Simples Nacional', 'Receita Federal', [-1800, -2000, -1600]],
  [8, 'Lentes Laboratório Foco', 'Compra de lentes', 'Laboratório Foco Ltda', [-6000, -6500, -5500]],
  [9, 'Armações Distribuidora Aro', 'Compra de armações', 'Distribuidora Aro', [-3000, -3200, -2800]],
  [5, 'Folha do mês', 'Salários', 'Funcionários', [-5000, -5000, -5000]],
  [7, 'FGTS', 'FGTS', 'Caixa Econômica', [-400, -400, -400]],
  [10, 'Aluguel da loja', 'Aluguel', 'Imobiliária Centro', [-3500, -3500, -3500]],
  [15, 'Conta de luz', 'Energia elétrica', 'Distribuidora de Energia', [-600, -650, -900]],
  [18, 'Anúncios no Instagram', 'Marketing', 'Meta', [-800, -1000, -1000]],
  [20, 'Honorários contábeis', 'Contabilidade', 'Escritório Contábil Exato', [-700, -700, -700]],
  [25, 'Tarifas do banco', 'Tarifas bancárias', 'Banco', [-50, -60, -55]],
  [28, 'Taxa da maquininha', 'Taxa de cartão', 'Adquirente', [-450, -500, -400]],
  [22, 'Material de vitrine e café', 'Despesas diversas', 'Diversos', [0, -200, -300]],
  [26, 'Uniformes da equipe', 'Uniformes', 'Confecção Bela', [0, 0, -350]],
  [30, 'Distribuição aos sócios', 'Distribuição de lucros', 'Sócios', [-3000, -3000, -2000]]
];
function gerarContaAzul() {
  const linhas = [
    ['Ótica Visão Clara Ltda'],
    ['Extrato de movimentações financeiras: 01/09/2026 a 30/11/2026'],
    ['Data de pagamento', 'Descrição', 'Categoria 1', 'Fornecedor/Cliente', 'Conta bancária', 'Valor (R$)', 'Situação']
  ];
  let total = 0;
  MESES.forEach((m, k) => {
    otica.forEach(([d, desc, cat, cont, vals]) => {
      if (!vals[k]) return;
      linhas.push([new Date(2026, m - 1, d), desc, cat, cont, 'Banco Principal', vals[k], 'Quitado']);
      total += vals[k];
    });
    if (m === 10) { // transferência entre contas (sai de uma, entra na outra)
      linhas.push([new Date(2026, 9, 14), 'Transferência para a poupança', 'Transferência entre contas', '', 'Banco Principal', -5000, 'Quitado']);
      linhas.push([new Date(2026, 9, 14), 'Transferência da conta principal', 'Transferência entre contas', '', 'Poupança', 5000, 'Quitado']);
    }
    if (m === 11) { // venda cancelada: não pode entrar
      linhas.push([new Date(2026, 10, 19), 'Venda de óculos (cancelada)', 'Vendas de produtos', 'Cliente Maria', 'Banco Principal', 800, 'Cancelado']);
    }
  });
  linhas.push(['Total', '', '', '', '', Math.round(total * 100) / 100, '']);
  const resumo = XLSX.utils.aoa_to_sheet([['Resumo do período'], ['Entradas', 81000], ['Saídas', -63015]]);
  const mov = XLSX.utils.aoa_to_sheet(linhas, { cellDates: false });
  mov['!cols'] = [{ wch: 14 }, { wch: 32 }, { wch: 26 }, { wch: 26 }, { wch: 16 }, { wch: 12 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, resumo, 'Resumo');
  XLSX.utils.book_append_sheet(wb, mov, 'Movimentações');
  fs.writeFileSync(path.join(pasta, 'otica-visao-clara-estilo-conta-azul.xlsx'), Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })));
}

// ---------- Padaria Modelo (Nibo e Omie, mesmos números) ----------
// [dia, descrição, categoria, contato, tipo, valores por mês (positivos)]
const padaria = [
  [3, 'Vendas do balcão', 'Vendas balcão', 'Clientes balcão', 'Receita', [30000, 32000, 31000]],
  [10, 'Encomendas de festa', 'Receita de encomendas', 'Clientes de encomenda', 'Receita', [4000, 5000, 6000]],
  [20, 'DAS do mês anterior', 'Impostos (DAS)', 'Receita Federal', 'Despesa', [2100, 2300, 2400]],
  [6, 'Farinha e açúcar', 'Fornecedores de farinha', 'Moinho Trigo Bom', 'Despesa', [9000, 9500, 9800]],
  [7, 'Ovos, leite e manteiga', 'Insumos', 'Laticínios Serra', 'Despesa', [3000, 3000, 3000]],
  [5, 'Salários da equipe', 'Folha de pagamento', 'Funcionários', 'Despesa', [7000, 7000, 7000]],
  [5, 'Pró-labore dos sócios', 'Pró-labore', 'Sócios', 'Despesa', [3000, 3000, 3000]],
  [10, 'Aluguel do ponto', 'Aluguel', 'Imobiliária Bairro', 'Despesa', [4000, 4000, 4000]],
  [15, 'Conta de energia', 'Energia', 'Distribuidora de Energia', 'Despesa', [1500, 1600, 1700]],
  [16, 'Botijões de gás', 'Gás de cozinha', 'Gás Rápido', 'Despesa', [800, 850, 900]],
  [17, 'Sacos e caixas', 'Embalagens', 'Embala Tudo', 'Despesa', [600, 650, 700]],
  [25, 'Tarifas do banco', 'Tarifas bancárias', 'Banco', 'Despesa', [80, 80, 80]],
  [28, 'Rendimento da aplicação', 'Rendimentos de aplicação', 'Banco', 'Receita', [50, 60, 70]],
  [12, 'Parcela do empréstimo do forno', 'Empréstimo bancário', 'Banco', 'Despesa', [1200, 1200, 1200]]
];
// Linhas extras: transferência em novembro, encomenda em aberto em novembro, venda cancelada em outubro
const extrasPadaria = [
  { m: 11, d: 14, desc: 'Transferência para conta reserva', cat: 'Transferência entre contas', cont: '', tipo: 'Despesa', v: 3000, sit: 'ok' },
  { m: 11, d: 14, desc: 'Transferência recebida da conta principal', cat: 'Transferência entre contas', cont: '', tipo: 'Receita', v: 3000, sit: 'ok' },
  { m: 11, d: 29, desc: 'Encomenda de casamento (a receber)', cat: 'Receita de encomendas', cont: 'Noivos Silva', tipo: 'Receita', v: 1500, sit: 'aberto' },
  { m: 10, d: 21, desc: 'Venda cancelada', cat: 'Vendas balcão', cont: 'Cliente balcão', tipo: 'Receita', v: 500, sit: 'cancelado' }
];
function linhasPadaria() {
  const out = [];
  MESES.forEach((m, k) => {
    padaria.forEach(([d, desc, cat, cont, tipo, vals]) => out.push({ m, d, desc, cat, cont, tipo, v: vals[k], sit: 'ok' }));
    extrasPadaria.filter(x => x.m === m).forEach(x => out.push(x));
  });
  return out;
}
function gerarNibo() {
  const status = { ok: null, aberto: 'Em aberto', cancelado: 'Cancelado' };
  const linhas = [['Data de competência', 'Vencimento', 'Tipo', 'Categoria', 'Descrição', 'Contato', 'Valor', 'Status']];
  let total = 0;
  linhasPadaria().forEach(x => {
    const st = status[x.sit] || (x.tipo === 'Receita' ? 'Recebido' : 'Pago');
    linhas.push([new Date(2026, x.m - 1, x.d), new Date(2026, x.m - 1, Math.min(x.d + 2, 28)), x.tipo, x.cat, x.desc, x.cont, x.v, st]);
    total += x.v;
  });
  linhas.push(['Total', '', '', '', '', '', total, '']);
  const ws = XLSX.utils.aoa_to_sheet(linhas, { cellDates: false });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Lançamentos');
  fs.writeFileSync(path.join(pasta, 'padaria-modelo-estilo-nibo.xlsx'), Buffer.from(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })));
}
function gerarOmie() {
  const status = { ok: 'Conciliado', aberto: 'Atrasado', cancelado: 'Cancelado' };
  const linhas = [
    'Movimento financeiro: Padaria Modelo;;;;;;;',
    'Data;Cliente/Fornecedor;Categoria;Observação;Entrada;Saída;Saldo;Situação'
  ];
  let saldo = 0, te = 0, ts = 0;
  linhasPadaria().forEach(x => {
    const ent = x.tipo === 'Receita' ? x.v : 0, sai = x.tipo === 'Despesa' ? x.v : 0;
    if (x.sit === 'ok') { saldo += ent - sai; te += ent; ts += sai; }
    linhas.push([br(x.d, x.m), x.cont, x.cat, '"' + x.desc + '"', ent ? brl(ent) : '', sai ? brl(sai) : '', (saldo < 0 ? '-' : '') + brl(saldo), status[x.sit]].join(';'));
  });
  linhas.push(['Total', '', '', '', brl(te), brl(ts), '', ''].join(';'));
  const texto = linhas.join('\r\n') + '\r\n';
  // windows-1252: para os caracteres usados aqui (até U+00FF) o byte é o próprio código
  const bytes = Buffer.alloc(texto.length);
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    if (c > 255) throw new Error('caractere fora do windows-1252: ' + texto[i]);
    bytes[i] = c;
  }
  fs.writeFileSync(path.join(pasta, 'padaria-modelo-estilo-omie.csv'), bytes);
}

gerarContaAzul();
gerarNibo();
gerarOmie();
console.log('Exemplos gerados em', pasta);
fs.readdirSync(pasta).forEach(f => console.log(' -', f));

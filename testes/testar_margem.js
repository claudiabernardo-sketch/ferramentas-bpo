// Testes da ferramenta Vendas e margem. Rode: node testes/testar_margem.js
// Antes, gere os exemplos: node testes/gerar_exemplos_margem.js
const fs = require('fs');
const path = require('path');
const C = require('../comum.js');
const M = require('../margem-logica.js');
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

// ---------- classificação das formas de pagamento do sistema ----------
[
  ['Dinheiro', 'dinheiro'], ['Espécie', 'dinheiro'], ['PIX', 'pix'], ['Pix QR Code', 'pix'], ['pix maquininha', 'pix'],
  ['Débito Visa', 'debito'], ['Cartão Débito', 'debito'], ['Débito Master', 'debito'], ['Visa Electron', 'debito'], ['Maestro', 'debito'], ['CARTAO DEB', 'debito'],
  ['Cartão Crédito à vista', 'credito_vista'], ['Crédito Visa', 'credito_vista'], ['Crédito 1x', 'credito_vista'], ['Credito a vista', 'credito_vista'],
  ['Cartão Crédito 3x', 'credito_parcelado'], ['Crédito 6x', 'credito_parcelado'], ['Credito parcelado 10x', 'credito_parcelado'],
  ['crédito 3 vezes', 'credito_parcelado'], ['Parcelado', 'credito_parcelado'], ['Cartão 2x', 'credito_parcelado'], ['CC 4X SEM JUROS', 'credito_parcelado'],
  ['Cartão', 'cartao'], ['Cartão de crédito/débito', 'cartao'], ['Mastercard', 'cartao'], ['TEF', 'cartao'],
  ['Crediário', 'boleto'], ['Boleto', 'boleto'], ['Carnê', 'boleto'], ['Crediário 5x', 'boleto'],
  ['Vale alimentação', 'voucher'], ['Ticket Refeição', 'voucher'], ['Cheque', 'outros'], ['Transferência', 'outros'], ['', 'outros']
].forEach(([t, c]) => igual(M.classificarForma(t), c, 'forma "' + t + '"'));

// ---------- classificação da modalidade da maquininha ----------
[
  [['Débito', 1, 'Visa'], 'debito'], [['Crédito à vista', 1, 'Visa'], 'credito_vista'], [['Crédito parcelado loja', 3, 'Elo'], 'credito_parcelado'],
  [['Crédito', 3, 'Mastercard'], 'credito_parcelado'], [['Crédito', 1, 'Mastercard'], 'credito_vista'], [['Pix', 1, ''], 'pix'],
  [['Voucher', 1, 'Alelo'], 'voucher'], [['', 1, 'Visa Electron'], 'debito'], [['', 4, 'Visa'], 'credito_parcelado'], [['', 0, ''], 'cartao'],
  [['Pré-pago débito', 1, 'Elo'], 'debito'], [['Parcelado emissor 2 a 6', 0, 'Visa'], 'credito_parcelado'], [['Outro produto', 1, ''], 'outros']
].forEach(([a, c]) => igual(M.classificarModalidade(a[0], a[1], a[2]), c, 'modalidade "' + a.join(' / ') + '"'));

igual(M.nomeBandeira('MASTERCARD'), 'Mastercard', 'bandeira master');
igual(M.nomeBandeira('visa electron'), 'Visa', 'bandeira visa');
igual(M.nomeBandeira(''), '(sem bandeira)', 'bandeira vazia');
igual(M.situacaoCancelada('Cancelada'), true, 'situação cancelada');
igual(M.situacaoCancelada('Devolvida'), true, 'situação devolvida');
igual(M.situacaoCancelada('Concluída'), false, 'situação concluída');
igual(M.statusRecusado('Negada'), true, 'status negada');
igual(M.statusRecusado('Chargeback'), true, 'status chargeback');
igual(M.statusRecusado('Aprovado'), false, 'status aprovado');

// ---------- taxa em R$ ou em % ----------
igual(M.taxaEhPercentual('Taxa (%)', ['2,5', '1,99', '3']), true, 'taxa % pelo nome');
igual(M.taxaEhPercentual('MDR', ['2,5', '1,99']), true, 'taxa mdr');
igual(M.taxaEhPercentual('Valor da taxa', ['2,5', '35,90']), false, 'taxa em R$');
igual(M.taxaEhPercentual('MDR', ['2,5', '135,00']), false, 'mdr com valor acima de 100 é R$');
igual(M.taxaEhPercentual('Taxa', ['2,5%', '1,9%']), true, 'taxa com sinal de %');
{
  const linhas = [['Data', 'Valor bruto', 'Taxa (%)', 'Tipo'], ['05/11/2026', '1.000,00', '2,50', 'Crédito'], ['05/11/2026', '200,00', '1,5', 'Débito']];
  const t = M.prepararTabela(linhas, M.CAMPOS_MAQ);
  const r = M.lerMaquininha(linhas, t.inicio, t.escolha, {});
  igual(r.taxaPct, true, 'detecta taxa em % no arquivo');
  igual(r.transacoes.map(x => x.taxa), [25, 3], 'taxa calculada pelo %');
  const r2 = M.lerMaquininha(linhas, t.inicio, t.escolha, { taxaPct: false });
  igual(r2.transacoes.map(x => x.taxa), [2.5, 1.5], 'pessoa diz que a taxa está em R$');
}
{
  const linhas = [['Data da venda', 'Valor bruto', 'Valor líquido', 'Valor da taxa', 'Status'],
    ['05/11/2026', '1.000,00', '970,00', '99,00', 'Aprovada'], ['06/11/2026', '300,00', '', '-9,00', 'Aprovada'],
    ['06/11/2026', '50,00', '48,00', '', 'Negada'], ['07/11/2026', '-80,00', '', '', 'Aprovada'], ['xx', '10', '', '', '']];
  const t = M.prepararTabela(linhas, M.CAMPOS_MAQ);
  const r = M.lerMaquininha(linhas, t.inicio, t.escolha, {});
  igual(r.transacoes.map(x => [x.taxa, x.origemTaxa]), [[30, 'liquido'], [9, 'reais']], 'taxa pelo líquido e, sem líquido, pela coluna em R$');
  igual(r.aParte.length, 2, 'negada e valor negativo ficam à parte');
  igual(r.ignoradas.length, 1, 'data inválida ignorada');
}

// ---------- leitura pelo caminho completo (arquivos de exemplo) ----------
const pasta = path.join(__dirname, '..', 'exemplos', 'margem');
function ler(nome, campos) {
  const abas = C.lerPlanilha(XLSX, new Uint8Array(fs.readFileSync(path.join(pasta, nome))), nome);
  const i = M.melhorAba(abas, campos);
  const t = M.prepararTabela(abas[i].linhas, campos);
  return { abas, i, t, linhas: abas[i].linhas };
}
const sis = ler('vendas-sistema-otica-novembro-2026.xlsx', M.CAMPOS_VENDAS);
igual(sis.abas.map(a => a.nome), ['Vendas', 'Filtros'], 'sistema tem duas abas');
igual(sis.i, 0, 'escolhe a aba Vendas');
igual(sis.t.inicio, 2, 'acha o cabeçalho depois do título (linha em branco some na leitura)');
igual(sis.t.escolha, { data: 0, valor: 4, forma: 3, custo: 5, situacao: 6, numero: 1, vendedor: -1 }, 'colunas do sistema');
igual(C.faltando(sis.t.escolha, M.CAMPOS_VENDAS).length, 0, 'nada obrigatório faltando no sistema');
const rv = M.lerVendas(sis.linhas, sis.t.inicio, sis.t.escolha);
igual(rv.vendas.length, 136, 'vendas válidas');
igual(rv.canceladas.length, 2, 'duas canceladas ignoradas');
igual(rv.canceladas.map(c => c.valor).sort((a, b) => a - b), [150, 200], 'valores das canceladas');
igual(rv.ignoradas.map(x => x.motivo), ['Linha de total ou subtotal'], 'linha de total ignorada');
igual(rv.vendas[0].data, '2026-11-02', 'data do excel vira texto');

const cie = ler('maquininha-cielo-novembro-2026.xlsx', M.CAMPOS_MAQ);
igual(cie.t.inicio, 3, 'cabeçalho da Cielo');
igual([cie.t.escolha.data, cie.t.escolha.bruto, cie.t.escolha.liquido, cie.t.escolha.modalidade, cie.t.escolha.bandeira, cie.t.escolha.parcelas, cie.t.escolha.status], [0, 5, 7, 2, 3, 4, 10], 'colunas da Cielo');
const sto = ler('maquininha-stone-novembro-2026.csv', M.CAMPOS_MAQ);
igual([sto.t.escolha.data, sto.t.escolha.bruto, sto.t.escolha.liquido, sto.t.escolha.modalidade, sto.t.escolha.parcelas, sto.t.escolha.status], [0, 4, 5, 1, 3, 6], 'colunas da Stone (CSV)');
const rc = M.lerMaquininha(cie.linhas, cie.t.inicio, cie.t.escolha, { arquivo: 'cielo' });
const rs = M.lerMaquininha(sto.linhas, sto.t.inicio, sto.t.escolha, { arquivo: 'stone' });
igual([rc.transacoes.length, rc.aParte.length], [59, 0], 'transações da Cielo');
igual([rs.transacoes.length, rs.aParte.length], [37, 1], 'transações da Stone, uma estornada à parte');
igual([rs.aParte[0].bruto, rs.aParte[0].data, rs.aParte[0].status], [200, '2026-11-25', 'Estornada'], 'a estornada é a do dia 25');
const T = rc.transacoes.concat(rs.transacoes);

// ---------- meses ----------
igual(M.mesesDisponiveis(rv.vendas, T), ['2026-11', '2026-10'], 'meses dos arquivos');
igual(M.mesPadrao(rv.vendas, T), '2026-11', 'mês padrão é o mais recente com vendas');
igual(M.mesPadrao([], T), '2026-11', 'sem sistema, usa a maquininha');
const out = M.calcular({ vendas: rv.vendas, transacoes: T, mes: '2026-10', aliquota: 6, tolerancia: 1, cmv: { modo: 'coluna' } });
igual([out.vendas, out.maquininha, out.qtdTransacoes], [0, 410, 1], 'outubro só tem a venda da Cielo');

// ---------- resultado de novembro (números do gabarito) ----------
const r = M.calcular({ vendas: rv.vendas, transacoes: T, mes: '2026-11', aliquota: 6, tolerancia: 1, cmv: { modo: 'coluna' } });
igual(r.vendas, 134536.77, 'vendas no sistema');
igual(r.cartaoSistema, 86424.09, 'vendas no cartão (sistema)');
igual(r.maquininha, 86004.09, 'vendas na maquininha (bruto)');
igual(r.diferencaCartao, -420, 'diferença cartão = 350 + 120 - 890');
igual(r.taxas, 1959.31, 'taxas da maquininha');
perto(r.taxaEfetiva, 1959.31 / 96428.28, 'taxa efetiva', 1e-9);
igual(r.cmv, 50612.01, 'CMV pela coluna, custo da venda dupla contado uma vez');
igual(r.cmvInfo.repetidas, 1, 'uma venda com custo repetido');
igual(r.impostos, 8072.21, 'impostos 6%');
igual(r.margemBruta, 83924.76, 'margem bruta');
igual(r.margemContrib, 73893.24, 'margem de contribuição');
perto(r.margemContribPct, 73893.24 / 134536.77, 'margem de contribuição %', 1e-9);
igual([r.pixSistema, r.pixMaquininha], [20777.64, 10424.19], 'pix sistema e maquininha');
igual(r.formas.map(f => [f.classe, f.valor]), [['debito', 45419.07], ['credito_parcelado', 21382.89], ['pix', 20777.64], ['credito_vista', 19622.13], ['boleto', 16925.71], ['dinheiro', 10409.33]], 'vendas por forma');
perto(C.soma(r.formas, f => f.pct), 1, 'percentuais das formas somam 100%', 1e-9);

// os 3 modos de CMV
const rValor = M.calcular({ vendas: rv.vendas, transacoes: T, mes: '2026-11', aliquota: 6, cmv: { modo: 'valor', valor: '50.000,00' } });
igual([rValor.cmv, rValor.margemBruta, rValor.margemContrib], [50000, 84536.77, 74505.25], 'CMV digitado');
const rPct = M.calcular({ vendas: rv.vendas, transacoes: T, mes: '2026-11', aliquota: 6, cmv: { modo: 'pct', pct: 40 } });
igual([rPct.cmv, rPct.margemBruta], [53814.71, 80722.06], 'CMV 40% sobre a venda');
const rSem = M.calcular({ vendas: rv.vendas.map(v => Object.assign({}, v, { custo: null })), transacoes: T, mes: '2026-11', aliquota: 0, cmv: { modo: 'coluna' } });
igual([rSem.cmv, rSem.margemBruta, rSem.margemContrib], [null, null, null], 'sem coluna de custo, CMV e margens ficam pendentes');
igual(M.abasExcel(rSem, 'x')[0].linhas.find(l => /^Margem bruta/.test(l[0] || '')).slice(1), [null, null], 'Excel deixa a margem em branco sem CMV');

// margens conferidas à mão com poucos números
{
  const vend = [
    { data: '2026-11-03', mes: '2026-11', valor: 1000, classe: 'credito_vista', custo: 400, numero: '1', chaveForma: 'credito', forma: 'Crédito' },
    { data: '2026-11-03', mes: '2026-11', valor: 500, classe: 'dinheiro', custo: 200, numero: '2', chaveForma: 'dinheiro', forma: 'Dinheiro' }
  ];
  const tr = [{ data: '2026-11-03', mes: '2026-11', bruto: 1000, taxa: 30, classe: 'credito_vista', bandeira: 'Visa' }];
  const m = M.calcular({ vendas: vend, transacoes: tr, mes: '2026-11', aliquota: 10, tolerancia: 1, cmv: { modo: 'coluna' } });
  // 1500 - 150 imposto - 600 CMV - 30 taxa = 720
  igual([m.vendas, m.impostos, m.cmv, m.taxas, m.margemBruta, m.margemContrib], [1500, 150, 600, 30, 900, 720], 'margens à mão');
  igual([m.margemBrutaPct, m.margemContribPct, m.taxaEfetiva], [0.6, 0.48, 0.03], 'margens % à mão');
  igual(M.cascata(m).map(x => x.valor), [1500, -150, -600, -30, 720], 'itens do gráfico do que sobrou');
}

// ---------- conferência dia a dia: divergências plantadas ----------
const cf = r.conferencia;
const problemas = cf.dias.filter(d => d.situacao !== 'ok').map(d => [d.data, d.situacao, d.diferenca]);
igual(problemas, [['2026-11-10', 'maq_maior', 350], ['2026-11-18', 'maq_maior', 120], ['2026-11-21', 'sis_maior', -890], ['2026-11-13', 'forma_trocada', 0]], 'dias com problema, nesta ordem');
igual([cf.resumo.diasComDiferenca, cf.resumo.diasFormaTrocada, cf.resumo.somaMaqMaior, cf.resumo.somaSisMaior], [3, 1, 470, 890], 'resumo das diferenças');
const d10 = cf.dias.find(d => d.data === '2026-11-10');
igual(d10.semParMaquininha.map(x => [x.valor, x.classe]), [[350, 'credito_vista']], 'dia 10: a venda que só está na maquininha');
const d18 = cf.dias.find(d => d.data === '2026-11-18');
igual(d18.semParMaquininha.map(x => [x.valor, x.classe]), [[120, 'debito']], 'dia 18: a venda que só está na maquininha');
const d21 = cf.dias.find(d => d.data === '2026-11-21');
igual(d21.semParSistema.map(x => [x.valor, x.forma]), [[890, 'Cartão Crédito 3x']], 'dia 21: a venda do sistema que não passou');
const d13 = cf.dias.find(d => d.data === '2026-11-13');
igual([d13.difDeb, d13.difCred, d13.trocadas.length, d13.trocadas[0].valor], [-480, 480, 1, 480], 'dia 13: débito no sistema, crédito na maquininha');
igual(cf.dias.find(d => d.data === '2026-11-25').situacao, 'ok', 'dia 25: cancelada e estornada não geram diferença');
igual(cf.dias.find(d => d.data === '2026-11-14').situacao, 'ok', 'dia 14: venda com duas formas bate');
igual(cf.dias.filter(d => d.situacao === 'ok').every(d => !d.semParSistema.length && !d.semParMaquininha.length), true, 'dias ok sem sobras');
igual(M.detalheDia(d21), 'No sistema sem par na maquininha: R$ 890,00 (Cartão Crédito 3x)', 'texto do detalhe');

// tolerância
const rTol = M.calcular({ vendas: rv.vendas, transacoes: T, mes: '2026-11', tolerancia: 400, cmv: { modo: 'coluna' } });
igual(rTol.conferencia.dias.filter(d => d.situacao !== 'ok').map(d => d.data), ['2026-11-21', '2026-11-13'], 'tolerância de R$ 400 aceita 350 e 120');
{
  const v = [{ data: '2026-11-05', mes: '2026-11', valor: 100, classe: 'debito', forma: 'Débito' }];
  const t1 = [{ data: '2026-11-05', mes: '2026-11', bruto: 100.8, classe: 'debito' }];
  igual(M.conferenciaDiaria(v, t1, 1).dias[0].situacao, 'ok', 'diferença de 0,80 dentro de R$ 1,00');
  igual(M.conferenciaDiaria(v, t1, 0.5).dias[0].situacao, 'maq_maior', 'diferença de 0,80 fora de R$ 0,50');
  // cartão sem detalhe no sistema: não compara débito x crédito
  const v2 = [{ data: '2026-11-05', mes: '2026-11', valor: 100, classe: 'cartao', forma: 'Cartão' }];
  const t2 = [{ data: '2026-11-05', mes: '2026-11', bruto: 100, classe: 'credito_vista' }];
  const c2 = M.conferenciaDiaria(v2, t2, 1).dias[0];
  igual([c2.situacao, c2.separa], ['ok', false], 'cartão sem detalhe bate pelo total');
}

// mais de um arquivo de maquininha: só a Cielo deixa o dia 18 e a Stone sem efeito
const soCielo = M.calcular({ vendas: rv.vendas, transacoes: rc.transacoes, mes: '2026-11', tolerancia: 1, cmv: { modo: 'coluna' } });
igual(soCielo.maquininha < r.maquininha, true, 'com um arquivo só, a maquininha soma menos');
igual(C.arred(soCielo.maquininha + C.soma(rs.transacoes.filter(t => M.ehCartao(t.classe)), t => t.bruto)), r.maquininha, 'Cielo + Stone somam a maquininha toda');
igual(new Set(T.map(t => t.arquivo)).size, 2, 'transações guardam de qual arquivo vieram');

// taxas por modalidade
const tp = r.taxasPor;
igual(tp.porModalidade.map(o => [o.classe, o.bruto, o.taxa]), [['pix', 10424.19, 78.18], ['debito', 45059.07, 591.02], ['credito_vista', 20452.13, 578.91], ['credito_parcelado', 20492.89, 711.2]], 'taxas por modalidade');
igual(tp.maisCara, 'credito_parcelado', 'modalidade mais cara');
igual(C.soma(tp.porModalidadeBandeira, o => o.taxa), r.taxas, 'taxas por bandeira somam o total');

// correção manual da classe (lembrada por cliente)
{
  const copia = rv.vendas.map(v => Object.assign({}, v));
  M.aplicarClasses(copia, { 'debito visa': 'credito_vista' });
  const t = M.textosDeForma(copia).find(x => x.chave === 'debito visa');
  igual([t.classe, t.classeAuto], ['credito_vista', 'debito'], 'correção manual da forma');
  const lidas = M.lerVendas(sis.linhas, sis.t.inicio, sis.t.escolha, { classes: { 'boleto': 'outros' } });
  igual(lidas.vendas.filter(v => v.forma === 'Boleto').every(v => v.classe === 'outros'), true, 'correção aplicada na leitura');
}

// ---------- Excel ----------
const abas = M.abasExcel(r, 'Ótica Visão Clara');
igual(abas.map(a => a.nome), ['Resumo', 'Dia a dia', 'Taxas', 'Formas de pagamento'], 'abas do Excel');
igual(abas[0].linhas.find(l => l[0] === 'Margem de contribuição (o que sobrou)')[1], 73893.24, 'Excel: margem no resumo');
igual(abas[1].linhas.length, 1 + cf.dias.length + 1, 'Excel: uma linha por dia + cabeçalho + total');
igual(abas[1].linhas[1].slice(0, 4), ['10/11/2026', d10.sis.total, d10.maq.total, 350], 'Excel: primeiro dia é o de problema');
igual(abas[3].linhas[abas[3].linhas.length - 1], ['Total', 136, 134536.77, 1], 'Excel: total das formas');
igual(abas[2].linhas.some(l => /a mais cara/.test(l[0] || '')), true, 'Excel: marca a modalidade mais cara');
{
  const livro = XLSX.utils.book_new();
  abas.forEach(a => XLSX.utils.book_append_sheet(livro, XLSX.utils.aoa_to_sheet(a.linhas), a.nome));
  const bytes = XLSX.write(livro, { type: 'array', bookType: 'xlsx' });
  igual(C.lerPlanilha(XLSX, new Uint8Array(bytes), 'x.xlsx').map(a => a.nome), ['Resumo', 'Dia a dia', 'Taxas', 'Formas de pagamento'], 'Excel abre de novo');
}

// ---------- nada de travessão nos arquivos da ferramenta ----------
['margem-logica.js', 'margem-app.js', 'margem.html', 'margem.css', 'testes/gerar_exemplos_margem.js', 'testes/testar_margem.js'].forEach(f => {
  const p = path.join(__dirname, '..', f);
  if (!fs.existsSync(p)) return;
  const t = fs.readFileSync(p, 'utf8');
  igual(/[\u2013\u2014]/.test(t), false, 'sem travessão em ' + f);
});
igual(JSON.stringify(abas).match(/[\u2013\u2014]/), null, 'sem travessão nos textos do Excel');
igual(Object.values(M.SELOS).some(s => /[\u2013\u2014]/.test(s.texto)), false, 'sem travessão nos selos');

console.log(`\n${ok} testes ok, ${falhou} falharam`);
process.exit(falhou ? 1 : 0);

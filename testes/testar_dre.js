// Testes da DRE e painel do cliente. Rode: node testes/testar_dre.js
// (gera os exemplos antes, se ainda não existirem)
const fs = require('fs');
const path = require('path');
const C = require('../comum.js');
const XLSX = require('../vendor/xlsx.full.min.js');
const D = require('../dre-logica.js');

let ok = 0, falhou = 0;
function igual(obtido, esperado, nome) {
  const a = JSON.stringify(obtido), b = JSON.stringify(esperado);
  if (a === b) ok++; else { falhou++; console.log('FALHOU:', nome, '\n  obtido  ', a, '\n  esperado', b); }
}
function verdade(cond, nome) { igual(!!cond, true, nome); }

const pastaEx = path.join(__dirname, '..', 'exemplos', 'dre');
const ARQ = {
  ca: 'otica-visao-clara-estilo-conta-azul.xlsx',
  nibo: 'padaria-modelo-estilo-nibo.xlsx',
  omie: 'padaria-modelo-estilo-omie.csv'
};
if (!Object.values(ARQ).every(f => fs.existsSync(path.join(pastaEx, f)))) require('./gerar_exemplos_dre.js');

// lê pelo caminho completo da tela: lerPlanilha, melhor aba, cabeçalho, colunas
function abrir(nome, ajuste) {
  const abas = C.lerPlanilha(XLSX, new Uint8Array(fs.readFileSync(path.join(pastaEx, nome))), nome);
  const i = D.melhorAba(abas), linhas = abas[i].linhas;
  const iCab = C.acharCabecalho(linhas, D.CAMPOS);
  const cab = linhas[iCab].map(String);
  const escolha = D.detectar(cab);
  if (ajuste) ajuste(escolha);
  return { abas, i, linhas, iCab, cab, escolha };
}
function col(a, k) { return a.escolha[k] >= 0 ? a.cab[a.escolha[k]] : null; }
function mesDe(res, mes) { return res.meses.indexOf(mes); }
function linhaRes(res, id) { return res.linhas.concat(res.aParte).filter(l => l.id === id)[0]; }

// ========== Conta Azul (Ótica): 2 abas, 2 linhas de título, valores negativos ==========
const ca = abrir(ARQ.ca);
igual(ca.abas.map(a => a.nome), ['Resumo', 'Movimentações'], 'CA: duas abas');
igual(ca.i, 1, 'CA: escolhe a aba Movimentações');
igual(ca.iCab, 2, 'CA: cabeçalho depois de 2 linhas de título');
igual(col(ca, 'data'), 'Data de pagamento', 'CA: coluna de data');
igual(col(ca, 'valor'), 'Valor (R$)', 'CA: coluna de valor');
igual(col(ca, 'categoria'), 'Categoria 1', 'CA: coluna de categoria');
igual(col(ca, 'contato'), 'Fornecedor/Cliente', 'CA: coluna de contato');
igual(col(ca, 'situacao'), 'Situação', 'CA: coluna de situação');
igual([col(ca, 'tipo'), col(ca, 'entrada'), col(ca, 'saida')], [null, null, null], 'CA: sem tipo, entrada, saída');
igual(D.faltam(ca.escolha).length, 0, 'CA: nada faltando');
igual(D.regimeDaColuna(col(ca, 'data')), 'caixa', 'CA: data de pagamento é DRE de caixa');
const pCa = D.processar(ca.linhas, ca.iCab, ca.escolha, {});
igual(pCa.regra, 'veio', 'CA: regra de sinal "como veio"');
igual(pCa.lancamentos.length, 50, 'CA: 50 lançamentos');
igual(D.resumoIgnoradas(pCa.ignoradas).map(g => [g.motivo, g.qtd]).sort(), [['Cancelada ou estornada', 1], ['Linha de total ou saldo', 1]], 'CA: ignora cancelada e total');
igual(pCa.lidas, 52, 'CA: linhas lidas');
igual(pCa.lancamentos[0].data, '2026-09-05', 'CA: data do Excel vira AAAA-MM-DD');

const otica = D.novoCliente('Ótica Visão Clara', '#7A1F5C', '#E8A33D');
const ccCa = D.classificarCategorias(pCa.lancamentos, otica);
const sug = Object.fromEntries(ccCa.lista.map(c => [c.nome, c.linha]));
igual(sug['Vendas de produtos'], 'receita', 'sugere: venda vira receita');
igual(sug['Receita de serviços'], 'receita', 'sugere: receita de serviços');
igual(sug['Simples Nacional'], 'impostos', 'sugere: simples nacional vira imposto');
igual(sug['Compra de lentes'], 'custo', 'sugere: lentes vira custo');
igual(sug['Compra de armações'], 'custo', 'sugere: armações vira custo');
igual(sug['Salários'], 'pessoal', 'sugere: salários');
igual(sug['FGTS'], 'pessoal', 'sugere: fgts');
igual(sug['Aluguel'], 'ocupacao', 'sugere: aluguel');
igual(sug['Energia elétrica'], 'ocupacao', 'sugere: energia');
igual(sug['Marketing'], 'comerciais', 'sugere: marketing');
igual(sug['Contabilidade'], 'administrativas', 'sugere: contabilidade');
igual(sug['Tarifas bancárias'], 'financeiro', 'sugere: tarifas');
igual(sug['Taxa de cartão'], 'financeiro', 'sugere: taxa de cartão');
igual(sug['Distribuição de lucros'], 'retiradas', 'sugere: distribuição de lucros');
igual(sug['Transferência entre contas'], 'fora', 'sugere: transferência fica fora da DRE');
igual([sug['Despesas diversas'], sug['Uniformes']], [D.CLASSIFICAR, D.CLASSIFICAR], 'categorias sem regra ficam a classificar');
igual(ccCa.lista.filter(c => c.status === 'sugestao').length, 15, 'CA: 15 sugestões');
igual(ccCa.lista.filter(c => c.status === 'sem-regra').length, 2, 'CA: 2 sem regra');
igual(ccCa.lista.some(c => c.nova), false, 'cliente sem histórico: nada aparece como nova');

// mais regras de sugestão
const mp = D.modeloPadrao();
[['Pró-labore', 'pessoal'], ['13º salário', 'pessoal'], ['Plano de saúde', 'pessoal'], ['ICMS a recolher', 'impostos'], ['ISS', 'impostos'],
 ['Juros de empréstimo', 'financeiro'], ['Parcela de financiamento', 'investimentos'], ['Compra de equipamentos', 'investimentos'],
 ['Comissão de vendas', 'comerciais'], ['Rendimentos de aplicação', 'financeiro'], ['Aplicação financeira', 'fora'], ['Resgate de aplicação', 'fora'],
 ['Internet e telefone', 'ocupacao'], ['Software de gestão', 'administrativas'], ['Vendas das lojas', 'receita'], ['IOF', 'financeiro'],
 ['Retirada de sócio', 'retiradas'], ['Matéria-prima', 'custo'], ['Doações', D.CLASSIFICAR]
].forEach(([cat, esp]) => igual(D.sugerirLinha(cat, mp), esp, 'sugere: ' + cat));

// confirmar sugestões e calcular
const nConf = D.confirmarSugestoes(otica, ccCa.lista);
igual(nConf, 15, 'confirma 15 sugestões');
const cc2 = D.classificarCategorias(pCa.lancamentos, otica);
igual(cc2.lista.filter(c => c.status === 'confirmada').length, 15, 'depois de confirmar: 15 confirmadas');
const rCa = D.calcular(pCa.lancamentos, otica.modelo, cc2.mapa);
igual(rCa.meses, ['2026-09', '2026-10', '2026-11'], 'CA: meses set a nov');
const nov = mesDe(rCa, '2026-11'), out = mesDe(rCa, '2026-10');
// conta à mão de novembro (Ótica):
// receita 16.000 + 5.000 + 2.500 = 23.500; impostos -1.600 => RL 21.900
// custo -5.500 - 2.800 = -8.300 => LB 13.600
// despesas: pessoal -5.400, ocupação -4.400, comerciais -1.000, administrativas -700 = -11.500 => RO 2.100
// financeiro -55 - 400 = -455 => RLíq 1.645; retiradas -2.000 => geração de caixa -355
igual(rCa.receitaBruta[nov], 23500, 'CA nov: receita bruta');
igual(rCa.sub.rl[nov], 21900, 'CA nov: receita líquida');
igual(rCa.sub.lb[nov], 13600, 'CA nov: lucro bruto');
igual(rCa.sub.ro[nov], 2100, 'CA nov: resultado operacional');
igual(rCa.sub.rliq[nov], 1645, 'CA nov: resultado líquido');
igual(rCa.sub.gc[nov], -355, 'CA nov: geração de caixa');
igual(rCa.sub.rliq[out], 6990, 'CA out: resultado líquido');
igual(Math.round(rCa.linhas.filter(l => l.id === 'rliq')[0].margens[nov] * 1000) / 1000, 0.07, 'CA nov: margem líquida 7%');
igual(linhaRes(rCa, 'fora').valores[out], 0, 'CA: transferência soma zero fora da DRE');
igual(linhaRes(rCa, 'fora').qtd, 2, 'CA: 2 lançamentos de transferência');
igual(rCa.aClassificar, { total: -850, qtd: 3, absoluto: 850 }, 'CA: R$ 850 a classificar');
igual(linhaRes(rCa, 'receita').total, 81000, 'CA: receita total do período');
igual(Math.round(linhaRes(rCa, 'ocupacao').pct * 10000) / 10000, Math.round(12650 / 81000 * 10000) / 10000 * -1, 'CA: % da receita da ocupação');
const cartoesCa = D.cartoes(rCa);
igual(cartoesCa.map(c => c.texto), ['R$ 23.500,00', 'R$ 1.645,00', '7,0%', '-R$ 355,00'], 'CA: cartões de novembro');
igual(cartoesCa[0].variacao, '-23,0% contra out/26', 'CA: variação da receita');
igual(cartoesCa[2].variacao, '-15,9 pontos contra out/26', 'CA: variação da margem em pontos');
const pontosCa = D.pontosAtencao(rCa).map(p => p.texto);
verdade(pontosCa.some(t => t.indexOf('R$ 850,00') >= 0 && t.indexOf('a classificar') >= 0), 'pontos: valor a classificar');
verdade(pontosCa.some(t => t.indexOf('margem líquida caiu 15,9 pontos') >= 0), 'pontos: margem caiu');
verdade(pontosCa.some(t => t.indexOf('geração de caixa') >= 0), 'pontos: geração de caixa negativa');
verdade(pontosCa.some(t => t.indexOf('receita bruta caiu') >= 0), 'pontos: receita caiu');
const saidas = D.maioresSaidas(rCa, 8);
igual(saidas.length, 8, 'maiores saídas: 8 linhas');
igual(saidas[0].nome, 'Custo das mercadorias e serviços (CMV)', 'maior saída é o CMV');
igual(saidas[0].valor, 27000, 'CMV do período: 18.000 + 9.000');
// lançamentos de uma linha (conferência)
igual(rCa.lancPorLinha.custo.length, 6, 'conferência: 6 lançamentos de custo');

// ========== Nibo (Padaria): valores positivos e coluna Tipo, competência, em aberto ==========
const nb = abrir(ARQ.nibo);
igual(col(nb, 'data'), 'Data de competência', 'Nibo: prefere competência ao vencimento');
igual(col(nb, 'tipo'), 'Tipo', 'Nibo: coluna tipo');
igual(col(nb, 'situacao'), 'Status', 'Nibo: status vira situação');
igual(col(nb, 'contato'), 'Contato', 'Nibo: contato');
igual(D.regimeDaColuna(col(nb, 'data')), 'competencia', 'Nibo: DRE por competência');
const pNb = D.processar(nb.linhas, nb.iCab, nb.escolha, {});
igual(pNb.regra, 'tipo', 'Nibo: regra de sinal pela coluna Tipo');
igual(pNb.lancamentos.length, 44, 'Nibo: 44 lançamentos');
igual(D.resumoIgnoradas(pNb.ignoradas).map(g => g.motivo).sort(), ['Cancelada ou estornada', 'Em aberto (ainda não foi pago nem recebido)', 'Linha de total ou saldo'], 'Nibo: ignora cancelada, em aberto e total');
const pNbAberto = D.processar(nb.linhas, nb.iCab, nb.escolha, { soPago: false });
igual(pNbAberto.lancamentos.length, 45, 'Nibo: com "só pago" desligado entra o em aberto');
igual(pNbAberto.ignoradas.filter(x => x.motivo.indexOf('Cancelada') === 0).length, 1, 'Nibo: cancelado é sempre ignorado');
const padaria = D.novoCliente('Padaria Modelo', '#8B4513', '#F2C14E');
const ccNb = D.classificarCategorias(pNb.lancamentos, padaria);
const rNb = D.calcular(pNb.lancamentos, padaria.modelo, ccNb.mapa);
const n2 = mesDe(rNb, '2026-11');
// conta à mão de novembro (Padaria):
// receita 31.000 + 6.000 = 37.000; impostos -2.400 => RL 34.600
// custo -9.800 - 3.000 => LB 21.800; despesas: pessoal -10.000, ocupação -5.700 => RO 6.100
// financeiro -80 + 70 = -10 => RLíq 6.090; empréstimo -1.200 => geração de caixa 4.890
igual([rNb.receitaBruta[n2], rNb.sub.rl[n2], rNb.sub.lb[n2], rNb.sub.ro[n2], rNb.sub.rliq[n2], rNb.sub.gc[n2]], [37000, 34600, 21800, 6100, 6090, 4890], 'Nibo nov: subtotais conferidos à mão');
igual(linhaRes(rNb, 'financeiro').valores[n2], -10, 'Nibo nov: rendimento positivo e tarifa negativa');
igual(linhaRes(rNb, 'fora').valores[n2], 0, 'Nibo nov: transferência soma zero');
igual(rNb.aClassificar.total, -4500, 'Nibo: gás e embalagens a classificar');

// regra da natureza: mesmo arquivo sem a coluna Tipo (tudo positivo)
const nbSemTipo = abrir(ARQ.nibo, e => { e.tipo = -1; });
const pNat = D.processar(nbSemTipo.linhas, nbSemTipo.iCab, nbSemTipo.escolha, {});
igual(pNat.regra, 'natureza', 'sem Tipo e tudo positivo: sinal pela natureza da linha');
const rNat = D.calcular(pNat.lancamentos, padaria.modelo, D.classificarCategorias(pNat.lancamentos, padaria).mapa);
igual(rNat.sub.rliq, rNb.sub.rliq, 'natureza dá o mesmo resultado líquido que a coluna Tipo');
igual(linhaRes(rNat, 'financeiro').valores[n2], -10, 'natureza: rendimentos ficam positivos');
verdade(D.textoRegra(pNat).indexOf('linha da DRE') >= 0, 'texto da regra da natureza');

// tipos reconhecidos
igual([D.sinalDoTipo('Despesa'), D.sinalDoTipo('Receita'), D.sinalDoTipo('D'), D.sinalDoTipo('C'), D.sinalDoTipo('Saída'), D.sinalDoTipo('Entrada'),
  D.sinalDoTipo('Débito'), D.sinalDoTipo('Crédito'), D.sinalDoTipo('R'), D.sinalDoTipo('Conta a pagar'), D.sinalDoTipo('xyz')],
  [-1, 1, -1, 1, -1, 1, -1, 1, 1, -1, null], 'sinal pelo tipo');
igual(['Pago', 'Recebido', 'Em aberto', 'A vencer', 'Atrasado', 'Previsto', 'Pendente', 'Cancelado', 'Estornado', 'Quitado', 'Conciliado'].map(D.situacaoDe),
  ['ok', 'ok', 'aberto', 'aberto', 'aberto', 'aberto', 'aberto', 'cancelado', 'cancelado', 'ok', 'ok'], 'situações');

// ========== Omie (Padaria): CSV windows-1252, ';', Entrada e Saída separadas ==========
const om = abrir(ARQ.omie);
igual(om.cab[3], 'Observação', 'Omie: acentos do windows-1252 lidos certo');
igual(om.iCab, 1, 'Omie: cabeçalho depois do título');
igual([col(om, 'entrada'), col(om, 'saida'), col(om, 'valor')], ['Entrada', 'Saída', null], 'Omie: entrada e saída, sem valor');
igual(D.faltam(om.escolha).length, 0, 'Omie: valor não é obrigatório com entrada e saída');
igual(D.faltam(Object.assign({}, om.escolha, { saida: -1 })).map(c => c.chave), ['valor'], 'sem saída, valor volta a ser obrigatório');
const pOm = D.processar(om.linhas, om.iCab, om.escolha, {});
igual(pOm.regra, 'entradaSaida', 'Omie: regra entrada menos saída');
igual(pOm.lancamentos.length, 44, 'Omie: 44 lançamentos');
igual(pOm.ignoradas.map(x => x.motivo).sort(), ['Cancelada ou estornada', 'Em aberto (ainda não foi pago nem recebido)', 'Linha de total ou saldo'], 'Omie: atrasado, cancelado e total ignorados');
const rOm = D.calcular(pOm.lancamentos, padaria.modelo, D.classificarCategorias(pOm.lancamentos, padaria).mapa);
igual(rOm.sub.rliq, rNb.sub.rliq, 'Omie e Nibo da mesma padaria dão o mesmo resultado');
igual(rOm.sub.gc, [3170, 5380, 4890], 'Omie: geração de caixa por mês');

// ========== modelo: renomear, criar, mover, excluir ==========
const cli = D.novoCliente('Ótica Teste');
igual(D.renomearLinha(cli.modelo, 'receita', 'Vendas de óculos e lentes'), true, 'renomeia linha');
igual(D.acharLinha(cli.modelo, 'receita').nome, 'Vendas de óculos e lentes', 'nome novo guardado');
igual(D.renomearLinha(cli.modelo, 'receita', '   '), false, 'não aceita nome vazio');
igual(D.renomearSubtotal(cli.modelo, 'rliq', 'Lucro do mês'), true, 'renomeia subtotal');
const idLentes = D.criarLinha(cli.modelo, 'custo', 'Lentes');
verdade(idLentes, 'cria linha nova');
igual(D.linhasDoGrupo(cli.modelo, 'custo').map(l => l.nome), ['Custo das mercadorias e serviços (CMV)', 'Lentes'], 'linha nova entra no fim do grupo');
igual(D.moverLinha(cli.modelo, idLentes, -1), true, 'sobe a linha');
igual(D.linhasDoGrupo(cli.modelo, 'custo')[0].id, idLentes, 'linha subiu dentro do grupo');
igual(D.moverLinha(cli.modelo, idLentes, -1), false, 'não sobe além do grupo');
igual(D.sugerirLinha('Lentes', cli.modelo), idLentes, 'categoria com o mesmo nome de uma linha vai para ela');
D.ligar(cli, 'compra de lentes', 'Compra de lentes', idLentes);
const pCli = D.processar(ca.linhas, ca.iCab, ca.escolha, {});
let ccCli = D.classificarCategorias(pCli.lancamentos, cli);
igual(ccCli.lista.filter(c => c.chave === 'compra de lentes')[0].status, 'confirmada', 'ligação confirmada usada');
let rCli = D.calcular(pCli.lancamentos, cli.modelo, ccCli.mapa);
igual(linhaRes(rCli, idLentes).total, -18000, 'linha criada recebe os valores');
igual(rCli.linhas.filter(l => l.id === 'rliq')[0].nome, 'Lucro do mês', 'subtotal com nome do cliente');
igual(D.excluirLinha(cli, idLentes), 1, 'exclui linha e devolve 1 categoria');
igual(cli.ligacoes['compra de lentes'].linha, D.CLASSIFICAR, 'categoria da linha excluída volta para A classificar');
ccCli = D.classificarCategorias(pCli.lancamentos, cli);
rCli = D.calcular(pCli.lancamentos, cli.modelo, ccCli.mapa);
igual(rCli.aClassificar.total, -18850, 'a classificar inclui a categoria da linha excluída');
// categoria nova no mês seguinte
const cliNovas = D.novoCliente('Ótica Novas');
const setOut = pCa.lancamentos.filter(x => x.mes < '2026-11');
D.confirmarSugestoes(cliNovas, D.classificarCategorias(setOut, cliNovas).lista);
D.ligar(cliNovas, 'despesas diversas', 'Despesas diversas', 'administrativas');
const novas = D.classificarCategorias(pCa.lancamentos, cliNovas).lista.filter(c => c.nova).map(c => c.nome);
igual(novas, ['Uniformes'], 'categoria nova em novembro aparece destacada');
igual(D.classificarCategorias(pCa.lancamentos, otica).lista.filter(c => c.nova).length, 0, 'depois de confirmar, as que ficaram a classificar no mesmo arquivo não viram "nova"');

// copiar e importar modelo
const outra = D.novoCliente('Ótica Filial');
verdade(D.aplicarModelo(outra, D.exportarModelo(otica), true), 'copia modelo de outro cliente');
igual(Object.keys(outra.ligacoes).length, 15, 'copia as ligações junto');
igual(D.aplicarModelo(outra, { modelo: { linhas: [] } }, false), false, 'recusa modelo inválido');
const json = JSON.parse(JSON.stringify(D.exportarModelo(cli)));
igual(json.tipo, 'ferramentas-bpo:modelo-dre', 'exporta modelo em JSON');

// lembrar colunas por cliente
D.lembrarColunas(padaria, om.cab, om.escolha, true);
igual(D.colunasLembradas(padaria, om.cab).escolha, om.escolha, 'lembra o mapeamento pela assinatura do cabeçalho');
igual(D.colunasLembradas(padaria, nb.cab), null, 'cabeçalho diferente não usa o mapeamento');

// estado guardado e backup
const est = D.carregarEstado(JSON.parse(JSON.stringify({ clientes: [otica, padaria], clienteAtual: padaria.id, config: { bpo: 'Exata BPO' } })));
igual([est.clientes.length, est.clienteAtual, est.config.bpo], [2, padaria.id, 'Exata BPO'], 'restaura estado');
igual(Object.keys(est.clientes[0].ligacoes).length, 15, 'ligações persistem no estado');
igual(D.carregarEstado(null).clientes, [], 'estado vazio');
igual(D.ehBackup({ x: 1 }), false, 'arquivo qualquer não é backup');

// meses e janela do painel
igual(D.mesesDe([{ mes: '2026-12' }, { mes: '2027-02' }]), ['2026-12', '2027-01', '2027-02'], 'meses sem buracos, com virada de ano');
igual(D.janelaMeses(['2026-09', '2026-10', '2026-11'], '2026-10', 3), ['2026-09', '2026-10'], 'janela do painel');

// Excel
const abasX = D.abasExcel(rCa, otica);
igual(abasX.map(a => a.nome), ['DRE', 'Lançamentos classificados'], 'Excel: duas abas');
igual(abasX[0].linhas[1], ['Linha da DRE', 'set/26', 'out/26', 'nov/26', 'Total', '% da receita'], 'Excel: cabeçalho da DRE');
igual(abasX[1].linhas.length, 51, 'Excel: 50 lançamentos e cabeçalho');

// ========== painel do cliente ==========
otica.logo = 'data:image/png;base64,iVBORw0KGgo=';
const rP = D.calcular(pCa.lancamentos, otica.modelo, D.classificarCategorias(pCa.lancamentos, otica).mapa, { meses: D.janelaMeses(rCa.meses, '2026-11', 3) });
const html = D.gerarPainel(rP, otica, { bpo: 'Exata BPO <teste>', regime: 'caixa', hoje: '2026-12-02' });
verdade(html.indexOf('Ótica Visão Clara') >= 0, 'painel: tem o nome do cliente');
verdade(html.indexOf('<title>Painel financeiro | Ótica Visão Clara | novembro de 2026</title>') >= 0, 'painel: título com cliente e mês');
igual(/<script/i.test(html), false, 'painel: sem JavaScript');
const TRAVESSAO = new RegExp('[' + String.fromCharCode(0x2014, 0x2013) + ']');
igual(TRAVESSAO.test(html), false, 'painel: sem travessão');
verdade(html.indexOf('#7A1F5C') >= 0 && html.indexOf('#E8A33D') >= 0, 'painel: cores do cliente');
verdade(html.indexOf('<svg') >= 0, 'painel: gráfico em SVG');
verdade(html.indexOf('data:image/png;base64,iVBORw0KGgo=') >= 0, 'painel: logo embutido');
verdade(html.indexOf('Exata BPO &lt;teste&gt;') >= 0, 'painel: texto escapado');
igual(/https?:\/\//.test(html.replace('http://www.w3.org/2000/svg', '')), false, 'painel: nenhum endereço externo');
verdade(html.indexOf('Pontos de atenção') >= 0 && html.indexOf('margem líquida caiu') >= 0, 'painel: pontos de atenção');
igual(html.indexOf('ainda a classificar'), -1, 'painel: não mostra o aviso interno de classificar');
const htmlMau = D.gerarPainel(rP, Object.assign({}, otica, { nome: '<script>x</script>', cor1: 'red;}</style><script>', logo: 'javascript:1' }), {});
igual(/<script/i.test(htmlMau), false, 'painel: nome, cor e logo maliciosos não viram script');

// nenhum travessão nos arquivos da ferramenta
['dre.html', 'dre-logica.js', 'dre-app.js', 'dre.css', 'testes/testar_dre.js', 'testes/gerar_exemplos_dre.js'].forEach(f => {
  const t = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  igual(TRAVESSAO.test(t), false, 'sem travessão em ' + f);
});

console.log(`\n${ok} testes ok, ${falhou} falharam`);
process.exit(falhou ? 1 : 0);

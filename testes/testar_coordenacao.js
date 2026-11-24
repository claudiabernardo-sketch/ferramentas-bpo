// Testes do Painel da coordenação. Rode: node testes/testar_coordenacao.js
// Antes, gere os exemplos: node testes/gerar_exemplos_coordenacao.js
const fs = require('fs');
const path = require('path');
const TRAVESSAO = new RegExp('[' + String.fromCharCode(8211) + String.fromCharCode(8212) + ']');
const C = require('../comum.js');
const K = require('../coordenacao-logica.js');
const XLSX = require('../vendor/xlsx.full.min.js');
let ok = 0, falhou = 0;
function igual(obtido, esperado, nome) {
  const a = JSON.stringify(obtido), b = JSON.stringify(esperado);
  if (a === b) ok++; else { falhou++; console.log('FALHOU:', nome, '\n  obtido  ', a, '\n  esperado', b); }
}
function perto(obtido, esperado, nome) {
  if (obtido != null && Math.abs(obtido - esperado) <= 0.005) ok++;
  else { falhou++; console.log('FALHOU:', nome, '\n  obtido  ', obtido, '\n  esperado', esperado); }
}
const REF = '2026-11-24';
const pasta = path.join(__dirname, '..', 'exemplos', 'coordenacao');
function abrir(nome) { return C.lerPlanilha(XLSX, new Uint8Array(fs.readFileSync(path.join(pasta, nome))), nome); }

// ---------- leitura de situação, tipo e conciliação ----------
['Em aberto', 'Atrasado', 'Vencido', 'A vencer', 'Pendente', 'Parcialmente pago', 'Não pago'].forEach(s => igual(K.classificarSituacao(s, 'Situação'), 'aberto', 'situação em aberto: ' + s));
['Pago', 'Quitado', 'Recebido', 'Liquidado', 'Baixado', 'PAGA'].forEach(s => igual(K.classificarSituacao(s, 'Status'), 'pago', 'situação paga: ' + s));
igual(K.classificarSituacao('Cancelado', 'Status'), 'cancelado', 'cancelado não conta');
igual(K.classificarSituacao('Sim', 'Pago?'), 'pago', 'coluna Pago com Sim');
igual(K.classificarSituacao('Não', 'Pago'), 'aberto', 'coluna Pago com Não');
igual(K.classificarSituacao('Sim', 'Em aberto'), 'aberto', 'coluna Em aberto com Sim');
igual(K.classificarSituacao('Renegociar', 'Status'), 'desconhecido', 'situação estranha fica desconhecida');
igual([K.classificarTipo('A pagar'), K.classificarTipo('Despesa'), K.classificarTipo('A receber'), K.classificarTipo('Receita'), K.classificarTipo('xyz')], ['pagar', 'pagar', 'receber', 'receber', null], 'tipo da linha');
igual([K.classificarConc('Conciliado'), K.classificarConc('Não conciliado'), K.classificarConc('Pendente'), K.classificarConc('')], ['conciliado', 'pendente', 'pendente', null], 'situação da conciliação');

// ---------- colunas com nomes de vários sistemas ----------
const colCA = K.detectar(['Data de vencimento', 'Data de pagamento', 'Descrição', 'Fornecedor', 'Categoria', 'Valor (R$)', 'Situação'], 'pagar');
igual([colCA.vencimento, colCA.pagamento, colCA.descricao, colCA.contato, colCA.valor, colCA.situacao], [0, 1, 2, 3, 5, 6], 'colunas estilo Conta Azul (vencimento não pega data de pagamento)');
const colNibo = K.detectar(['Vencimento', 'Contato', 'Descrição', 'Categoria', 'Valor', 'Status'], 'pagar');
igual([colNibo.vencimento, colNibo.contato, colNibo.valor, colNibo.situacao], [0, 1, 4, 5], 'colunas estilo Nibo');
const colOmie = K.detectar(['Data de Vencimento', 'Cliente', 'Valor da Conta', 'Situação', 'Observação'], 'receber');
igual([colOmie.vencimento, colOmie.contato, colOmie.valor, colOmie.situacao], [0, 1, 2, 3], 'colunas estilo Omie');
const colAb = K.detectar(['Vencimento', 'Cliente', 'Valor em aberto'], 'receber');
igual([colAb.valor, colAb.situacao], [2, -1], 'só Valor em aberto vira a coluna Valor; sem situação');
const colDois = K.detectar(['Vencimento', 'Valor', 'Valor em aberto', 'Status'], 'pagar');
igual([colDois.valor, colDois.aberto], [1, 2], 'Valor e Valor em aberto ficam separados');
igual(K.faltandoColunas({ vencimento: -1, valor: 2 }, 'pagar'), ['Vencimento'], 'Vencimento é obrigatório');
igual(K.faltandoColunas({ vencimento: 0, valor: -1, aberto: -1, aPagar: -1, aReceber: -1 }, 'pagar'), ['Valor'], 'Valor é obrigatório');
igual(K.faltandoColunas({ conciliacao: -1 }, 'conciliacao'), ['Situação da conciliação'], 'extrato precisa da coluna de conciliação');

// ---------- vencido x a vencer, pagos ignorados, total ----------
const plan = [
  ['Contas a pagar'], ['Período: novembro'],
  ['Vencimento', 'Fornecedor', 'Valor', 'Situação'],
  ['20/11/2026', 'A', '100,00', 'Atrasado'],
  ['23/11/2026', 'B', '50,00', 'Em aberto'],
  ['24/11/2026', 'C', '30,00', 'Em aberto'],
  ['01/12/2026', 'D', '20,00', 'Em aberto'],
  ['02/12/2026', 'E', '10,00', 'Em aberto'],
  ['15/11/2026', 'F', '999,00', 'Pago'],
  ['xx', 'G', '5,00', 'Em aberto'],
  ['25/11/2026', 'H', '0,00', 'Em aberto'],
  ['Total', '', '1.214,00', '']
];
const p1 = K.prepararAba(plan, 'contas-a-pagar.xlsx');
igual(p1.inicio, 2, 'acha o cabeçalho depois de 2 linhas de título');
igual(p1.tipo, 'pagar', 'tipo pelo nome do arquivo');
igual(p1.resultado.pagar.length, 5, 'guarda só os títulos em aberto');
igual(p1.resultado.ignoradas, { total: 1, pago: 1, cancelado: 0, semData: 1, semValor: 1, semTipo: 0, semConc: 0 }, 'motivos das linhas ignoradas');
igual(p1.resultado.lidas, 9, 'linhas lidas');
const e1 = { id: 'x', nome: 'Teste', cargas: {}, conc: { pendentes: null, ultima: null } };
K.guardarCarga(e1, 'pagar', p1.resultado, 'a.xlsx', REF);
const r1 = K.resumoEmpresa(e1, REF, K.REGRAS_PADRAO);
igual([r1.pagarVencido.qtd, r1.pagarVencido.valor, r1.pagarVencido.maiorAtraso], [2, 150, 4], 'vencido é antes da data de referência');
igual([r1.proximos.qtd, r1.proximos.pagarValor], [2, 50], 'vence hoje e até 7 dias entram em próximos 7 dias; o 8º dia não');
igual(r1.aVencer.length, 3, 'a vencer inclui o que vence depois dos 7 dias');
igual(r1.situacao, 'urgente', 'conta a pagar vencida há 4 dias é urgente (regra: mais de 3)');
const r1b = K.resumoEmpresa(e1, '2026-11-23', K.REGRAS_PADRAO);
igual([r1b.pagarVencido.qtd, r1b.pagarVencido.maiorAtraso], [1, 3], 'mudar a data de referência muda o que está vencido');

// sem coluna de situação: tudo em aberto, com aviso
const semSit = [['Vencimento', 'Cliente', 'Valor'], ['10/11/2026', 'A', '10,00'], ['30/11/2026', 'B', '20,00']];
const p2 = K.prepararAba(semSit, 'contas-a-receber.csv');
igual([p2.tipo, p2.resultado.semSituacao, p2.resultado.receber.length], ['receber', true, 2], 'sem situação: considera tudo em aberto e avisa');
// data de pagamento preenchida, sem situação
const comPag = [['Vencimento', 'Data de pagamento', 'Valor'], ['10/11/2026', '11/11/2026', '10,00'], ['30/11/2026', '', '20,00']];
const p3 = K.prepararAba(comPag, 'pagar.xlsx');
igual([p3.resultado.pagar.length, p3.resultado.ignoradas.pago, p3.resultado.semSituacao], [1, 1, false], 'data de pagamento preenchida conta como pago');
// relatório com Tipo
const comTipo = [['Vencimento', 'Tipo', 'Valor', 'Status'], ['10/11/2026', 'A pagar', '-10,00', 'Em aberto'], ['10/11/2026', 'A receber', '30,00', 'Em aberto'], ['10/11/2026', 'Transferência', '5,00', 'Em aberto']];
const p4 = K.prepararAba(comTipo, 'relatorio.xlsx');
igual([p4.tipo, p4.resultado.pagar.length, p4.resultado.receber.length, p4.resultado.ignoradas.semTipo, p4.resultado.pagar[0].valor], ['ambos', 1, 1, 1, 10], 'coluna Tipo separa pagar e receber; valor fica positivo');
// colunas A pagar e A receber
const colunasPR = [['Vencimento', 'Descrição', 'A receber', 'A pagar'], ['10/11/2026', 'x', '', '40,00'], ['12/11/2026', 'y', '25,00', '']];
const p5 = K.prepararAba(colunasPR, 'movimento.xlsx');
igual([p5.tipo, p5.resultado.pagar.length, p5.resultado.receber.length], ['ambos', 1, 1], 'colunas A pagar e A receber');

// ---------- reconhecer a empresa pelo nome do arquivo ----------
const emps = [{ id: '1', nome: 'Padaria Pão Quente' }, { id: '2', nome: 'Ótica Visão Clara' }, { id: '3', nome: 'Pão' }, { id: '4', nome: 'Clínica Sorriso' }];
igual(K.reconhecerEmpresa('contas-a-pagar-padaria-pao-quente', emps), '1', 'acha a empresa sem acento e com hífen');
igual(K.reconhecerEmpresa('OTICA VISAO CLARA receber', emps), '2', 'acha em maiúsculas');
igual(K.reconhecerEmpresa('pao de queijo', emps), '3', 'fica com o apelido que aparece');
igual(K.reconhecerEmpresa('relatorio-novembro', emps), null, 'não inventa empresa');
igual(K.reconhecerEmpresa('Clinica_Sorriso_CP', emps), '4', 'acha com sublinhado');

// ---------- exemplos gerados ----------
const est = K.novoEstado();
const cart = abrir('carteira-equipe.xlsx')[0].linhas;
const lc = K.lerCarteira(cart);
igual([lc.inicio, lc.escolha.empresa, lc.escolha.assistente], [1, 0, 1], 'carteira: acha Empresa e Assistente depois do título (linha vazia some)');
const imp = K.importarCarteira(est, C.linhasComCampos(cart, lc.inicio, lc.escolha));
igual([imp.novas, imp.novasAssistentes, est.assistentes.length, est.empresas.length], [6, 3, 3, 6], 'carteira importada: 6 empresas e 3 assistentes');
const imp2 = K.importarCarteira(est, [{ empresa: 'padaria pão quente', assistente: 'Bruna Lima' }]);
igual([imp2.novas, imp2.atualizadas, K.acharEmpresaPorNome(est, 'Padaria Pão Quente').assistenteId], [0, 1, K.assistente(est, est.assistentes[1].id).id], 'importar de novo troca a responsável sem duplicar');
K.acharEmpresaPorNome(est, 'Padaria Pão Quente').assistenteId = est.assistentes[0].id;

const arquivos = fs.readdirSync(pasta).filter(n => /\.(xlsx|csv)$/.test(n) && n !== 'carteira-equipe.xlsx').sort();
const tiposEsperados = {
  'Studio Pilates Leve - Contas a Pagar.xlsx': 'pagar', 'Studio Pilates Leve - Contas a Receber.xlsx': 'receber',
  'clinica-sorriso-contas-a-pagar.xlsx': 'pagar', 'clinica-sorriso-contas-a-receber.xlsx': 'receber', 'clinica-sorriso-extrato-conciliacao.xlsx': 'conciliacao',
  'contas-a-pagar-padaria-pao-quente.xlsx': 'pagar', 'contas-a-receber-padaria-pao-quente.xlsx': 'receber',
  'mercadinho-bom-preco-pagar.csv': 'pagar', 'mercadinho-bom-preco-receber-em-aberto.csv': 'receber',
  'otica-visao-clara-contas-a-pagar.csv': 'pagar', 'otica-visao-clara-contas-a-receber.csv': 'receber', 'pet-shop-amigo-fiel-contas-novembro.xlsx': 'ambos'
};
const empEsperada = n => C.simples(n).indexOf('studio') >= 0 ? 'Studio Pilates Leve' : /clinica/.test(n) ? 'Clínica Sorriso' : /padaria/.test(n) ? 'Padaria Pão Quente'
  : /mercadinho/.test(n) ? 'Mercadinho Bom Preço' : /otica/.test(n) ? 'Ótica Visão Clara' : 'Pet Shop Amigo Fiel';
let tiposOk = 0, empOk = 0;
const preps = {};
arquivos.forEach(n => {
  const p = K.prepararArquivo(abrir(n), n, est.empresas);
  preps[n] = p;
  if (p.prep.tipo === tiposEsperados[n]) tiposOk++; else console.log('  tipo errado em', n, p.prep.tipo);
  const e = K.empresa(est, p.empresaId);
  if (e && e.nome === empEsperada(n)) empOk++; else console.log('  empresa errada em', n, e && e.nome);
});
igual(arquivos.length, 12, '12 arquivos de exemplo');
igual(tiposOk, 12, 'tipo de cada arquivo reconhecido');
igual(empOk, 12, 'empresa de cada arquivo reconhecida pelo nome');
igual(preps['mercadinho-bom-preco-receber-em-aberto.csv'].prep.resultado.semSituacao, true, 'csv sem situação avisa');
igual(preps['otica-visao-clara-contas-a-pagar.csv'].prep.resultado.ignoradas.total, 1, 'linha Total do csv ignorada');
igual(preps['contas-a-pagar-padaria-pao-quente.xlsx'].prep.inicio, 2, 'xlsx: cabeçalho depois de 2 linhas de título');
igual(preps['contas-a-pagar-padaria-pao-quente.xlsx'].prep.resultado.ignoradas.pago, 1, 'xlsx: pago ignorado');
igual(preps['clinica-sorriso-extrato-conciliacao.xlsx'].prep.resultado.conc, { pendentes: 3, conciliados: 6 }, 'extrato: conta os pendentes de conciliação');
perto(preps['otica-visao-clara-contas-a-pagar.csv'].prep.resultado.pagar.reduce((s, t) => s + t.valor, 0), 2450 + 1890.3 + 1000, 'csv: valores 1.234,56 lidos certo');

// guarda (receber do Mercadinho com data mais antiga, como no exemplo)
arquivos.forEach(n => {
  const p = preps[n], e = K.empresa(est, p.empresaId);
  K.guardarCarga(e, p.prep.tipo, p.prep.resultado, n, n === 'mercadinho-bom-preco-receber-em-aberto.csv' ? '2026-11-14' : REF);
});
const CONC = { 'Padaria Pão Quente': [4, '2026-11-21'], 'Ótica Visão Clara': [0, '2026-11-23'], 'Studio Pilates Leve': [0, '2026-11-24'],
  'Mercadinho Bom Preço': [12, '2026-11-10'], 'Clínica Sorriso': [null, '2026-11-19'], 'Pet Shop Amigo Fiel': [null, null] };
est.empresas.forEach(e => {
  if (CONC[e.nome][0] != null) K.definirConciliacao(e, 'pendentes', CONC[e.nome][0]);
  if (CONC[e.nome][1]) K.definirConciliacao(e, 'ultima', C.dataBR(CONC[e.nome][1]));
});

// números esperados (os mesmos de exemplos/coordenacao/numeros-esperados.txt)
const ESP = {
  'Padaria Pão Quente': [2, 1550.5, 1, 480, 3, 2450, 1250.75, 'urgente'],
  'Ótica Visão Clara': [1, 2450, 2, 1470, 2, 1890.3, 410, 'atencao'],
  'Studio Pilates Leve': [0, 0, 0, 0, 3, 650, 760, 'emdia'],
  'Mercadinho Bom Preço': [2, 3410, 2, 239.9, 2, 1500, 260, 'urgente'],
  'Clínica Sorriso': [1, 980, 1, 600, 3, 4200, 2050, 'atencao'],
  'Pet Shop Amigo Fiel': [1, 540, 1, 95, 2, 300, 180, 'urgente']
};
const lista = K.resumos(est, REF);
lista.forEach(r => {
  const x = ESP[r.nome];
  igual([r.pagarVencido.qtd, r.pagarVencido.valor, r.receberVencido.qtd, r.receberVencido.valor, r.proximos.qtd, r.proximos.pagarValor, r.proximos.receberValor, r.situacao], x, 'números e selo de ' + r.nome);
});
igual(lista.map(r => r.situacao), ['urgente', 'urgente', 'urgente', 'atencao', 'atencao', 'emdia'], 'ordem por gravidade');
igual(lista[0].nome, 'Mercadinho Bom Preço', 'mais grave primeiro (mais motivos urgentes)');
const clin = lista.find(r => r.nome === 'Clínica Sorriso');
igual([clin.pendencias, clin.diasConc], [3, 5], 'pendências vindas do extrato e dias desde a última conciliação');
const merc = lista.find(r => r.nome === 'Mercadinho Bom Preço');
igual([merc.diasConc, merc.atualizacao, merc.diasAtualizacao], [14, '2026-11-14', 10], 'última atualização é a mais antiga entre pagar e receber');
igual(merc.motivosUrgente.length, 3, 'Mercadinho: 3 motivos de urgência (pagar, receber e conciliação)');
igual(lista.find(r => r.nome === 'Pet Shop Amigo Fiel').motivosAtencao.indexOf('Data da última conciliação não informada') >= 0, true, 'sem data de conciliação vira atenção');

const g = K.resumoGeral(est, REF);
igual([g.empresas, g.pagarVencido.qtd, g.pagarVencido.valor, g.receberVencido.qtd, g.receberVencido.valor, g.proximos.qtd], [6, 7, 8930.5, 7, 2884.9, 15], 'cartões gerais');
igual([g.pendencias, g.empresasComPendencia, g.desatualizadas, g.urgente, g.atencao, g.emdia], [19, 3, 1, 3, 2, 1], 'conciliação, desatualizadas e selos no geral');
const pa = K.porAssistente(est, REF);
igual(pa.map(s => [s.nome, s.empresas, s.pagarVencido.qtd, s.pagarVencido.valor, s.receberVencido.valor, s.pendencias, s.urgente]),
  [['Ana Souza', 2, 3, 4000.5, 1950, 4, 1], ['Bruna Lima', 2, 2, 3410, 239.9, 12, 1], ['Carla Mendes', 2, 2, 1520, 695, 3, 1]], 'somas por assistente');
perto(pa.reduce((s, x) => s + x.pagarVencido.valor, 0), g.pagarVencido.valor, 'soma das assistentes = geral');
igual(K.filtrar(lista, { assistenteId: est.assistentes[2].id }).map(r => r.nome).sort(), ['Clínica Sorriso', 'Pet Shop Amigo Fiel'], 'filtro por assistente');
igual(K.filtrar(lista, { situacao: 'atencao' }).length, 2, 'filtro por situação');

// ---------- regras editáveis ----------
est.regras.urgPagarDias = 10;
igual(K.resumos(est, REF).find(r => r.nome === 'Pet Shop Amigo Fiel').situacao, 'atencao', 'regra mais folgada: Pet Shop sai de urgente');
est.regras.urgPagarDias = null;
igual(K.resumos(est, REF).find(r => r.nome === 'Padaria Pão Quente').situacao, 'atencao', 'regra desligada não deixa urgente');
est.regras = JSON.parse(JSON.stringify(K.REGRAS_PADRAO));
est.regras.atConcDias = 0;
igual(K.resumos(est, REF).find(r => r.nome === 'Ótica Visão Clara').motivosAtencao.some(m => /Conciliação parada há 1 dia$/.test(m)), true, 'regra de atenção da conciliação com 1 dia (singular)');
est.regras = JSON.parse(JSON.stringify(K.REGRAS_PADRAO));
igual(K.resumos(est, '2026-11-30').find(r => r.nome === 'Studio Pilates Leve').situacao, 'atencao', '6 dias depois o Studio fica em atenção (conciliação parada há 6 dias)');
igual(K.resumos(est, '2026-12-02').find(r => r.nome === 'Studio Pilates Leve').motivosUrgente.some(m => /Conciliação parada há 8 dias/.test(m)), true, '8 dias depois a conciliação parada vira urgente');

// ---------- substituição da carga anterior ----------
const pad = K.acharEmpresaPorNome(est, 'Padaria Pão Quente');
const nova = K.prepararAba([['Vencimento', 'Fornecedor', 'Valor', 'Situação'], ['01/12/2026', 'Novo', '77,00', 'Em aberto']], 'pagar.xlsx');
K.guardarCarga(pad, 'pagar', nova.resultado, 'novo.xlsx', '2026-11-25');
igual([pad.cargas.pagar.titulos.length, pad.cargas.pagar.arquivo, pad.cargas.receber.titulos.length], [1, 'novo.xlsx', 3], 'nova carga troca só a de contas a pagar');
igual(K.resumoEmpresa(pad, REF, K.REGRAS_PADRAO).pagarVencido.qtd, 0, 'depois da troca, os vencidos antigos somem');
K.guardarCarga(pad, 'pagar', preps['contas-a-pagar-padaria-pao-quente.xlsx'].prep.resultado, 'contas-a-pagar-padaria-pao-quente.xlsx', REF);

// conciliação manual
igual((() => { try { K.definirConciliacao(pad, 'pendentes', '-2'); return 'aceitou'; } catch (e) { return 'recusou'; } })(), 'recusou', 'pendências negativas são recusadas');
K.definirConciliacao(pad, 'ultima', '');
igual(K.resumoEmpresa(pad, REF, K.REGRAS_PADRAO).diasConc, null, 'apagar a data da conciliação deixa sem dias');
K.definirConciliacao(pad, 'ultima', '2026-11-21');
igual(K.resumoEmpresa(pad, REF, K.REGRAS_PADRAO).diasConc, 3, 'dias desde a última conciliação');

// ---------- Excel ----------
const abas = K.abasExcel(est, REF);
igual(abas.map(a => a.nome), ['Resumo', 'Por assistente', 'Por empresa', 'Títulos vencidos'], 'Excel com as abas certas');
const livro = XLSX.utils.book_new();
abas.forEach(a => XLSX.utils.book_append_sheet(livro, XLSX.utils.aoa_to_sheet(a.linhas), a.nome));
const lido = XLSX.read(XLSX.write(livro, { type: 'array', bookType: 'xlsx' }), { type: 'array' });
igual(lido.SheetNames, ['Resumo', 'Por assistente', 'Por empresa', 'Títulos vencidos'], 'Excel abre com as 4 abas');
igual(abas[3].linhas.length - 1, 14, 'aba Títulos vencidos com os 14 vencidos');
igual(abas[2].linhas.length - 1, 6, 'aba Por empresa com 6 empresas');
igual(abas[1].linhas.slice(1).map(l => l[0]), ['Ana Souza', 'Bruna Lima', 'Carla Mendes'], 'aba Por assistente');

// ---------- backup ----------
est.ultimoBackup = '2026-11-24T10:00:00.000Z';
const bk = K.criarBackup(est, '2026-11-24T10:00:00.000Z');
const volta = K.lerBackup(JSON.parse(JSON.stringify(bk)));
igual(JSON.stringify(K.resumos(volta, REF)), JSON.stringify(K.resumos(est, REF)), 'backup restaurado dá o mesmo painel');
igual([volta.assistentes.length, volta.empresas.length, volta.ultimoBackup], [3, 6, '2026-11-24T10:00:00.000Z'], 'backup guarda equipe e carteira');
igual((() => { try { K.lerBackup({ ferramenta: 'outra', dados: {} }); return 'aceitou'; } catch (e) { return 'recusou'; } })(), 'recusou', 'backup de outra ferramenta é recusado');
const exemplo = K.lerBackup(JSON.parse(fs.readFileSync(path.join(pasta, 'backup-exemplo-painel-coordenacao.json'), 'utf8')));
igual(K.resumoGeral(exemplo, REF).pagarVencido.valor, 8930.5, 'backup de exemplo abre com os mesmos números');
const sujo = K.normalizar({ assistentes: [{ id: 'a', nome: 'X' }], empresas: [{ id: 'e', nome: 'Y', assistenteId: 'zzz', cargas: { pagar: { atualizadoEm: 'ontem', titulos: [] } }, conc: { pendentes: 'abc' } }] });
igual([sujo.empresas[0].assistenteId, Object.keys(sujo.empresas[0].cargas).length, sujo.empresas[0].conc.pendentes], [null, 0, null], 'backup com dados estranhos é limpo');

// ---------- excluir ----------
const est2 = K.lerBackup(bk);
K.excluirAssistente(est2, est2.assistentes[0].id);
igual([est2.assistentes.length, K.porAssistente(est2, REF).slice(-1)[0].nome, K.porAssistente(est2, REF).slice(-1)[0].empresas], [2, 'Sem responsável', 2], 'excluir assistente deixa as empresas sem responsável');
K.excluirEmpresa(est2, est2.empresas[0].id);
igual(est2.empresas.length, 5, 'excluir empresa');
igual((() => { try { K.adicionarEmpresa(est2, 'clinica sorriso'); return 'aceitou'; } catch (e) { return 'recusou'; } })(), 'recusou', 'não deixa empresa repetida');

// ---------- sem travessão ----------
const raiz = path.join(__dirname, '..');
['coordenacao.html', 'coordenacao-logica.js', 'coordenacao-app.js', 'coordenacao.css', 'testes/testar_coordenacao.js', 'testes/gerar_exemplos_coordenacao.js', 'exemplos/coordenacao/numeros-esperados.txt'].forEach(f => {
  const p = path.join(raiz, f);
  igual(fs.existsSync(p) && !TRAVESSAO.test(fs.readFileSync(p, 'utf8')), true, 'sem travessão em ' + f);
});
igual(TRAVESSAO.test(JSON.stringify(abas)) || TRAVESSAO.test(JSON.stringify(lista.map(r => r.motivos))), false, 'sem travessão nos textos gerados');

console.log(ok + ' verificações ok, ' + falhou + ' falharam.');
process.exit(falhou ? 1 : 0);

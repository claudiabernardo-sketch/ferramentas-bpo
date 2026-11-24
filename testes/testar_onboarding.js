// Testes da ferramenta Recorrentes para o Conta Azul. Rode: node testes/testar_onboarding.js
// (rode antes node testes/gerar_exemplos_onboarding.js se a pasta exemplos/onboarding estiver vazia)
const fs = require('fs');
const path = require('path');
const C = require('../comum.js');
const O = require('../onboarding-logica.js');
const XLSX = require('../vendor/xlsx.full.min.js');
const TRAVESSAO = new RegExp('[' + String.fromCharCode(8211) + String.fromCharCode(8212) + ']');
let ok = 0, falhou = 0;
function igual(obtido, esperado, nome) {
  const a = JSON.stringify(obtido), b = JSON.stringify(esperado);
  if (a === b) ok++; else { falhou++; console.log('FALHOU:', nome, '\n  obtido  ', a, '\n  esperado', b); }
}
function verdade(v, nome) { igual(!!v, true, nome); }

// ---------- chave do favorecido com históricos reais de bancos ----------
const chaves = [
  ['PIX ENVIADO - JOAO DA SILVA', 'JOAO DA SILVA'],
  ['PIX QRS IFOOD 12/03', 'IFOOD'],
  ['PAG BOLETO 0001234 CEMIG DISTRIBUICAO', 'CEMIG DISTRIBUICAO'],
  ['PAGTO ELETRON COBRANCA SABESP', 'SABESP'],
  ['DEB AUT ENEL SP 123456', 'ENEL SP'],
  ['DEBITO AUTOMATICO VIVO 03/26', 'VIVO'],
  ['TED 001.0001 JOSE SANTOS', 'JOSE SANTOS'],
  ['Pix - Enviado 12/03 14:22 Maria Souza', 'MARIA SOUZA'],
  ['Pix enviado: "Cp :18236120-MARIA SOUZA"', 'MARIA SOUZA'],
  ['Transferência enviada pelo Pix - MARIA SOUZA - •••.456.789-•• - BCO DO BRASIL S.A. (0001) Agência: 1 Conta: 1234-5', 'MARIA SOUZA'],
  ['SISPAG PIX MARIA SOUZA', 'MARIA SOUZA'],
  ['PAGAMENTO DAS SIMPLES NACIONAL 07202512345', 'DAS SIMPLES NACIONAL'],
  ['TAR PACOTE SERVICOS', 'PACOTE SERVICOS'],
  ['COMPRA CARTAO DEB MP*CANVA 15/01', 'MP CANVA'],
  ['DÉB.CONV.ÁGUA SANEAGO', 'AGUA SANEAGO'],
  ['PAGAMENTO DE SALARIO', 'SALARIO'],
  ['PIX RECEBIDO ***.456.789-** ANA PAULA', 'ANA PAULA'],
  ['TED RECEBIDA 033 0001 PADARIA PAO BOM', 'PADARIA PAO BOM']
];
chaves.forEach(([h, k]) => igual(O.normalizarHistorico(h).chave, k, 'chave: ' + h));
// mesmo favorecido em meses diferentes dá a mesma chave
igual(O.normalizarHistorico('DEB AUT VIVO FIBRA 01/26').chave, O.normalizarHistorico('DEB AUT VIVO FIBRA 11/26').chave, 'mesma chave com data diferente');
// CPF e CNPJ guardados à parte (só se forem válidos)
igual(O.normalizarHistorico('PIX ENVIADO IMOBILIARIA LAR LTDA 11.222.333/0001-81').doc, '11222333000181', 'CNPJ guardado');
igual(O.normalizarHistorico('PIX RECEBIDO 52998224725 ANA PAULA').doc, '52998224725', 'CPF sem pontos guardado');
igual(O.normalizarHistorico('PAG BOLETO 12345678901 FORNECEDOR X').doc, '', 'número de 11 dígitos que não é CPF não vira documento');
igual(O.normalizarHistorico('PAG TRIBUTO PREFEITURA IPTU 2026 PARC 03/10').parcela, { atual: 3, total: 10 }, 'parcela 03/10');
igual(O.normalizarHistorico('CARNE LOJA X PARCELA 2 DE 6').parcela, { atual: 2, total: 6 }, 'parcela 2 de 6');
igual(O.cpfValido('52998224725'), true, 'CPF válido');
igual(O.cnpjValido('11222333000182'), false, 'CNPJ com dígito errado');
igual(O.nomeBonito('IMOBILIARIA LAR DA SILVA'), 'Imobiliaria Lar da Silva', 'nome bonito');

// ---------- categorias sugeridas ----------
igual(O.sugerirCategoria('PAG BOLETO CEMIG', 'pagar').nome, 'Energia elétrica', 'categoria energia');
igual(O.sugerirCategoria('PAGAMENTO DAS SIMPLES NACIONAL', 'pagar').nome, 'Impostos e taxas', 'categoria DAS');
igual(O.sugerirCategoria('GPS INSS 2100', 'pagar').nome, 'Impostos e taxas', 'categoria GPS');
igual(O.sugerirCategoria('DEB AUT VIVO', 'pagar').nome, 'Internet e telefone', 'categoria Vivo');
igual(O.sugerirCategoria('TIMBRE PAPELARIA', 'pagar').nome, 'Fornecedores', 'TIM só como palavra inteira');
igual(O.sugerirCategoria('PIX RECEBIDO CLINICA', 'receber').nome, 'Recebimento de clientes', 'entrada vira recebimento');
igual(O.sugerirCategoria('RENDIMENTO POUPANCA', 'receber').nome, 'Outras receitas', 'rendimento não é cliente');

// ---------- periodicidade ----------
igual(O.detectarPeriodo([1, 1, 1, 1]), 1, 'mensal');
igual(O.detectarPeriodo([1, 1, 2, 1, 1]), 1, 'mensal com um mês faltando');
igual(O.detectarPeriodo([2, 2, 2]), 2, 'bimestral');
igual(O.detectarPeriodo([3, 3, 3]), 3, 'trimestral');
igual(O.detectarPeriodo([6, 6]), 6, 'semestral');
igual(O.detectarPeriodo([12, 12]), 12, 'anual');
igual(O.detectarPeriodo([1, 5]), null, 'irregular (1 e 5) não é recorrente');
igual(O.detectarPeriodo([5, 1, 2]), null, 'irregular (5, 1, 2)');

// ---------- achar recorrentes em dados pequenos ----------
function mov(data, historico, valor) { return { data, historico, valor, conta: 'CC' }; }
const movs = [];
['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06'].forEach((m, i) => {
  movs.push(mov(m + '-05', 'PIX ENVIADO IMOBILIARIA LAR', -3000));
  movs.push(mov(m + '-1' + (i % 3), 'PAG BOLETO ' + (100 + i) + ' CEMIG', -(300 + i * 40)));
  if (i < 3) movs.push(mov(m + '-08', 'COMPRA CARTAO NETFLIX', -55.9));
  movs.push(mov(m + '-25', 'PIX RECEBIDO CLIENTE BOM', 1000));
});
['2026-01', '2026-03', '2026-05'].forEach(m => movs.push(mov(m + '-31', 'PAG BOLETO CONSULTORIA BIMESTRAL', -800)));
['2025-01', '2026-01'].forEach(m => movs.push(mov(m + '-20', 'PAG BOLETO SEGURADORA TAL', -1200)));
movs.push(mov('2026-02-14', 'COMPRA CARTAO LOJA AVULSA', -99));
movs.push(mov('2026-04-14', 'COMPRA CARTAO LOJA AVULSA', -120));
movs.push(mov('2026-03-03', 'PAG BOLETO SEGURO EMPRESARIAL', -2000));
const r = O.acharRecorrentes(movs, { minMeses: 3 });
const por = nome => r.itens.find(i => i.chave === nome);
igual(r.mesFinal, '2026-06', 'último mês dos dados');
igual(por('IMOBILIARIA LAR') && por('IMOBILIARIA LAR').periodicidade, 'mensal', 'aluguel mensal');
igual(por('IMOBILIARIA LAR').variavel, false, 'aluguel valor fixo');
igual(por('IMOBILIARIA LAR').dia, 5, 'aluguel dia 5');
igual(por('IMOBILIARIA LAR').valor, 3000, 'aluguel valor');
igual(por('CEMIG').variavel, true, 'energia valor variável');
igual(por('CEMIG').valor, C.arred((420 + 460 + 500) / 3), 'energia: média dos últimos 3');
igual(por('CEMIG').ultimoValor, 500, 'energia: último valor');
igual(por('CEMIG').categoria, 'Energia elétrica', 'energia categoria');
igual(por('NETFLIX').talvezCancelado, true, 'Netflix parou de aparecer');
igual(por('NETFLIX').incluir, false, 'talvez cancelado vem desmarcado');
igual(por('CLIENTE BOM').tipo, 'receber', 'entrada vira conta a receber');
igual(por('CONSULTORIA BIMESTRAL').periodicidade, 'bimestral', 'bimestral achado');
igual(por('SEGURADORA TAL').periodicidade, 'anual', 'anual com 2 ocorrências de valor fixo');
igual(por('SEGURO EMPRESARIAL').possivelAnual, true, 'seguro que apareceu uma vez: possível anual');
igual(por('SEGURO EMPRESARIAL').incluir, false, 'possível anual vem desmarcado');
igual(r.avulsos.some(a => a.nome === 'Loja Avulsa'), true, 'compra avulsa fica de fora');
igual(r.itens.some(i => i.chave === 'LOJA AVULSA'), false, 'compra avulsa não está nos recorrentes');
const r2 = O.acharRecorrentes(movs, { minMeses: 7 });
igual(r2.itens.some(i => i.chave === 'IMOBILIARIA LAR'), false, 'mínimo de meses editável (7 tira o aluguel de 6 meses)');

// ---------- regras lembradas ----------
const regras = {};
const alug = por('IMOBILIARIA LAR');
O.lembrar(regras, alug, 'nome', 'Imobiliária Lar');
O.lembrar(regras, alug, 'incluir', true);
igual(regras[alug.id], { nome: 'Imobiliária Lar' }, 'regra guarda só o que mudou');
const outraVez = O.acharRecorrentes(movs, { minMeses: 3 });
O.aplicarRegras(outraVez.itens, regras);
igual(outraVez.itens.find(i => i.id === alug.id).nome, 'Imobiliária Lar', 'nome renomeado volta na próxima vez');

// ---------- ocorrências ----------
const it31 = { incluir: true, tipo: 'pagar', nome: 'Teste', dia: 31, valor: 100, periodicidade: 'mensal', ultimoMes: '2026-11' };
const oc31 = O.gerarOcorrencias([it31], '2026-12', 4);
igual(oc31.map(o => o.vencimento), ['2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31'], 'dia 31 em fevereiro vira 28');
const it29 = Object.assign({}, it31, { ultimoMes: '2027-12' });
igual(O.gerarOcorrencias([it29], '2028-02', 1)[0].vencimento, '2028-02-29', 'ano bissexto: 29/02');
const itAnual = { incluir: true, tipo: 'pagar', nome: 'Seguro', dia: 18, valor: 1890, periodicidade: 'anual', ultimoMes: '2026-03' };
igual(O.gerarOcorrencias([itAnual], '2026-12', 12).map(o => o.vencimento), ['2027-03-18'], 'anual cai no mês certo');
const itTri = { incluir: true, tipo: 'receber', nome: 'Tri', dia: 10, valor: 50, periodicidade: 'trimestral', ultimoMes: '2026-10' };
igual(O.gerarOcorrencias([itTri], '2026-12', 12).map(o => o.mes), ['2027-01', '2027-04', '2027-07', '2027-10'], 'trimestral');
const itParc = { incluir: true, tipo: 'pagar', nome: 'IPTU', dia: 10, valor: 420, periodicidade: 'mensal', ultimoMes: '2026-11', parcelas: { atual: 9, total: 10, restantes: 1 } };
const ocParc = O.gerarOcorrencias([itParc], '2026-12', 12);
igual(ocParc.length, 1, 'parcelado para na última parcela');
igual(ocParc[0].parcela, '10/10', 'número da parcela');
igual(O.gerarOcorrencias([Object.assign({}, it31, { incluir: false })], '2026-12', 12).length, 0, 'desmarcado não gera');
igual(O.gerarOcorrencias([it31, itTri], '2026-12', 12, ['receber']).length, 4, 'só receber');
igual(O.mesQueVem('2026-11-24'), '2026-12', 'mês que vem');
igual(O.mesQueVem('2026-12-05'), '2027-01', 'mês que vem na virada do ano');

// ---------- o modelo de importação ----------
const cab = ['Data de competência', 'Data de vencimento', 'Descrição', 'Valor', 'Fornecedor/Cliente', 'CPF/CNPJ', 'Categoria', 'Centro de custo', 'Forma de pagamento', 'Conta financeira', 'Observações', 'Tipo', 'Data de pagamento', 'Recorrência'];
const mapa = O.detectarMapaModelo(cab);
igual(mapa.map(m => m.modo === 'campo' ? m.campo : m.modo),
  ['competencia', 'vencimento', 'descricao', 'valor', 'contato', 'documento', 'categoria', 'centroCusto', 'formaPagamento', 'conta', 'observacoes', 'tipo', 'branco', 'branco'],
  'colunas do modelo reconhecidas (data de pagamento e recorrência ficam em branco)');
igual(O.detectarMapaModelo(['Vencimento', 'Valor', 'Nome do fornecedor', 'Cliente']).map(m => m.campo), ['vencimento', 'valor', 'fornecedor', 'cliente'], 'fornecedor e cliente separados');
igual(O.assinatura(['Data ', 'VALOR', '']), 'data|valor', 'assinatura do cabeçalho');
igual(O.faltandoModelo([{ modo: 'campo', campo: 'descricao' }]), ['Data de vencimento', 'Valor'], 'bloqueia sem vencimento e valor');
// formatos
igual(O.detectarFormatoData({ t: 's', v: '05/01/2026' }), { tipo: 'texto', padrao: 'dd/mm/aaaa' }, 'data dd/mm/aaaa');
igual(O.celulaData('2027-02-28', O.detectarFormatoData({ t: 's', v: '2026-01-05' })).v, '2027-02-28', 'data ISO');
igual(O.celulaData('2027-02-28', O.detectarFormatoData({ t: 's', v: '05-01-26' })).v, '28-02-27', 'data dd-mm-aa');
igual(O.celulaData('2027-02-28', O.detectarFormatoData({ t: 'n', v: 46027, z: 'dd/mm/yyyy' })), { t: 'n', v: 46446, z: 'dd/mm/yyyy' }, 'data como número do Excel');
igual(O.celulaData('2027-02-28', O.detectarFormatoData(null)).v, '28/02/2027', 'sem exemplo: dd/mm/aaaa');
igual(O.celulaValor(1234.5, O.detectarFormatoValor({ t: 's', v: '1.500,00' })).v, '1.234,50', 'valor texto brasileiro');
igual(O.celulaValor(1234.5, O.detectarFormatoValor({ t: 'n', v: 1500, z: '#,##0.00' })), { t: 'n', v: 1234.5, z: '#,##0.00' }, 'valor número');
igual(O.detectarFormatoValor({ t: 'n', v: -1500 }).negativoPagar, true, 'exemplo negativo: pagar sai negativo');
igual(O.detectarTextosTipo({ t: 's', v: 'Despesa' }), { pagar: 'Despesa', receber: 'Receita' }, 'textos do tipo imitam o exemplo');

// ---------- ponta a ponta com os arquivos de exemplo ----------
const pasta = path.join(__dirname, '..', 'exemplos', 'onboarding');
function lerExtrato(arquivo) {
  const abas = C.lerPlanilha(XLSX, new Uint8Array(fs.readFileSync(path.join(pasta, arquivo))), arquivo);
  const a = abas[O.melhorAba(abas)], p = O.prepararAba(a.linhas);
  return O.lerMovimentos(a.linhas, p.inicio, p.escolha, arquivo);
}
const lc = lerExtrato('escritorio-modelo-conta-corrente-dez25-a-nov26.xlsx');
const ld = lerExtrato('escritorio-modelo-conta-digital-dez25-a-nov26.csv');
igual(lc.movs.length, 151, 'conta corrente: lançamentos lidos');
igual(lc.ignoradas.saldo, 13, 'conta corrente: linhas de saldo ignoradas');
igual(lc.ignoradas.total, 1, 'conta corrente: linha de total ignorada');
igual(ld.movs.length, 39, 'conta digital: lançamentos lidos');
igual(ld.ignoradas.saldo, 2, 'conta digital: saldos ignorados');
verdade(ld.movs.some(m => m.valor < 0) && ld.movs.some(m => m.valor > 0), 'crédito e débito viram sinal');
const ex = O.acharRecorrentes(lc.movs.concat(ld.movs), { minMeses: 3 });
igual(ex.itens.length, 16, 'exemplo: 16 recorrentes');
igual(ex.itens.filter(i => i.incluir).length, 14, 'exemplo: 14 marcados');
igual(ex.itens.filter(i => i.tipo === 'receber').length, 3, 'exemplo: 3 clientes');
igual(ex.avulsos.length, 8, 'exemplo: 8 avulsos fora');
const ach = k => ex.itens.find(i => i.chave === k);
igual(ach('MARIA SOUZA').categoria, 'Folha e salários', 'Pix para CPF sugere folha');
igual(ach('MP CANVA').talvezCancelado, true, 'assinatura que parou em agosto');
igual(ach('TRIBUTO PREFEITURA IPTU').parcelas, { atual: 9, total: 10, restantes: 1 }, 'IPTU em 10 parcelas');
igual(ach('PORTO SEGURO EMPRESA').possivelAnual, true, 'seguro anual');
igual(ex.avulsos.some(a => a.nome === 'Posto Shell'), true, 'posto irregular fica de fora');
const ocEx = O.gerarOcorrencias(ex.itens, '2026-12', 12);
igual(ocEx.length, 157, 'exemplo: 157 linhas geradas');

// modelo de exemplo: preencher e conferir que as linhas de cima ficaram
const bytesModelo = new Uint8Array(fs.readFileSync(path.join(pasta, 'modelo_importacao_EXEMPLO.xlsx')));
const modelo = O.lerModelo(XLSX, bytesModelo, 'modelo_importacao_EXEMPLO.xlsx');
const abaIdx = O.melhorAbaModelo(modelo);
igual(modelo.abas[abaIdx].nome, 'Lançamentos', 'aba do modelo achada');
const an = O.analisarAbaModelo(modelo.abas[abaIdx]);
igual(an.linhaCab, 2, 'cabeçalho do modelo na linha 3');
verdade(an.exemplo, 'linha de exemplo encontrada');
const mapaEx = O.detectarMapaModelo(an.cabecalho);
const formatos = O.formatosDoModelo(mapaEx, an.exemplo);
mapaEx[8] = { modo: 'fixo', valor: 'Boleto' };
const textos = O.detectarTextosTipo(an.exemplo[11]);
const linhasNovas = O.montarLinhasModelo(ocEx.filter(o => o.item.tipo === 'pagar'), mapaEx, formatos, textos);
const saida = O.gerarArquivoModelo(XLSX, modelo, [{ abaIdx, linhaCab: an.linhaCab, linhas: linhasNovas }]);
const volta = XLSX.read(saida, { type: 'array' });
igual(volta.SheetNames, ['Lançamentos', 'Instruções'], 'abas do modelo preservadas');
const fv = volta.Sheets['Lançamentos'];
const lin = XLSX.utils.sheet_to_json(fv, { header: 1, raw: true, defval: '' });
igual(String(lin[0][0]).slice(0, 17), 'MODELO DE EXEMPLO', 'linha 1 de instrução preservada');
igual(String(lin[1][0]).slice(0, 10), 'Preencha a', 'linha 2 de instrução preservada');
igual(lin[2][1], 'Data de vencimento', 'cabeçalho preservado');
igual(lin.length, 3 + 121, 'linha de exemplo trocada pelas 121 contas a pagar');
igual(lin[3][1], '01/12/2026', 'primeira data no formato do exemplo');
igual(lin[3][11], 'Despesa', 'tipo com o texto do exemplo');
igual(lin[3][8], 'Boleto', 'valor fixo digitado');
igual(typeof lin[3][3], 'number', 'valor como número, igual ao exemplo');
igual(lin[3][7], '', 'centro de custo em branco');
verdade(lin.slice(3).every(l => !/^Exemplo/.test(l[2])), 'linha de exemplo do modelo não sobrou');
verdade(fv['!merges'] && fv['!merges'].length === 2, 'mesclagens do título preservadas');

// modelo em CSV
const csvModelo = '﻿Instrução: não apague esta linha\r\nVencimento;Descrição;Valor;Fornecedor\r\n';
const mcsv = O.lerModelo(XLSX, new TextEncoder().encode(csvModelo), 'modelo.csv');
const acsv = O.analisarAbaModelo(mcsv.abas[0]);
igual(acsv.linhaCab, 1, 'csv: cabeçalho na linha 2');
const mapaCsv = O.detectarMapaModelo(acsv.cabecalho);
const txtCsv = O.gerarArquivoModelo(XLSX, mcsv, [{ abaIdx: 0, linhaCab: acsv.linhaCab, linhas: O.montarLinhasModelo(ocParc, mapaCsv, O.formatosDoModelo(mapaCsv, null, ';')) }]);
igual(txtCsv.replace('﻿', '').split('\r\n').slice(0, 3), ['Instrução: não apague esta linha', 'Vencimento;Descrição;Valor;Fornecedor', '10/12/2026;IPTU;420,00;IPTU'], 'csv: linha de cima preservada e valor com vírgula');

// ---------- backup ----------
const est = O.novoEstado();
const cli = O.garantirCliente(est, 'Escritório Modelo');
cli.regras = { 'P:X': { nome: 'Y', lixo: 1 } };
est.mapas['a|b'] = { colunas: [{ modo: 'campo', campo: 'valor' }, { modo: 'fixo', valor: 'Boleto' }, { modo: 'campo', campo: 'inventado' }] };
const restaurado = O.lerBackup(JSON.parse(JSON.stringify(O.criarBackup(est, '2026-11-24T10:00:00Z'))));
igual(restaurado.clientes[0].regras, { 'P:X': { nome: 'Y' } }, 'backup guarda as regras do cliente');
igual(restaurado.mapas['a|b'].colunas.map(c => c.modo), ['campo', 'fixo', 'branco'], 'backup guarda o mapeamento do modelo');
igual(O.garantirCliente(est, 'escritorio modelo').id, cli.id, 'mesmo cliente com acento diferente');
let erro = ''; try { O.lerBackup({ ferramenta: 'monitor-de-volume', dados: {} }); } catch (e) { erro = e.message; }
verdade(/não é um backup/.test(erro), 'backup de outra ferramenta é recusado');

// ---------- sem travessão nos arquivos da ferramenta ----------
['onboarding.html', 'onboarding-logica.js', 'onboarding-app.js', 'onboarding.css', 'testes/testar_onboarding.js', 'testes/gerar_exemplos_onboarding.js', 'exemplos/onboarding/numeros-esperados.txt'].forEach(f => {
  const p = path.join(__dirname, '..', f);
  if (!fs.existsSync(p)) { falhou++; console.log('FALTA O ARQUIVO:', f); return; }
  igual(TRAVESSAO.test(fs.readFileSync(p, 'utf8')), false, 'sem travessão em ' + f);
});

console.log(ok + ' verificações ok, ' + falhou + ' falharam.');
process.exitCode = falhou ? 1 : 0;

// Testes da Conciliação inteligente. Rode: node testes/testar_conciliar.js
const fs = require('fs');
const path = require('path');
const TRAVESSAO = new RegExp('[' + String.fromCharCode(8211) + String.fromCharCode(8212) + ']');
const C = require('../comum.js');
const K = require('../conciliar-logica.js');
const XLSX = require('../vendor/xlsx.full.min.js');
let ok = 0, falhou = 0;
function igual(obtido, esperado, nome) {
  const a = JSON.stringify(obtido), b = JSON.stringify(esperado);
  if (a === b) ok++; else { falhou++; console.log('FALHOU:', nome, '\n  obtido  ', a, '\n  esperado', b); }
}
function verdade(v, nome) { igual(!!v, true, nome); }

// ---------- limpeza do histórico e pedaços do nome ----------
igual(K.limparHistorico('PIX RECEBIDO J SILVA ADV 24/11'), 'J SILVA', 'limpa PIX RECEBIDO, ADV e a data');
igual(K.limparHistorico('TED 341 MARIA APARECID SOUZ'), 'MARIA APARECID SOUZ', 'limpa TED e o número do banco');
igual(K.limparHistorico('PIX RECEB 123.456.789-00'), '', 'só CPF: nada de nome sobra');
igual(K.limparHistorico('CRED TRANSF DOC REM João da Conceição Ltda'), 'JOAO CONCEICAO', 'tira acento, DA, LTDA e palavras do banco');
igual(K.limparHistorico('Pix recebido 05/11/2026 10:32 Ana'), 'ANA', 'tira data completa e hora');
const H1 = K.analisarHistorico('PIX RECEBIDO J SILVA ADV');
igual(H1.tokens, ['SILVA'], 'tokens sem as palavras curtas');
igual(H1.iniciais, ['J'], 'guarda a inicial J');
igual(K.tokensNome('Escritório Silva & Souza Advogados Associados'), ['SILVA', 'SOUZA'], 'nome sem palavras comuns');
igual(K.tokensNome('Padaria Pão Dourado EIRELI ME'), ['PADARIA', 'PAO', 'DOURADO'], 'tira EIRELI e ME');
igual(K.chaveNome('JOÃO SILVA ME'), K.chaveNome('Joao Silva'), 'chave do nome ignora acento e ME');
igual(K.numerosDe('PIX RECEB 123.456.789-00'), ['12345678900'], 'CPF com pontos vira número');
igual(K.meioCPF('PIX ***.456.789-** FULANO'), ['456789'], 'acha os 6 do meio do CPF mascarado');
igual(K.numerosDe('DEP JUDICIAL TJSP 0001234 em 12/11/2026'), ['0001234'], 'número do processo sem a data');
igual(K.parcelaDe('3/10', ''), '3/10', 'parcela 3/10');
igual(K.parcelaDe('', 'Honorários parcela 2 de 6'), '2/6', 'parcela escrita na descrição');
igual(K.processoBate('0001234-56.2025.8.26.0100', '00012345620258260100'), true, 'processo com e sem pontuação');
igual(K.processoBate('123', '456'), false, 'números diferentes não batem');
igual(K.pareceNaoCliente('REND PAGO APLIC AUT MAIS'), 'parece rendimento ou resgate de aplicação', 'rendimento não é cliente');
igual(K.pareceNaoCliente('PIX RECEBIDO MARIA'), '', 'PIX de pessoa não é marcado');
igual(K.contemTexto('PIX RECEBIDO J SILVA ADV', 'j silva'), true, 'regra acha o texto sem ligar para maiúscula');
igual(K.contemTexto('PIX RECEBIDO J SILVANA', 'J SILVA'), false, 'regra compara palavra inteira');

// ---------- casamento de nomes ----------
function tit(id, cliente, valor, venc, extra) {
  return Object.assign({ id, tipo: 'receber', cliente, valor, vencimento: venc, descricao: '', observacoes: '', documento: '', parcela: '', cpf: '' }, extra || {});
}
function lanc(data, historico, valor) { return { id: data + historico + valor, data, historico, valor, conta: 'Banco', documento: '' }; }
const empVazia = K.novaEmpresa('Teste');
{
  const ts = [tit('a', 'Maria Aparecida Souza', 100, '2026-11-05'), tit('b', 'Joao Pedro Lins', 100, '2026-11-05')];
  const ctx = K.montarContexto(ts, empVazia);
  const nm = K.casarNome(K.analisarHistorico('TED 341 MARIA APARECID SOUZ'), 'a', ctx);
  verdade(nm.bate, 'prefixo cortado pelo banco bate (APARECID, SOUZ)');
  verdade(/cortado/.test(nm.motivo), 'motivo avisa que o nome veio cortado');
  igual(K.casarNome(K.analisarHistorico('TED 341 MARIA APARECID SOUZ'), 'b', ctx).bate, false, 'outro cliente não bate');
  const ini = K.casarNome(K.analisarHistorico('PIX J P LINS'), 'b', ctx);
  verdade(ini.bate, 'iniciais J P + LINS batem com JOAO PEDRO LINS');
  verdade(/inicial J de JOAO/.test(ini.motivo), 'motivo cita a inicial');
  igual(K.casarNome(K.analisarHistorico('PIX RECEBIDO MARIA'), 'a', ctx).bate, false, 'só um nome comum (MARIA) não basta');
  igual(K.casarNome(K.analisarHistorico('PIX RECEBIDO J'), 'b', ctx).pontos, 0, 'inicial sozinha não conta');
  const raro = K.casarNome(K.analisarHistorico('PIX LINS'), 'b', ctx);
  const comum = K.casarNome(K.analisarHistorico('PIX SOUZA'), 'a', ctx);
  verdade(raro.pontos > comum.pontos, 'sobrenome raro vale mais que sobrenome comum');
  verdade(raro.bate && !comum.bate, 'sobrenome raro sozinho bate, comum sozinho não');
  igual(K.casarNome(K.analisarHistorico('PIX APA'), 'a', ctx).pontos, 0, 'pedaço curto demais (3 letras) não é prefixo');
  igual(K.casarNome(K.analisarHistorico('PIX DA DOS LTDA'), 'a', ctx).pontos, 0, 'palavras comuns não contam');
}
// CPF completo e parcial
{
  const ts = [tit('a', 'Padaria Pão Dourado Ltda', 1500, '2026-11-10'), tit('b', 'Outra Empresa Ltda', 1500, '2026-11-10')];
  const emp = K.novaEmpresa('E');
  emp.pagadores.push(K.novoPagador({ nome: 'Ricardo Menezes', cliente: 'Padaria Pão Dourado Ltda', cpf: '123.456.789-00', papel: 'Sócio' }));
  const ctx = K.montarContexto(ts, emp);
  const cheio = K.casarNome(K.analisarHistorico('PIX RECEB 123.456.789-00'), 'a', ctx);
  verdade(cheio.bate && /CPF 123\.456\.789-00/.test(cheio.motivo), 'CPF completo do sócio');
  const meio = K.casarNome(K.analisarHistorico('PIX RECEBIDO ***.456.789-** RIC'), 'a', ctx);
  verdade(meio.bate && /6 dígitos do meio/.test(meio.motivo), 'CPF mascarado: 6 do meio');
  igual(K.casarNome(K.analisarHistorico('PIX RECEB 123.456.789-00'), 'b', ctx).bate, false, 'CPF do sócio não serve para outro cliente');
  const r = K.conciliar([lanc('2026-11-10', 'PIX RECEB 123.456.789-00', 1500)], ts, emp, {});
  igual([r.itens[0].status, r.itens[0].sugestao.ids], ['certo', ['a']], 'mesmo valor em 2 clientes, o CPF decide');
  verdade(/sócio \(Ricardo Menezes\)/.test(r.itens[0].motivo), 'motivo diz que é o sócio');
}

// ---------- valor, parcela, soma e janela de data ----------
{
  const ts = [tit('p1', 'Fernanda Prado Queiroz', 800, '2026-10-05', { parcela: '10/12' }), tit('p2', 'Fernanda Prado Queiroz', 800, '2026-11-05', { parcela: '11/12' }),
    tit('x', 'Carlos Pereira Brandão', 333.33, '2026-11-10', { parcela: '3/6' })];
  const emp = K.novaEmpresa('E');
  let r = K.conciliar([lanc('2026-11-10', 'PIX RECEBIDO CARLOS BRANDAO', 333.37)], ts, emp, {});
  igual(r.itens[0].status, 'certo', 'diferença de 4 centavos fica dentro da tolerância');
  verdade(/parcela 3\/6/.test(r.itens[0].motivo), 'motivo diz qual parcela');
  verdade(/diferença de R\$ 0,04/.test(r.itens[0].motivo), 'motivo mostra a diferença');
  r = K.conciliar([lanc('2026-11-10', 'PIX RECEBIDO CARLOS BRANDAO', 333.40)], ts, emp, {});
  igual(r.itens[0].status === 'certo', false, 'diferença de 7 centavos passa da tolerância padrão');
  emp.opcoes.tolerancia = 0.10;
  r = K.conciliar([lanc('2026-11-10', 'PIX RECEBIDO CARLOS BRANDAO', 333.40)], ts, emp, {});
  igual(r.itens[0].status, 'certo', 'tolerância editável (R$ 0,10)');
  emp.opcoes.tolerancia = 0.05;
  r = K.conciliar([lanc('2026-11-09', 'PIX RECEBIDO FERNANDA P QUEIROZ', 1600)], ts, emp, {});
  igual(r.itens[0].status, 'certo', 'soma de 2 parcelas é Certo');
  igual(r.itens[0].sugestao.ids, ['p1', 'p2'], 'soma usa as duas parcelas');
  verdade(/soma de títulos/.test(r.itens[0].motivo), 'motivo marca soma de títulos');
  // janela de data
  r = K.conciliar([lanc('2026-12-30', 'PIX RECEBIDO CARLOS BRANDAO', 333.33)], ts, emp, {});
  igual(r.itens[0].status, 'provavel', 'fora da janela (50 dias depois): valor + nome fica Provável');
  verdade(/fora da janela/.test(r.itens[0].motivo), 'motivo avisa fora da janela');
  r = K.conciliar([lanc('2026-11-03', 'TED RECEBIDA', 333.33)], ts, emp, {});
  igual(r.itens[0].status, 'provavel', 'valor + data perto, um candidato só: Provável');
  r = K.conciliar([lanc('2026-10-20', 'TED RECEBIDA', 333.33)], ts, emp, {});
  igual(r.itens[0].status, 'sempar', '21 dias antes do vencimento, sem nome: Sem par');
  emp.opcoes.diasAntes = 30;
  r = K.conciliar([lanc('2026-10-20', 'TED RECEBIDA', 333.33)], ts, emp, {});
  igual(r.itens[0].status, 'provavel', 'janela editável: 30 dias antes já aceita');
  const d0 = K.conciliar([lanc('2026-11-10', 'TED RECEBIDA', 333.33)], ts, emp, {}).itens[0].sugestao.data.pontos;
  const d9 = K.conciliar([lanc('2026-11-19', 'TED RECEBIDA', 333.33)], ts, emp, {}).itens[0].sugestao.data.pontos;
  verdade(d0 > d9, 'data mais perto do vencimento vale mais');
  igual(K.diasEntre('2026-11-05', '2026-11-06'), 1, 'diferença de dias');
}

// ---------- ambiguidade, homônimo e regra aprendida ----------
{
  const ts = [tit('a', 'Construtora Horizonte Ltda', 2000, '2026-11-18'), tit('b', 'Clínica Bem Estar Ltda', 2000, '2026-11-15'),
    tit('c', 'Construtora Horizonte Ltda', 950, '2026-11-22'), tit('d', 'Clínica Bem Estar Ltda', 950, '2026-11-20')];
  const emp = K.novaEmpresa('E');
  emp.pagadores.push(K.novoPagador({ nome: 'Paulo Rezende', cliente: 'Construtora Horizonte Ltda', papel: 'Sócio' }));
  emp.pagadores.push(K.novoPagador({ nome: 'Paulo Rezende Filho', cliente: 'Clínica Bem Estar Ltda', papel: 'Sócio' }));
  let r = K.conciliar([lanc('2026-11-17', 'DOC RECEBIDO', 2000)], ts, emp, {});
  igual(r.itens[0].status, 'conferir', 'mesmo valor em 2 clientes, sem nome: Conferir');
  igual(r.itens[0].candidatos.length, 2, 'mostra as 2 opções');
  r = K.conciliar([lanc('2026-11-21', 'PIX RECEBIDO PAULO REZENDE', 950)], ts, emp, {});
  igual(r.itens[0].status, 'conferir', 'homônimo com o mesmo valor: Conferir');
  verdade(/homônimos/.test(r.itens[0].motivo), 'motivo fala de homônimos');
  verdade(r.itens[0].candidatos.length <= 3, 'no máximo 3 opções');
  // regra aprendida vence a pontuação
  emp.regras.push(K.novaRegra({ texto: 'DOC RECEBIDO', cliente: 'Clínica Bem Estar Ltda' }));
  r = K.conciliar([lanc('2026-11-17', 'DOC RECEBIDO', 2000)], ts, emp, {});
  igual([r.itens[0].status, r.itens[0].sugestao.ids], ['certo', ['b']], 'regra aprendida resolve o ambíguo');
  verdade(/regra aprendida/.test(r.itens[0].motivo), 'motivo cita a regra');
  emp.regras.push(K.novaRegra({ texto: 'PAULO REZENDE', cliente: 'Construtora Horizonte Ltda' }));
  r = K.conciliar([lanc('2026-11-20', 'PIX RECEBIDO PAULO REZENDE FILHO', 950)], ts, emp, {});
  igual(r.itens[0].sugestao.ids, ['c'], 'regra vence o nome que pontuaria mais (FILHO apontaria a Clínica)');
  r = K.conciliar([lanc('2026-11-20', 'PIX RECEBIDO PAULO REZENDE', 777)], ts, emp, {});
  igual(r.itens[0].status, 'conferir', 'regra sem valor igual vai para Conferir');
  verdade(/valor não bate/.test(r.itens[0].motivo), 'motivo diz que o valor não bate');
  igual(K.novaRegra({ texto: 'AB', cliente: 'X' }), null, 'regra curta demais não é criada');
  igual(K.novaRegra({ texto: 'TED FULANO' }), null, 'regra sem cliente nem processo não é criada');
}
// regra por processo e pagador por processo
{
  const proc = '1009876-11.2026.5.02.0011';
  const ts = [tit('r1', 'Roberto Tavares Lins', 2500, '2026-11-10', { documento: proc, parcela: '1/4' }), tit('r2', 'Roberto Tavares Lins', 2500, '2026-12-10', { documento: proc, parcela: '2/4' }),
    tit('o', 'Roberto Tavares Lins', 2500, '2026-11-12', { documento: 'outro 5550001' })];
  const emp = K.novaEmpresa('E');
  emp.pagadores.push(K.novoPagador({ nome: 'Joaquim Silva', processo: proc, papel: 'Advogado da parte' }));
  const ctx = K.montarContexto(ts, emp);
  verdade(K.casarNome(K.analisarHistorico('PIX RECEBIDO J SILVA ADV'), 'r1', ctx).bate, 'advogado da parte vale para o processo');
  verdade(/advogado da parte/.test(K.casarNome(K.analisarHistorico('PIX RECEBIDO J SILVA ADV'), 'r1', ctx).motivo), "motivo: 'SILVA' bate com o advogado da parte");
  igual(K.casarNome(K.analisarHistorico('PIX RECEBIDO J SILVA ADV'), 'o', ctx).bate, false, 'advogado não vale para outro processo do mesmo cliente');
  emp.regras.push(K.novaRegra({ texto: 'TRT2 ALVARA', processo: proc }));
  const r = K.conciliar([lanc('2026-11-11', 'TED TRT2 ALVARA 998877', 2500)], ts, emp, {});
  igual([r.itens[0].status, r.itens[0].sugestao.ids], ['certo', ['r1']], 'regra por processo escolhe a parcela do processo');
}

// ---------- título usado sai das próximas sugestões ----------
{
  const ts = [tit('a', 'Ana Beatriz Teles', 500, '2026-11-05'), tit('b', 'Bruno Kalil', 500, '2026-11-06')];
  const emp = K.novaEmpresa('E');
  const ls = [lanc('2026-11-05', 'PIX RECEBIDO ANA B TELES', 500), lanc('2026-11-06', 'TED RECEBIDA', 500)];
  const r = K.conciliar(ls, ts, emp, {});
  igual(r.itens[0].sugestao.ids, ['a'], 'primeiro crédito fica com a Ana pelo nome');
  igual([r.itens[1].status, r.itens[1].sugestao && r.itens[1].sugestao.ids], ['provavel', ['b']], 'o segundo não recebe mais o título da Ana');
  // decisão da pessoa reserva o título
  const r2 = K.conciliar(ls, ts, emp, { [ls[1].id]: { tipo: 'confirmar', ids: ['a'] } });
  igual(r2.itens[1].status, 'confirmado', 'confirmação manual');
  igual(r2.itens[0].sugestao ? r2.itens[0].sugestao.ids : null, ['b'], 'título confirmado sai da sugestão dos outros');
  const r3 = K.conciliar(ls, ts, emp, { [ls[0].id]: { tipo: 'nao' } });
  igual(r3.itens[0].status, 'nao', 'marcar não é recebimento de cliente');
  igual(r3.totais.nao, 1, 'conta os marcados como não é de cliente');
  // parcelas do mesmo cliente: paga a mais antiga primeiro
  const ps = [tit('p1', 'Roberto Lins', 2500, '2026-11-10', { parcela: '1/4' }), tit('p2', 'Roberto Lins', 2500, '2026-12-10', { parcela: '2/4' })];
  const rp = K.conciliar([lanc('2026-11-28', 'PIX ROBERTO LINS', 2500), lanc('2026-11-11', 'PIX ROBERTO LINS', 2500)], ps, emp, {});
  igual(rp.itens.map(i => i.sugestao.ids[0]), ['p2', 'p1'], 'o crédito mais antigo fica com a parcela mais antiga');
}

// ---------- saídas ----------
{
  const ts = [tit('f', 'Fornecedor Papelaria Central', 320, '2026-11-10', { tipo: 'pagar' })];
  const emp = K.novaEmpresa('E');
  const ls = [lanc('2026-11-10', 'PAGTO BOLETO PAPELARIA CENTRAL', -320)];
  let r = K.conciliar(ls, ts, emp, {});
  igual([r.itens.length, r.saidasFora], [0, 1], 'saídas ficam de fora por padrão');
  emp.opcoes.saidas = true;
  r = K.conciliar(ls, ts, emp, {});
  igual([r.itens[0].status, r.itens[0].sugestao.ids], ['certo', ['f']], 'com a opção ligada, saída casa com conta a pagar');
}

// ---------- leitura dos arquivos de exemplo ----------
require('./gerar_exemplos_conciliar.js');
const pasta = path.join(__dirname, '..', 'exemplos', 'conciliar');
function abrir(nome, campos) {
  const abas = C.lerPlanilha(XLSX, new Uint8Array(fs.readFileSync(path.join(pasta, nome))), nome);
  const a = abas[K.melhorAba(abas, campos)];
  return { linhas: a.linhas, prep: K.preparar(a.linhas, campos) };
}
const ex = abrir('escritorio-modelo-extrato-nov-2026.xlsx', K.CAMPOS_EXTRATO);
igual(ex.prep.inicio, 3, 'extrato: acha o cabeçalho depois das linhas do banco (a linha vazia some)');
igual(K.faltandoExtrato(ex.prep.escolha), [], 'extrato: acha Data, Histórico e Valor');
const lidoEx = K.lerExtrato(ex.linhas, ex.prep.inicio, ex.prep.escolha, 'Banco Modelo');
igual([lidoEx.lancamentos.length, lidoEx.ignoradas.saldo], [12, 2], 'extrato: 12 lançamentos, 2 linhas de saldo ignoradas');
const tx = abrir('escritorio-modelo-contas-a-receber.xlsx', K.CAMPOS_TITULOS);
igual(C.faltando(tx.prep.escolha, K.CAMPOS_TITULOS), [], 'contas a receber: acha as obrigatórias');
igual([tx.prep.escolha.documento, tx.prep.escolha.parcela, tx.prep.escolha.observacoes, tx.prep.escolha.cpf], [3, 4, 6, 7], 'contas a receber: acha os opcionais');
const lidoT = K.lerTitulos(tx.linhas, tx.prep.inicio, tx.prep.escolha, 'receber', 'cr');
igual([lidoT.titulos.length, lidoT.ignoradas.total], [12, 1], 'contas a receber: 12 títulos e a linha de total ignorada');
const px = abrir('escritorio-modelo-pagadores.xlsx', K.CAMPOS_PAGADORES);
igual([px.prep.escolha.nome, px.prep.escolha.cliente, px.prep.escolha.processo], [2, 0, 1], 'pagadores: acha Nome do pagador, Cliente e Processo');
const lidoP = K.lerPagadores(px.linhas, px.prep.inicio, px.prep.escolha);
igual(lidoP.pagadores.length, 5, 'pagadores: 5 lidos');
igual(C.faltando({ vencimento: 0, valor: 1, cliente: -1 }, K.CAMPOS_TITULOS).map(c => c.chave), ['cliente'], 'Cliente é obrigatório');
igual(K.faltandoExtrato({ data: 0, historico: 1, valor: -1, credito: -1, debito: -1 }), ['Valor (ou Crédito e Débito)'], 'extrato sem valor é bloqueado');
igual(K.lerExtrato(ex.linhas, ex.prep.inicio, Object.assign({}, ex.prep.escolha, { historico: -1 }), 'x').lancamentos.length, 0, 'sem histórico não lê');
// crédito e débito em colunas separadas e coluna C/D
{
  const l = [['Data', 'Descrição', 'Crédito', 'Débito'], ['01/11/2026', 'PIX A', '10,00', ''], ['02/11/2026', 'PAGTO', '', '5,00']];
  const p = K.preparar(l, K.CAMPOS_EXTRATO);
  igual(K.lerExtrato(l, p.inicio, p.escolha, 'c').lancamentos.map(x => x.valor), [10, -5], 'colunas Crédito e Débito');
  const l2 = [['Data', 'Histórico', 'Valor', 'C/D'], ['01/11/2026', 'PIX A', '10,00', 'C'], ['02/11/2026', 'PAGTO', '5,00', 'D']];
  const p2 = K.preparar(l2, K.CAMPOS_EXTRATO);
  igual(K.lerExtrato(l2, p2.inicio, p2.escolha, 'c').lancamentos.map(x => x.valor), [10, -5], 'coluna C/D dá o sinal');
}
// OFX
const ofx = K.lerOFX(fs.readFileSync(path.join(pasta, 'escritorio-modelo-extrato-nov-2026.ofx'), 'utf8'), 'extrato.ofx');
igual(ofx.lancamentos.length, 12, 'OFX: 12 lançamentos');
igual([ofx.lancamentos[1].historico, ofx.lancamentos[1].valor, ofx.lancamentos[1].data], ['TED 341 MARIA APARECID SOUZ', 1200, '2026-11-06'], 'OFX: histórico, valor e data');
verdade(K.pareceOFX('OFXHEADER:100'), 'reconhece OFX');

// ---------- resultado completo do exemplo ----------
const G = require('./gerar_exemplos_conciliar.js');
const emp = K.novaEmpresa('Escritório Modelo Advocacia');
emp.pagadores = lidoP.pagadores;
const res = K.conciliar(lidoEx.lancamentos, lidoT.titulos, emp, {});
const porHist = {};
res.itens.forEach(i => { porHist[i.lanc.historico] = i; });
G.ESPERADO.forEach(e => igual(porHist[e.hist] && porHist[e.hist].status, e.status, 'exemplo: ' + e.hist));
igual(porHist['PIX RECEBIDO FERNANDA P QUEIROZ'].sugestao.titulos.map(t => t.parcela), ['10/12', '11/12'], 'exemplo: 2 parcelas juntas');
igual(porHist['PIX RECEBIDO METALURGICA FERRAZ'].sugestao.titulos[0].parcela, '2/4', 'exemplo: parte devedora fica com a 2/4');
igual([res.totais.conciliados, res.totais.conferir, res.totais.semPar, res.totais.abertos, res.saidasFora], [5, 3, 2, 6, 2], 'exemplo: totais');
// mesmo resultado com o OFX
const resOfx = K.conciliar(ofx.lancamentos, lidoT.titulos, emp, {});
igual([resOfx.totais.conciliados, resOfx.totais.conferir, resOfx.totais.semPar], [5, 3, 2], 'exemplo pelo OFX: mesmos totais');

// ---------- aprender ----------
const itJ = porHist['PIX RECEBIDO J SILVA ADV'];
igual(K.sugerirRegra(itJ.lanc, itJ.sugestao), 'J SILVA', 'Aprender sugere o pedaço que identificou');
const itDep = porHist['DEP JUDICIAL TJSP 0001234'];
igual(K.sugerirRegra(itDep.lanc, itDep.sugestao), '0001234', 'Aprender sugere o número do processo');
const itDoc = porHist['DOC RECEBIDO'];
igual(K.sugerirRegra(itDoc.lanc, null), 'DOC RECEBIDO', 'sem pedaço de nome, sugere o histórico sem números');

// ---------- Excel ----------
const abas = K.planilhaResultado(res, emp.nome);
igual(abas.map(a => a.nome), ['Baixas', 'A conferir', 'Sem par no extrato', 'Títulos ainda em aberto'], 'Excel com as abas certas');
igual(abas[0].linhas[0].slice(0, 6), ['Data do crédito', 'Valor do crédito', 'Cliente', 'Título / processo', 'Parcela', 'Vencimento'], 'aba Baixas: colunas para dar baixa');
igual(abas[0].linhas.filter(l => l.length > 2).length - 1, 6, 'Baixas: 6 linhas (5 créditos, um deles com 2 títulos)');
igual(abas[1].linhas.length - 1, 3, 'A conferir: 3 linhas');
igual(abas[2].linhas.length - 1, 2, 'Sem par: 2 linhas');
igual(abas[3].linhas.length - 1, 6, 'Títulos em aberto: 6');
verdade(abas[3].linhas.some(l => /^Provável/.test(l[6] || '')), 'título com sugestão provável aparece marcado');
verdade(/baixa no sistema/.test(abas[0].linhas[abas[0].linhas.length - 1][0]), 'nota: a baixa é feita pela pessoa');
{
  const livro = XLSX.utils.book_new();
  abas.forEach(a => XLSX.utils.book_append_sheet(livro, XLSX.utils.aoa_to_sheet(a.linhas), a.nome));
  const volta = XLSX.read(XLSX.write(livro, { type: 'array', bookType: 'xlsx' }), { type: 'array' });
  igual(volta.SheetNames, ['Baixas', 'A conferir', 'Sem par no extrato', 'Títulos ainda em aberto'], 'o Excel abre de volta');
}

// ---------- estado, backup e regras ----------
{
  const est = K.novoEstado();
  const e = K.novaEmpresa('Escritório');
  e.pagadores.push(K.novoPagador({ nome: 'Joaquim Silva', processo: '123456', papel: 'Advogado da parte' }));
  e.regras.push(K.novaRegra({ texto: 'doc recebido', cliente: 'Clínica' }));
  est.empresas.push(e); est.selecionada = e.id;
  const volta = K.lerBackup(JSON.parse(JSON.stringify(K.criarBackup(est))));
  igual([volta.empresas.length, volta.empresas[0].pagadores.length, volta.empresas[0].regras[0].texto, volta.selecionada], [1, 1, 'DOC RECEBIDO', e.id], 'backup vai e volta');
  let erro = '';
  try { K.lerBackup({ qualquer: 1 }); } catch (x) { erro = x.message; }
  verdade(/não é um backup/.test(erro), 'arquivo estranho não restaura');
  const exp = K.exportarRegras(e);
  igual(exp.ferramenta, 'conciliacao-regras', 'exportar regras marca o tipo');
  const outra = K.novaEmpresa('Outra');
  igual(K.importarRegras(outra, exp), { pagadores: 1, regras: 1, repetidos: 0 }, 'importar regras numa empresa');
  igual(K.importarRegras(outra, exp), { pagadores: 0, regras: 0, repetidos: 2 }, 'importar de novo não duplica');
  igual(K.normalizarOpcoes({ tolerancia: 'abc', diasAntes: -3 }), K.OPCOES_PADRAO, 'opções ruins voltam ao padrão');
  igual(K.novoPagador({ nome: 'Fulano' }), null, 'pagador precisa de cliente ou processo');
}

// ---------- sem travessão nos arquivos da ferramenta ----------
['conciliar.html', 'conciliar-logica.js', 'conciliar-app.js', 'conciliar.css', 'testes/testar_conciliar.js', 'testes/gerar_exemplos_conciliar.js', 'exemplos/conciliar/resultados-esperados.txt'].forEach(f => {
  const t = fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  igual(TRAVESSAO.test(t), false, 'sem travessão em ' + f);
});
verdade(!abas.some(a => a.linhas.some(l => l.some(c => TRAVESSAO.test(String(c))))), 'sem travessão no Excel');
verdade(!res.itens.some(i => TRAVESSAO.test(i.motivo)), 'sem travessão nos motivos');

console.log('\n' + ok + ' verificações ok, ' + falhou + ' falharam.');
process.exit(falhou ? 1 : 0);

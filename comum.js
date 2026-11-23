/* Ferramentas do BPO, base comum (sem tela).
   Lê planilhas de qualquer sistema (Excel, CSV), acha o cabeçalho, descobre as colunas
   e entende números e datas no formato brasileiro.
   Funciona no navegador (window.Comum) e no Node (require), para os testes. */
(function (raiz, fabrica) {
  if (typeof module === 'object' && module.exports) module.exports = fabrica();
  else raiz.Comum = fabrica();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- texto ----------
  function simples(t) {
    return String(t == null ? '' : t)
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/ /g, ' ')
      .toLowerCase().replace(/[^a-z0-9%$/().,\- ]+/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function vazio(v) { return v == null || (typeof v === 'string' && v.trim() === ''); }

  // ---------- números ----------
  // Aceita 1.234,56  R$ 1.234,56  -1.234,56  (1.234,56)  1.234,56-  1.234,56 D  1,234.56  1234.5
  function valor(v) {
    if (typeof v === 'number') return isFinite(v) ? arred(v) : null;
    if (vazio(v)) return null;
    var s = String(v).replace(/ /g, ' ').trim();
    var neg = false;
    if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
    s = s.replace(/r\$/i, '').trim();
    var fim = s.match(/\s*([DC])$/i);
    if (fim) { if (fim[1].toUpperCase() === 'D') neg = !neg; s = s.slice(0, fim.index); }
    if (/-$/.test(s)) { neg = !neg; s = s.slice(0, -1); }
    if (/^-/.test(s)) { neg = !neg; s = s.slice(1); }
    if (/^\+/.test(s)) s = s.slice(1);
    s = s.replace(/\s/g, '');
    if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
    var temV = s.indexOf(',') >= 0, temP = s.indexOf('.') >= 0;
    if (temV && temP) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (temV) {
      if (/^\d{1,3}(,\d{3}){2,}$/.test(s)) s = s.replace(/,/g, '');
      else s = s.replace(',', '.');
    } else if (temP) {
      if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
    }
    var n = Number(s);
    if (!isFinite(n)) return null;
    return arred(neg ? -n : n);
  }
  function arred(n) { return Math.round(n * 100) / 100; }

  // ---------- datas (sempre texto AAAA-MM-DD, sem fuso) ----------
  function dois(n) { return (n < 10 ? '0' : '') + n; }
  function dataValida(a, m, d) {
    if (a < 1990 || a > 2100 || m < 1 || m > 12 || d < 1) return false;
    return d <= new Date(Date.UTC(a, m, 0)).getUTCDate();
  }
  function montaData(a, m, d) { return dataValida(a, m, d) ? a + '-' + dois(m) + '-' + dois(d) : null; }
  function serialParaData(n) {
    // número de série do Excel (1900), 25569 = 01/01/1970
    if (n < 20000 || n > 80000) return null; // fora disso não é data de movimento
    // alguns programas gravam 23:59:3x do dia anterior (fuso do Brasil): arredonda para o dia certo
    var dia = (n % 1) > 0.999 ? Math.ceil(n) : Math.floor(n);
    var ms = Math.round((dia - 25569) * 86400000);
    var dt = new Date(ms);
    return montaData(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
  }
  var MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  function data(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return isNaN(v) ? null : montaData(v.getFullYear(), v.getMonth() + 1, v.getDate());
    if (typeof v === 'number') return serialParaData(v);
    var s = String(v).trim();
    var m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return montaData(+m[1], +m[2], +m[3]);
    if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})(?:\D|$)/))) {
      var a = +m[3]; if (m[3].length === 2) a += 2000;
      return montaData(a, +m[2], +m[1]);
    }
    if ((m = s.match(/^(\d{1,2})[\/\- ]([a-zç]{3})[a-zç]*\.?[\/\- ](\d{2,4})$/i))) {
      var mes = MESES.indexOf(simples(m[2]).slice(0, 3)) + 1;
      var a2 = +m[3]; if (m[3].length === 2) a2 += 2000;
      return mes ? montaData(a2, mes, +m[1]) : null;
    }
    if (/^\d{5}(\.\d+)?$/.test(s)) return serialParaData(Number(s));
    return null;
  }
  function mesDe(iso) { return iso ? iso.slice(0, 7) : null; }
  var NOMES_MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  function mesCurto(mes) { var p = mes.split('-'); return MESES[+p[1] - 1] + '/' + p[0].slice(2); }
  function mesLongo(mes) { var p = mes.split('-'); return NOMES_MES[+p[1] - 1] + ' de ' + p[0]; }
  function dataBR(iso) { if (!iso) return ''; var p = iso.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  function mesAnterior(mes) {
    var p = mes.split('-'), a = +p[0], m = +p[1] - 1;
    if (m === 0) { m = 12; a--; }
    return a + '-' + dois(m);
  }

  // ---------- formatação ----------
  function brl(v) {
    if (v == null || !isFinite(v)) return '';
    var neg = v < 0, n = Math.abs(arred(v));
    var partes = n.toFixed(2).split('.');
    partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '-' : '') + 'R$ ' + partes[0] + ',' + partes[1];
  }
  function num(v, casas) {
    if (v == null || !isFinite(v)) return '';
    casas = casas || 0;
    var partes = Math.abs(v).toFixed(casas).split('.');
    partes[0] = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (v < 0 ? '-' : '') + partes[0] + (casas ? ',' + partes[1] : '');
  }
  function pct(v, casas) {
    if (v == null || !isFinite(v)) return '';
    return num(v * 100, casas == null ? 1 : casas) + '%';
  }

  // ---------- CSV ----------
  function separadorProvavel(texto) {
    var linhas = texto.split(/\r?\n/).filter(function (l) { return l.trim(); }).slice(0, 15);
    var melhor = ';', nota = -1;
    [';', ',', '\t', '|'].forEach(function (sep) {
      var contagens = linhas.map(function (l) { return dividirCSV(l, sep).length; });
      var max = Math.max.apply(null, contagens.concat([0]));
      var iguais = contagens.filter(function (c) { return c === max; }).length;
      var n = max > 1 ? iguais * 10 + max : 0;
      if (n > nota) { nota = n; melhor = sep; }
    });
    return melhor;
  }
  function dividirCSV(linha, sep) {
    var out = [], atual = '', aspas = false;
    for (var i = 0; i < linha.length; i++) {
      var c = linha[i];
      if (aspas) {
        if (c === '"') { if (linha[i + 1] === '"') { atual += '"'; i++; } else aspas = false; }
        else atual += c;
      } else if (c === '"') aspas = true;
      else if (c === sep) { out.push(atual); atual = ''; }
      else atual += c;
    }
    out.push(atual);
    return out;
  }
  function lerCSV(texto) {
    texto = texto.replace(/^﻿/, '');
    var sep = separadorProvavel(texto);
    // junta linhas quebradas dentro de aspas
    var linhas = [], buf = '', abertas = false;
    texto.split(/\r?\n/).forEach(function (l) {
      buf = abertas ? buf + '\n' + l : l;
      var q = (buf.match(/"/g) || []).length;
      abertas = q % 2 === 1;
      if (!abertas) { linhas.push(buf); buf = ''; }
    });
    if (buf) linhas.push(buf);
    return linhas.filter(function (l) { return l.trim(); }).map(function (l) {
      return dividirCSV(l, sep).map(function (c) { return c.trim(); });
    });
  }
  function decodificar(bytes) {
    // tenta UTF-8; se tiver erro, é o padrão do Windows (acentos de sistema antigo)
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch (e) { return new TextDecoder('windows-1252').decode(bytes); }
  }

  // ---------- planilha (precisa do XLSX: SheetJS) ----------
  // Devolve [{nome, linhas}] onde linhas é uma lista de listas (valor cru: número ou texto).
  function lerPlanilha(XLSX, bytes, nomeArquivo) {
    var ext = String(nomeArquivo || '').toLowerCase().split('.').pop();
    if (ext === 'csv' || ext === 'txt') {
      return [{ nome: 'CSV', linhas: lerCSV(decodificar(bytes)) }];
    }
    var livro = XLSX.read(bytes, { type: 'array', cellDates: false, cellNF: true, raw: false });
    return livro.SheetNames.map(function (nome) {
      var folha = livro.Sheets[nome];
      var linhas = XLSX.utils.sheet_to_json(folha, { header: 1, raw: true, defval: '', blankrows: false });
      // células de data viram texto dd/mm/aaaa (o Excel guarda data como número)
      if (folha['!ref']) {
        var area = XLSX.utils.decode_range(folha['!ref']);
        for (var r = area.s.r; r <= area.e.r; r++) {
          for (var c = area.s.c; c <= area.e.c; c++) {
            var cel = folha[XLSX.utils.encode_cell({ r: r, c: c })];
            if (cel && cel.t === 'n' && cel.z && XLSX.SSF.is_date(cel.z)) {
              cel._iso = serialParaData(cel.v);
            }
          }
        }
        // refaz as linhas trocando datas
        linhas = [];
        for (var r2 = area.s.r; r2 <= area.e.r; r2++) {
          var linha = [], temAlgo = false;
          for (var c2 = area.s.c; c2 <= area.e.c; c2++) {
            var cel2 = folha[XLSX.utils.encode_cell({ r: r2, c: c2 })];
            var v = '';
            if (cel2) {
              if (cel2._iso) v = cel2._iso;
              else if (cel2.t === 'n' || cel2.t === 'b') v = cel2.v;
              else if (cel2.t === 'd') v = data(cel2.v) || '';
              else if (cel2.v != null) v = String(cel2.v).trim();
            }
            if (v !== '') temAlgo = true;
            linha.push(v);
          }
          if (temAlgo) linhas.push(linha);
        }
      }
      return { nome: nome, linhas: linhas };
    }).filter(function (a) { return a.linhas.length; });
  }

  // ---------- cabeçalho e colunas ----------
  // campos: [{chave, rotulo, obrigatorio, sinonimos:[...], evitar:[...]}]
  function notaColuna(nomeColuna, campo) {
    var c = simples(nomeColuna);
    if (!c) return 0;
    var melhor = 0;
    (campo.sinonimos || []).forEach(function (s) {
      var sn = simples(s);
      if (!sn) return;
      var n = 0;
      if (c === sn) n = 100;
      else if (c.indexOf(sn) === 0) n = 70 + Math.min(sn.length, 20);
      else if ((' ' + c + ' ').indexOf(' ' + sn + ' ') >= 0) n = 60 + Math.min(sn.length, 20);
      else if (sn.length >= 4 && c.indexOf(sn) >= 0) n = 40 + Math.min(sn.length, 20);
      if (n > melhor) melhor = n;
    });
    (campo.evitar || []).forEach(function (e) { if (c.indexOf(simples(e)) >= 0) melhor = Math.min(melhor, 5); });
    return melhor;
  }
  function acharCabecalho(linhas, campos) {
    var limite = Math.min(linhas.length, 40), melhorLinha = 0, melhorNota = -1;
    for (var i = 0; i < limite; i++) {
      var textos = linhas[i].filter(function (v) { return typeof v === 'string' && v.trim() && valor(v) == null && !data(v); });
      if (textos.length < 2) continue;
      var nota = 0;
      campos.forEach(function (campo) {
        var m = 0;
        linhas[i].forEach(function (v) { m = Math.max(m, notaColuna(v, campo)); });
        if (m >= 40) nota += m + (campo.obrigatorio ? 50 : 0);
      });
      nota += textos.length; // desempate: linha com mais títulos
      if (nota > melhorNota) { melhorNota = nota; melhorLinha = i; }
    }
    return melhorLinha;
  }
  // Escolhe a melhor coluna para cada campo, sem repetir coluna.
  function detectarColunas(cabecalho, campos) {
    var pares = [];
    campos.forEach(function (campo) {
      cabecalho.forEach(function (nome, i) {
        var n = notaColuna(nome, campo);
        if (n >= 40) pares.push({ chave: campo.chave, i: i, n: n });
      });
    });
    pares.sort(function (a, b) { return b.n - a.n; });
    var escolha = {}, usadas = {};
    pares.forEach(function (p) {
      if (escolha[p.chave] != null || usadas[p.i]) return;
      escolha[p.chave] = p.i; usadas[p.i] = true;
    });
    campos.forEach(function (c) { if (escolha[c.chave] == null) escolha[c.chave] = -1; });
    return escolha;
  }
  function faltando(escolha, campos) {
    return campos.filter(function (c) { return c.obrigatorio && (escolha[c.chave] == null || escolha[c.chave] < 0); });
  }
  // Monta a tabela pronta: lista de objetos {chave: valor cru} a partir da linha do cabeçalho.
  function linhasComCampos(linhas, inicioCabecalho, escolha) {
    var out = [];
    for (var i = inicioCabecalho + 1; i < linhas.length; i++) {
      var l = linhas[i], o = { _linha: i + 1 }, algo = false;
      Object.keys(escolha).forEach(function (k) {
        var idx = escolha[k];
        o[k] = idx >= 0 ? l[idx] : '';
        if (idx >= 0 && !vazio(l[idx])) algo = true;
      });
      if (algo) out.push(o);
    }
    return out;
  }
  // Linhas de total e subtotal que os sistemas colocam no fim da tabela
  function pareceTotal(linha) {
    return linha.some(function (v) {
      var s = simples(v);
      return /^(sub ?)?total( geral| do periodo| do mes| de lancamentos| dos lancamentos)?$/.test(s) || /^saldo (anterior|inicial|final|do dia)$/.test(s) || s === 'totais';
    });
  }

  // ---------- grava no navegador com segurança ----------
  function guardar(chave, obj) {
    try { localStorage.setItem(chave, JSON.stringify(obj)); return true; } catch (e) { return false; }
  }
  function recuperar(chave, padrao) {
    try { var t = localStorage.getItem(chave); return t ? JSON.parse(t) : padrao; } catch (e) { return padrao; }
  }

  function id() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function soma(lista, fn) { return arred(lista.reduce(function (s, x) { return s + (fn ? fn(x) : x) || s; }, 0)); }

  return {
    simples: simples, vazio: vazio, valor: valor, arred: arred,
    data: data, mesDe: mesDe, mesCurto: mesCurto, mesLongo: mesLongo, dataBR: dataBR, mesAnterior: mesAnterior,
    brl: brl, num: num, pct: pct,
    lerCSV: lerCSV, decodificar: decodificar, lerPlanilha: lerPlanilha,
    notaColuna: notaColuna, acharCabecalho: acharCabecalho, detectarColunas: detectarColunas,
    faltando: faltando, linhasComCampos: linhasComCampos, pareceTotal: pareceTotal,
    guardar: guardar, recuperar: recuperar, id: id, soma: soma
  };
});

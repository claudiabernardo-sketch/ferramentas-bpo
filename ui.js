/* Ferramentas do BPO, peças de tela comuns. Precisa de comum.js e vendor/xlsx.full.min.js antes. */
(function () {
  'use strict';
  var C = window.Comum;

  function el(tag, attrs, filhos) {
    var e = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'texto') e.textContent = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null && attrs[k] !== false) e.setAttribute(k, attrs[k]);
    });
    (filhos || []).forEach(function (f) { if (f != null) e.appendChild(typeof f === 'string' ? document.createTextNode(f) : f); });
    return e;
  }
  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // ---------- aviso rápido no rodapé ----------
  var timer;
  function avisar(texto, tipo) {
    var t = document.getElementById('aviso-rapido');
    if (!t) { t = el('div', { id: 'aviso-rapido', role: 'status' }); document.body.appendChild(t); }
    t.textContent = texto;
    t.className = 'aviso-rapido ' + (tipo || '');
    t.hidden = false;
    clearTimeout(timer);
    timer = setTimeout(function () { t.hidden = true; }, tipo === 'erro' ? 7000 : 3500);
  }

  // ---------- ler arquivo ----------
  function lerArquivo(arquivo) {
    return new Promise(function (ok, falha) {
      var leitor = new FileReader();
      leitor.onload = function () {
        try { ok(C.lerPlanilha(window.XLSX, new Uint8Array(leitor.result), arquivo.name)); }
        catch (e) { falha(new Error('Não consegui abrir "' + arquivo.name + '". Ele é mesmo Excel (.xlsx ou .xls) ou CSV? Se veio em PDF, exporte de novo em Excel.')); }
      };
      leitor.onerror = function () { falha(new Error('Não consegui ler o arquivo.')); };
      leitor.readAsArrayBuffer(arquivo);
    });
  }

  // Área de arrastar e soltar. aoReceber(listaDeArquivos)
  function areaArquivo(opcoes) {
    var input = el('input', { type: 'file', accept: opcoes.aceita || '.xlsx,.xls,.csv,.txt', hidden: true });
    if (opcoes.varios) input.multiple = true;
    var area = el('label', { class: 'area-arquivo', tabindex: '0' }, [
      el('span', { class: 'area-icone', 'aria-hidden': 'true', texto: '⬆' }),
      el('b', { texto: opcoes.titulo || 'Arraste a planilha aqui' }),
      el('span', { class: 'area-dica', texto: opcoes.dica || 'ou clique para escolher. Excel (.xlsx, .xls) ou CSV.' }),
      input
    ]);
    function entregar(lista) {
      var arqs = Array.prototype.slice.call(lista || []);
      if (arqs.length) opcoes.aoReceber(opcoes.varios ? arqs : [arqs[0]]);
    }
    input.addEventListener('change', function () { entregar(input.files); input.value = ''; });
    area.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
    ['dragenter', 'dragover'].forEach(function (ev) {
      area.addEventListener(ev, function (e) { e.preventDefault(); area.classList.add('arrastando'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      area.addEventListener(ev, function (e) { e.preventDefault(); area.classList.remove('arrastando'); });
    });
    area.addEventListener('drop', function (e) { entregar(e.dataTransfer.files); });
    return area;
  }

  // ---------- escolher as colunas ----------
  // Mostra um seletor por campo, já com o palpite. aoMudar(escolha) a cada mudança.
  function mapeador(alvo, cabecalho, campos, escolha, linhasExemplo, aoMudar) {
    alvo.innerHTML = '';
    var grade = el('div', { class: 'mapa-colunas' });
    campos.forEach(function (campo) {
      var sel = el('select', { 'aria-label': campo.rotulo });
      sel.appendChild(el('option', { value: '-1', texto: campo.obrigatorio ? 'Escolha a coluna' : '(não tem)' }));
      cabecalho.forEach(function (nome, i) {
        var ex = '';
        for (var k = 0; k < (linhasExemplo || []).length && !ex; k++) {
          var v = linhasExemplo[k][i];
          if (!C.vazio(v)) ex = String(v).slice(0, 24);
        }
        var rot = (String(nome).trim() || 'Coluna ' + (i + 1)) + (ex ? '  (ex.: ' + ex + ')' : '');
        sel.appendChild(el('option', { value: String(i), texto: rot }));
      });
      sel.value = String(escolha[campo.chave] == null ? -1 : escolha[campo.chave]);
      var bloco = el('label', { class: 'campo-mapa' + (campo.obrigatorio && sel.value === '-1' ? ' falta' : '') }, [
        el('span', { class: 'campo-nome' }, [campo.rotulo, campo.obrigatorio ? el('i', { texto: ' obrigatória' }) : null]),
        sel,
        campo.ajuda ? el('small', { texto: campo.ajuda }) : null
      ]);
      sel.addEventListener('change', function () {
        escolha[campo.chave] = Number(sel.value);
        bloco.classList.toggle('falta', !!campo.obrigatorio && sel.value === '-1');
        aoMudar(escolha);
      });
      grade.appendChild(bloco);
    });
    alvo.appendChild(grade);
  }

  // ---------- gráficos simples em SVG ----------
  // Barras verticais agrupadas. dados: {categorias:[...], series:[{nome, cor, valores:[...]}]}
  function graficoBarras(dados, opcoes) {
    opcoes = opcoes || {};
    var L = 640, A = opcoes.altura || 260, mE = 70, mD = 10, mT = 14, mB = 34;
    var todos = [];
    dados.series.forEach(function (s) { todos = todos.concat(s.valores); });
    var max = Math.max.apply(null, todos.concat([0])), min = Math.min.apply(null, todos.concat([0]));
    if (max === min) max = min + 1;
    var passo = escala(max - min);
    max = Math.ceil(max / passo) * passo; min = Math.floor(min / passo) * passo;
    var y = function (v) { return mT + (max - v) / (max - min) * (A - mT - mB); };
    var n = dados.categorias.length, largGrupo = (L - mE - mD) / Math.max(n, 1);
    var ns = dados.series.length, largBarra = Math.min(34, (largGrupo * 0.72) / ns);
    var s = '<svg viewBox="0 0 ' + L + ' ' + A + '" class="grafico" role="img" aria-label="' + esc(opcoes.titulo || 'Gráfico') + '">';
    for (var v = min; v <= max + 1e-9; v += passo) {
      s += '<line x1="' + mE + '" x2="' + (L - mD) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="g-linha' + (Math.abs(v) < 1e-9 ? ' g-zero' : '') + '"/>';
      s += '<text x="' + (mE - 8) + '" y="' + (y(v) + 4) + '" class="g-eixo" text-anchor="end">' + esc(curto(v)) + '</text>';
    }
    dados.categorias.forEach(function (cat, i) {
      var x0 = mE + i * largGrupo + (largGrupo - largBarra * ns) / 2;
      dados.series.forEach(function (serie, j) {
        var val = serie.valores[i] || 0, y1 = y(Math.max(val, 0)), y2 = y(Math.min(val, 0));
        s += '<rect x="' + (x0 + j * largBarra) + '" y="' + y1 + '" width="' + (largBarra - 2) + '" height="' + Math.max(y2 - y1, 0.5) + '" rx="3" fill="' + serie.cor + '"><title>' + esc(serie.nome + ' ' + cat + ': ' + C.brl(val)) + '</title></rect>';
      });
      s += '<text x="' + (mE + i * largGrupo + largGrupo / 2) + '" y="' + (A - 12) + '" class="g-eixo" text-anchor="middle">' + esc(cat) + '</text>';
    });
    s += '</svg>';
    var leg = '<div class="legenda">' + dados.series.map(function (x) {
      return '<span><i style="background:' + x.cor + '"></i>' + esc(x.nome) + '</span>';
    }).join('') + '</div>';
    return (dados.series.length > 1 ? leg : '') + s;
  }
  // Barras horizontais com rótulo e valor (para "para onde vai o dinheiro")
  function barrasHorizontais(itens, cor) {
    var max = Math.max.apply(null, itens.map(function (i) { return Math.abs(i.valor); }).concat([1]));
    return '<div class="barras-h">' + itens.map(function (i) {
      var p = Math.abs(i.valor) / max * 100;
      return '<div class="bh"><span class="bh-nome">' + esc(i.nome) + '</span><span class="bh-trilho"><span style="width:' + p.toFixed(1) + '%;background:' + (i.cor || cor) + '"></span></span><span class="bh-valor">' + esc(i.texto || C.brl(i.valor)) + '</span></div>';
    }).join('') + '</div>';
  }
  function escala(faixa) {
    var bruto = faixa / 5, pot = Math.pow(10, Math.floor(Math.log10(bruto)));
    var f = bruto / pot;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * pot;
  }
  function curto(v) {
    var a = Math.abs(v);
    if (a >= 1e6) return C.num(v / 1e6, a % 1e6 ? 1 : 0) + ' mi';
    if (a >= 1e3) return C.num(v / 1e3, a % 1e3 ? 1 : 0) + ' mil';
    return C.num(v, 0);
  }

  // ---------- baixar arquivos ----------
  function baixar(nome, conteudo, tipo) {
    var blob = conteudo instanceof Blob ? conteudo : new Blob([conteudo], { type: tipo || 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = el('a', { href: url, download: nome });
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  // abas: [{nome, linhas:[[...]], larguras:[...], formatoMoeda:[índices de coluna], formatoPct:[...]}]
  function baixarExcel(nome, abas) {
    var X = window.XLSX, livro = X.utils.book_new();
    abas.forEach(function (aba) {
      var folha = X.utils.aoa_to_sheet(aba.linhas);
      if (aba.larguras) folha['!cols'] = aba.larguras.map(function (w) { return { wch: w }; });
      var area = X.utils.decode_range(folha['!ref'] || 'A1');
      for (var r = 1; r <= area.e.r; r++) {
        (aba.formatoMoeda || []).forEach(function (c) { var cel = folha[X.utils.encode_cell({ r: r, c: c })]; if (cel && cel.t === 'n') cel.z = '#,##0.00;-#,##0.00'; });
        (aba.formatoPct || []).forEach(function (c) { var cel = folha[X.utils.encode_cell({ r: r, c: c })]; if (cel && cel.t === 'n') cel.z = '0.0%'; });
      }
      X.utils.book_append_sheet(livro, folha, aba.nome.slice(0, 31).replace(/[\\\/?*\[\]:]/g, ' '));
    });
    var bytes = X.write(livro, { type: 'array', bookType: 'xlsx' });
    baixar(nome, new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }
  function nomeArquivo(t) {
    return C.simples(t).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'arquivo';
  }
  // Lê um arquivo .json de backup
  function lerJSON(arquivo) {
    return new Promise(function (ok, falha) {
      var r = new FileReader();
      r.onload = function () { try { ok(JSON.parse(r.result)); } catch (e) { falha(new Error('Esse arquivo não é um backup válido.')); } };
      r.onerror = function () { falha(new Error('Não consegui ler o arquivo.')); };
      r.readAsText(arquivo);
    });
  }
  function escolherArquivo(aceita) {
    return new Promise(function (ok) {
      var i = el('input', { type: 'file', accept: aceita || '*' });
      i.addEventListener('change', function () { ok(i.files[0] || null); });
      i.click();
    });
  }
  // Lê imagem (logo) e devolve data URL reduzida (até 300px de largura)
  function lerLogo(arquivo) {
    return new Promise(function (ok, falha) {
      var r = new FileReader();
      r.onload = function () {
        var img = new Image();
        img.onload = function () {
          var esc2 = Math.min(1, 300 / img.width), c = document.createElement('canvas');
          c.width = Math.round(img.width * esc2); c.height = Math.round(img.height * esc2);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          ok(c.toDataURL('image/png'));
        };
        img.onerror = function () { falha(new Error('Não consegui abrir essa imagem.')); };
        img.src = r.result;
      };
      r.readAsDataURL(arquivo);
    });
  }
  // Testa se o navegador guarda os dados (modo anônimo ou bloqueado)
  function navegadorGuarda() {
    try { localStorage.setItem('_teste', '1'); localStorage.removeItem('_teste'); return true; } catch (e) { return false; }
  }

  window.UI = {
    el: el, esc: esc, avisar: avisar, lerArquivo: lerArquivo, areaArquivo: areaArquivo, mapeador: mapeador,
    graficoBarras: graficoBarras, barrasHorizontais: barrasHorizontais, baixar: baixar, baixarExcel: baixarExcel,
    nomeArquivo: nomeArquivo, lerJSON: lerJSON, escolherArquivo: escolherArquivo, lerLogo: lerLogo, navegadorGuarda: navegadorGuarda
  };
})();

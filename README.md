# Ferramentas do BPO

Três ferramentas para quem faz BPO Financeiro. Você exporta o relatório do sistema do cliente (Conta Azul, Nibo, Omie, o sistema da loja ou o banco), arrasta para a página e vê o resultado.

**Para usar, é só abrir:** https://claudiabernardo-sketch.github.io/ferramentas-bpo/

Não precisa instalar nada, nem criar conta, nem usar IA (não gasta tokens). Funciona no computador e no celular.

## As ferramentas

### DRE e painel do cliente
Monta a DRE gerencial a partir do relatório de lançamentos do sistema.
- Usa os nomes e as cores do cliente, e o modelo de DRE que ele aprovou.
- Você liga cada categoria do sistema a uma linha da DRE uma vez só. No mês seguinte ela já entra certa.
- Dá para copiar o modelo de um cliente para outro do mesmo ramo, por exemplo óticas que usam o mesmo sistema.
- Gera o **painel do cliente**: um arquivo para mandar por e-mail ou salvar em PDF no Google Drive.

### Monitor de volume
Conta os lançamentos de cada cliente por mês a partir dos extratos (Excel, CSV ou OFX do banco) ou do relatório do sistema.
- Junta com contas bancárias, funcionários e notas fiscais.
- Compara com o mês em que o preço atual foi combinado e avisa quando é hora de rever o preço.
- Usa tempos de referência que você ajusta pela sua metodologia.

### Vendas e margem
Cruza as vendas do sistema com as vendas da maquininha, dia a dia.
- Mostra o que não bate, inclusive venda lançada com a forma de pagamento errada.
- Calcula quanto sobrou depois do imposto, do custo da mercadoria (CMV) e das taxas de cartão.

Para conferir se o dinheiro da maquininha caiu no banco, use o [Concilia](https://github.com/claudiabernardo-sketch/concilia).

## Como a ferramenta lê o seu arquivo

Cada sistema dá um nome diferente para as colunas. A ferramenta reconhece os nomes mais comuns e mostra o que entendeu. **Confira as colunas antes de seguir.** Se ela não achar uma coluna obrigatória, ela para e pede para você escolher. Ela nunca adivinha.

Ela pula as linhas de título que os sistemas colocam antes da tabela e as linhas de total e de saldo. Entende valores no formato brasileiro (`1.234,56`, `R$ 1.234,56`, `(1.234,56)`).

Na pasta `exemplos` há arquivos fictícios para testar. Os nomes das colunas imitam os sistemas, mas **não são exportações oficiais**. Na primeira vez com um cliente de verdade, confira o resultado com um mês que você já conhece.

## Onde ficam os seus dados

**Só no navegador do seu computador.** Nada vai para servidor nenhum, nem para a Cláudia, nem para o GitHub. Por isso:

- Em outro computador ou navegador, as ferramentas começam vazias. Use **Salvar backup** e **Restaurar backup**.
- Se você limpar os dados do navegador, os cadastros somem. Salve backup de vez em quando.
- No modo anônimo nada fica guardado.

## Usar sem internet (opcional)

Peça ao Claude (aba Code) ou ao ChatGPT (modo Work), numa pasta vazia:

```
Baixe https://github.com/claudiabernardo-sketch/ferramentas-bpo para esta pasta e abra o index.html no navegador
```

## Para quem quer conferir o código

- `comum.js`: leitura de planilhas, números e datas, sem tela.
- `ui.js` e `estilo.css`: peças de tela comuns.
- `dre-logica.js`, `volume-logica.js`, `margem-logica.js`: as contas de cada ferramenta, sem tela.
- `testes/`: mais de 450 testes. Rode, por exemplo, `node testes/testar_dre.js`.
- `vendor/xlsx.full.min.js`: SheetJS Community Edition 0.18.5 (licença Apache 2.0, em `vendor/LICENSE-sheetjs.txt`), para ler Excel no navegador.

---

Feito por Cláudia Bernardo para o BPO Financeiro. Gratuito, licença MIT, distribuído sem garantia. A ferramenta faz a conta, você revisa: quem assina o relatório é o seu BPO.

Conta Azul, Nibo, Omie, Cielo, Stone e demais nomes citados são marcas de seus donos. Estas ferramentas não têm vínculo com eles.

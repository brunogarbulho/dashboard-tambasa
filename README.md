# Dashboard Logistico - Tambasa

Projeto front-end puro (HTML, CSS e JavaScript) para consumir 4 abas do Google Sheets via CSV e gerar dashboard de vendas x prazo.

## 1) Configurar a planilha

Edite `config.js` e preencha:

- `SPREADSHEET_ID`
- `SHEET_GIDS.listaRotas`
- `SHEET_GIDS.cidades`
- `SHEET_GIDS.vendas`
- `SHEET_GIDS.prazos`

A URL usada no projeto e:

`https://docs.google.com/spreadsheets/d/{SPREADSHEET_ID}/export?format=csv&gid={GID}`

## 2) Permissao da planilha

A planilha deve estar acessivel para leitura por link, senao o `fetch` vai falhar.

## 3) Executar localmente

Abra `index.html` com um servidor local (ex.: extensao Live Server no VS Code/Cursor).

## 4) O que ja esta implementado

- Filtro em cascata `Super Rota -> Rota`
- Filtro de `Cidade` dedicado ao painel de prazo
- KPI de impacto (`vendas x diferenca de dias`)
- Grafico combinado (vendas + diferenca de prazo)
- Grafico de prazo atual x ajustado
- Tabela executiva de impacto

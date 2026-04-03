export const SPREADSHEET_ID = "1MMbohYWvLusFzmBtSCGrVG4rL6UMrof_MPW5LyJYiNg";

export const SHEET_GIDS = {
  listaRotas: "1466143366",
  cidades: "1365931711",
  vendas: "1694939385",
  prazos: "1095410094",
};

export function getSheetCsvUrl(gid) {
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/export?format=csv&gid=${gid}`;
}

import * as xlsx from 'xlsx';
import * as fs from 'fs';
import { parse } from 'csv-parse/sync';

// 读取 CSV
const csvContent = fs.readFileSync('output/bonjour-zju-candidates-v2-2026-05-02.csv', 'utf-8');
const records = parse(csvContent, {
  columns: true,
  skip_empty_lines: true
});

// 创建工作簿
const workbook = xlsx.utils.book_new();

// 添加数据
const worksheetData: (string | number)[][] = [
  ['source_handle', 'display_name', 'headline', 'bio_preview', 'bonjour_url', 'person_id']
];

for (const row of records as Record<string, string>[]) {
  worksheetData.push([
    row.source_handle,
    row.display_name,
    row.headline,
    row.bio_preview,
    row.bonjour_url,
    row.person_id
  ]);
}

const worksheet = xlsx.utils.aoa_to_sheet(worksheetData);

// 设置列宽
worksheet['!cols'] = [
  { wch: 15 },  // source_handle
  { wch: 20 },  // display_name
  { wch: 40 },  // headline
  { wch: 60 },  // bio_preview
  { wch: 30 },  // bonjour_url
  { wch: 40 }   // person_id
];

xlsx.utils.book_append_sheet(workbook, worksheet, 'ZJU Candidates');

// 写入文件
xlsx.writeFile(workbook, 'output/bonjour-zju-candidates-v2-2026-05-02.xlsx');

console.log(`Created Excel with ${records.length} rows`);

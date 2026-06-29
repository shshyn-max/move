import express from 'express';
import cors from 'cors';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const FILE_PATH = path.join(__dirname, '임장 체크리스트.md');

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname)); // 루트의 self-contained index.html 서빙

// ─────────────────────────────────────────────────────────────
// 기본 데이터 (파일이 없거나 비어 있을 때 시드로 사용)
// ─────────────────────────────────────────────────────────────
const DEFAULT_APARTMENTS = [
  '라비엔오 404동 2층',
  '르센토 506동 7층',
  '벨라르테 604동 14층',
];

const DEFAULT_ITEMS = [
  '지하철 편의성',
  '도로소음',
  '커뮤니티 편의',
  '조망',
  '지하주차장 접근성',
  '아파트 주변 관리상태',
  '채광/일조권',
  '누수/결로(곰팡이)',
  '수압/배수',
  '층간소음',
  '로열동 여부',
  '매도 사유',
  '싼/비싼 이유',
  '등기상 이슈',
];

// 순위 → 점수
const SCORE = { 1: 10, 2: 5, 3: 3 };

// ─────────────────────────────────────────────────────────────
// 셀 파싱/직렬화 : "1순위 (소음 적음)" ↔ { rank: 1, note: '소음 적음' }
// ─────────────────────────────────────────────────────────────
function parseCell(text) {
  const t = (text || '').trim();
  const m = t.match(/([123])\s*순위/);
  let rank = m ? Number(m[1]) : null;
  let note = m ? t.replace(m[0], '').trim() : t;
  note = note.replace(/^\(/, '').replace(/\)$/, '').trim();
  return { rank, note };
}

function formatCell({ rank, note }) {
  const parts = [];
  if (rank) parts.push(`${rank}순위`);
  if (note && note.trim()) parts.push(rank ? `(${note.trim()})` : note.trim());
  return parts.join(' ');
}

// ─────────────────────────────────────────────────────────────
// 마크다운 테이블 한 개 파싱
// ─────────────────────────────────────────────────────────────
function parseTable(section) {
  const lines = section
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('|') && l.endsWith('|'));
  if (lines.length < 2) return null;

  const header = lines[0];
  const apartments = header
    .split('|')
    .slice(2, -1)
    .map((c) => c.trim())
    .filter(Boolean);

  const items = [];
  const data = {};

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\|[\s\-|]+\|$/.test(line)) continue; // 구분선
    const cols = line.split('|').map((c) => c.trim());
    const item = cols[1];
    if (!item) continue;
    items.push(item);
    data[item] = {};
    apartments.forEach((apt, j) => {
      data[item][apt] = parseCell(cols[j + 2] || '');
    });
  }
  return { apartments, items, data };
}

function buildTable(apartments, items, data) {
  let out = `| 체크리스트 | ${apartments.join(' | ')} |\n`;
  out += `| --- | ${apartments.map(() => '---').join(' | ')} |\n`;
  for (const item of items) {
    const cells = apartments.map((apt) =>
      formatCell(data?.[item]?.[apt] || { rank: null, note: '' })
    );
    out += `| ${item} | ${cells.join(' | ')} |\n`;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// 점수 계산
// ─────────────────────────────────────────────────────────────
function calcScores(apartments, items, husband, wife) {
  const result = {};
  apartments.forEach((apt) => (result[apt] = { husband: 0, wife: 0, total: 0 }));
  items.forEach((item) => {
    apartments.forEach((apt) => {
      const h = SCORE[husband?.[item]?.[apt]?.rank] || 0;
      const w = SCORE[wife?.[item]?.[apt]?.rank] || 0;
      result[apt].husband += h;
      result[apt].wife += w;
      result[apt].total += h + w;
    });
  });
  return result;
}

function buildScoreTable(apartments, scores) {
  const sorted = [...apartments].sort((a, b) => scores[b].total - scores[a].total);
  let out = `| 아파트 | 남편 | 아내 | 합계 |\n| --- | --- | --- | --- |\n`;
  sorted.forEach((apt) => {
    const s = scores[apt];
    out += `| ${apt} | ${s.husband} | ${s.wife} | **${s.total}** |\n`;
  });
  return out;
}

// ─────────────────────────────────────────────────────────────
// 파일 전체 직렬화
// ─────────────────────────────────────────────────────────────
function buildMarkdown(apartments, items, husband, wife) {
  const scores = calcScores(apartments, items, husband, wife);
  return [
    '# 🏡 임장 체크리스트',
    '',
    '> 1순위 = 10점 · 2순위 = 5점 · 3순위 = 3점',
    '',
    '## 1. 영훈(남편)',
    '',
    buildTable(apartments, items, husband),
    '## 2. 상희(아내)',
    '',
    buildTable(apartments, items, wife),
    '## 3. 점수 집계',
    '',
    buildScoreTable(apartments, scores),
    '',
  ].join('\n');
}

// 섹션을 잘라내는 헬퍼 (## 헤더 기준)
function sliceSection(content, startRe) {
  const start = content.search(startRe);
  if (start === -1) return null;
  const rest = content.slice(start);
  const next = rest.slice(1).search(/\n##\s/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

// ─────────────────────────────────────────────────────────────
// API: 데이터 읽기
// ─────────────────────────────────────────────────────────────
app.get('/api/data', async (req, res) => {
  try {
    let content = '';
    try {
      content = await fs.readFile(FILE_PATH, 'utf-8');
    } catch {
      content = '';
    }

    const hSec = sliceSection(content, /영훈|남편/);
    const wSec = sliceSection(content, /상희|아내/);
    const hTable = hSec ? parseTable(hSec) : null;
    const wTable = wSec ? parseTable(wSec) : null;

    const apartments =
      hTable?.apartments?.length ? hTable.apartments
      : wTable?.apartments?.length ? wTable.apartments
      : DEFAULT_APARTMENTS;
    const items =
      hTable?.items?.length ? hTable.items
      : wTable?.items?.length ? wTable.items
      : DEFAULT_ITEMS;

    res.json({
      apartments,
      items,
      husband: hTable?.data || {},
      wife: wTable?.data || {},
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '데이터를 읽는 중 오류: ' + e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// API: 저장
// ─────────────────────────────────────────────────────────────
app.post('/api/save', async (req, res) => {
  try {
    const { apartments, items, husband, wife } = req.body;
    if (!apartments || !items || !husband || !wife) {
      return res.status(400).json({ error: '필수 데이터가 누락되었습니다.' });
    }
    const md = buildMarkdown(apartments, items, husband, wife);
    await fs.writeFile(FILE_PATH, md, 'utf-8');
    res.json({ success: true, message: 'iCloud에 저장되었습니다.' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '저장 중 오류: ' + e.message });
  }
});

// ─────────────────────────────────────────────────────────────
// API: 폴더 내 모든 임장 체크리스트 md 합산 (아내 통계용)
//   - 파일명에 "임장"과 "체크리스트"가 모두 들어간 .md 파일만 대상
//   - 남편이 전송받아 넣은 파일 + 내가 생성/저장한 파일을 합쳐 통계
// ─────────────────────────────────────────────────────────────
function mergeInto(target, data) {
  if (!data) return;
  for (const item of Object.keys(data)) {
    for (const apt of Object.keys(data[item])) {
      const cell = data[item][apt];
      if (cell && (cell.rank || (cell.note && cell.note.trim()))) {
        if (!target[item]) target[item] = {};
        target[item][apt] = cell;
      }
    }
  }
}

app.get('/api/aggregate', async (req, res) => {
  try {
    const all = await fs.readdir(__dirname);
    const files = all
      .filter((f) => f.endsWith('.md') && /임장/.test(f) && /체크리스트/.test(f))
      .sort();

    let apartments = [];
    let items = [];
    const husband = {};
    const wife = {};
    const used = [];

    for (const f of files) {
      const content = await fs.readFile(path.join(__dirname, f), 'utf-8');
      const hSec = sliceSection(content, /영훈|남편/);
      const wSec = sliceSection(content, /상희|아내/);
      const h = hSec ? parseTable(hSec) : null;
      const w = wSec ? parseTable(wSec) : null;
      if (!h && !w) continue;

      const apts = h?.apartments?.length ? h.apartments : (w?.apartments || []);
      const its = h?.items?.length ? h.items : (w?.items || []);
      if (apts.length && !apartments.length) apartments = apts;
      if (its.length && !items.length) items = its;

      mergeInto(husband, h?.data);
      mergeInto(wife, w?.data);
      used.push(f);
    }

    if (!apartments.length) apartments = DEFAULT_APARTMENTS;
    if (!items.length) items = DEFAULT_ITEMS;

    res.json({ apartments, items, husband, wife, files: used });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: '통계 집계 중 오류: ' + e.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🏡 임장 체크리스트 서버 실행 중`);
  console.log(`   PC:     http://localhost:${PORT}`);
  console.log(`   모바일:  http://[Mac-IP]:${PORT}  (같은 Wi-Fi)\n`);
});

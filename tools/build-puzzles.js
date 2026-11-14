/*
 * 由 Lichess 公開謎題資料庫（CC0）篩出本 App 用嘅謎題。
 *   用法：node tools/build-puzzles.js <lichess_db_puzzle.csv.zst 的路徑>
 *   注意：原始檔有幾百 MB，只用串流處理（zlib 內建 zstd 解壓 → 逐行讀取），終端機只印統計數字。
 *   原始檔唔好放入 repo（.gitignore 已排除 *.csv、*.zst）。
 *
 * 篩選：Rating 400–1400；RatingDeviation <= 90；Popularity >= 85；NbPlays >= 300；
 *       主題只留 hangingPiece、mateIn1、fork、pin、mateIn2、skewer、discoveredAttack。
 * 每個主題約 350 題，盡量平均分佈喺 10 個分數段（每 100 分一段），固定種子隨機抽樣（可重現）。
 * 輸出：data/puzzles/r0400.json … r1300.json、data/puzzles/index.json、data/mate1.js（60 題一步殺）
 */
"use strict";
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ROOT = path.resolve(__dirname, "..");
const SRC = process.argv[2];
if (!SRC) { console.error("用法：node tools/build-puzzles.js <lichess_db_puzzle.csv.zst>"); process.exit(1); }

const THEMES = ["hangingPiece", "mateIn1", "fork", "pin", "mateIn2", "skewer", "discoveredAttack"];
const FILTER = { minRating: 400, maxRating: 1400, maxDeviation: 90, minPopularity: 85, minPlays: 300 };
const PRIORITY = ["skewer", "discoveredAttack", "pin", "fork", "hangingPiece", "mateIn2", "mateIn1"];
const BANDS = 10;                    // 400–1400，每 100 分一段
const PER_THEME = 350;
const PER_BAND = PER_THEME / BANDS;  // 35
const CAP = 160;                     // 每個（主題×分數段）保留嘅候選上限（reservoir 抽樣）
const MATE1_PER_BAND = 6;            // 一步將死小遊戲：每段 6 題，共 60 題

function mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rng = mulberry32(20261114);
const bandOf = r => Math.min(BANDS - 1, Math.floor((r - FILTER.minRating) / 100));
const bandName = b => "r" + String(FILTER.minRating + b * 100).padStart(4, "0");

const seen = {};      // 符合篩選嘅總數：seen[theme][band]
const pool = {};      // reservoir：pool[theme][band] = []
THEMES.forEach(t => { seen[t] = Array(BANDS).fill(0); pool[t] = Array.from({ length: BANDS }, () => []); });
let lines = 0, qualified = 0, header = null;

/*
 * Lichess 嘅 .zst 係 pzstd 格式：每個 zstd frame 前面有一個 skippable frame（payload = 下一個 frame 嘅壓縮後長度）。
 * Node 內建 zstd 串流遇到 skippable frame 會報錯，所以自己按 frame 逐個讀取、逐個解壓（每個約 32 MB 輸出）。
 */
function* frames(file) {
  const fd = fs.openSync(file, "r");
  const size = fs.fstatSync(fd).size;
  let pos = 0;
  const read = (n, at) => { const b = Buffer.alloc(n); fs.readSync(fd, b, 0, n, at); return b; };
  while (pos < size) {
    const hdr = read(8, pos);
    let len = size - pos;
    if (((hdr.readUInt32LE(0) & 0xFFFFFFF0) >>> 0) === 0x184D2A50) {
      const psize = hdr.readUInt32LE(4);
      if (psize === 4) { len = read(4, pos + 8).readUInt32LE(0); pos += 12; } else { pos += 8 + psize; len = size - pos; }
    }
    yield zlib.zstdDecompressSync(read(len, pos));
    pos += len;
  }
  fs.closeSync(fd);
}

function handle(line) {
  lines++;
  if (!header) { header = line.split(","); return; }
  const f = line.split(",");
  const rating = +f[3], dev = +f[4], pop = +f[5], plays = +f[6];
  if (rating < FILTER.minRating || rating > FILTER.maxRating || dev > FILTER.maxDeviation || pop < FILTER.minPopularity || plays < FILTER.minPlays) return;
  const themes = f[7].split(" ").filter(t => THEMES.includes(t));
  if (!themes.length) return;
  qualified++;
  const b = bandOf(rating);
  const p = { id: f[0], fen: f[1], moves: f[2], rating, themes };
  // 每題只歸入一個「主要主題」（按稀有程度：越罕見越優先），令各主題題數平均；themes 欄位仍然保留全部 7 個主題之一
  const t = PRIORITY.find(x => themes.includes(x));
  const n = ++seen[t][b];
  const list = pool[t][b];
  if (list.length < CAP) list.push(p);
  else { const j = Math.floor(rng() * n); if (j < CAP) list[j] = p; }
}

async function main() {
  let carry = "";
  for (const buf of frames(SRC)) {
    const parts = (carry + buf.toString("utf8")).split("\n");
    carry = parts.pop();
    for (const line of parts) handle(line.replace(/\r$/, ""));
  }
  if (carry) handle(carry.replace(/\r$/, ""));
  if (!header || lines < 1000) throw new Error("解壓結果異常：只讀到 " + lines + " 行");

  // 每個主題：每段先取 PER_BAND，不足嘅由仲有餘額嘅分數段輪流補足，直至約 350 題
  const chosen = new Map();     // id → puzzle（合併多個主題）
  const perTheme = {};
  for (const t of THEMES) {
    const take = Array(BANDS).fill(0);
    const avail = pool[t].map(l => l.length);
    for (let b = 0; b < BANDS; b++) take[b] = Math.min(PER_BAND, avail[b]);
    let total = take.reduce((a, c) => a + c, 0);
    for (let guard = 0; total < PER_THEME && guard < 10000; guard++) {
      let progressed = false;
      for (let b = 0; b < BANDS && total < PER_THEME; b++) if (take[b] < avail[b]) { take[b]++; total++; progressed = true; }
      if (!progressed) break;
    }
    perTheme[t] = take;
    for (let b = 0; b < BANDS; b++) pool[t][b].slice(0, take[b]).forEach(p => chosen.set(p.id, p));
  }

  // 輸出：按分數段分檔
  const outDir = path.join(ROOT, "data/puzzles");
  fs.mkdirSync(outDir, { recursive: true });
  for (const f of fs.readdirSync(outDir)) if (/^r\d{4}\.json$/.test(f)) fs.unlinkSync(path.join(outDir, f));
  const byBand = Array.from({ length: BANDS }, () => []);
  [...chosen.values()].sort((a, b) => a.rating - b.rating || a.id.localeCompare(b.id)).forEach(p => byBand[bandOf(p.rating)].push(p));
  const files = [];
  let bytes = 0;
  byBand.forEach((list, b) => {
    const name = bandName(b) + ".json";
    const text = "[\n" + list.map(p => JSON.stringify([p.id, p.fen, p.moves, p.rating, p.themes.join(" ")])).join(",\n") + "\n]\n";
    fs.writeFileSync(path.join(outDir, name), text);
    bytes += Buffer.byteLength(text);
    files.push({ file: name, min: FILTER.minRating + b * 100, max: FILTER.minRating + b * 100 + 99, count: list.length, bytes: Buffer.byteLength(text) });
  });
  // 統計：每個主題×分數段（最終檔案內，包含同時屬於多個主題嘅題目）
  const finalCount = {};
  THEMES.forEach(t => { finalCount[t] = Array(BANDS).fill(0); });
  chosen.forEach(p => p.themes.forEach(t => finalCount[t][bandOf(p.rating)]++));
  fs.writeFileSync(path.join(outDir, "index.json"), JSON.stringify({
    source: "https://database.lichess.org/lichess_db_puzzle.csv.zst (CC0)", generated: new Date().toISOString().slice(0, 10),
    filter: FILTER, themes: THEMES, bands: files, total: chosen.size, counts: finalCount
  }, null, 1) + "\n");

  // 一步將死小遊戲：mateIn1 每段 MATE1_PER_BAND 題，按分數由低至高分 4 級
  const m1 = [];
  for (let b = 0; b < BANDS; b++) pool.mateIn1[b].filter(p => p.moves.split(" ").length === 2).slice(0, MATE1_PER_BAND).forEach(p => m1.push(p));
  m1.sort((a, b) => a.rating - b.rating);
  const per = Math.ceil(m1.length / 4);
  const m1rows = m1.map((p, i) => ({ id: p.id, fen: p.fen, moves: p.moves, rating: p.rating, level: Math.floor(i / per) + 1 }));
  fs.writeFileSync(path.join(ROOT, "data/mate1.js"),
    `/* 一步將死小遊戲題庫：Lichess 真實 mateIn1 謎題（CC0），由 tools/build-puzzles.js 產生，請不要手改。\n * fen = 對手走之前的局面；moves = 對手一步 + 玩家將死一步（uci）。level 1–4 按謎題分由低至高。 */\n(function (root, factory) {\n  if (typeof module === "object" && module.exports) module.exports = factory();\n  else { root.ChessOps = root.ChessOps || {}; root.ChessOps.Mate1 = factory(); }\n})(typeof self !== "undefined" ? self : this, function () {\n  "use strict";\n  return [\n${m1rows.map(r => "    " + JSON.stringify(r)).join(",\n")}\n  ];\n});\n`);

  // 只印統計
  console.log(`讀取 ${lines.toLocaleString()} 行；符合篩選 ${qualified.toLocaleString()} 題；入選 ${chosen.size} 題；檔案合共 ${(bytes / 1024).toFixed(0)} KB`);
  console.log("\n符合篩選的候選總數（按主要主題歸類；主題 × 分數段）：");
  console.log("主題\\段  " + Array.from({ length: BANDS }, (_, b) => String(FILTER.minRating + b * 100).padStart(6)).join(""));
  THEMES.forEach(t => console.log(t.padEnd(18) + seen[t].map(n => String(n).padStart(6)).join("")));
  console.log("\n入選題數（主題 × 分數段）：");
  THEMES.forEach(t => console.log(t.padEnd(18) + finalCount[t].map(n => String(n).padStart(6)).join("") + "  合計 " + finalCount[t].reduce((a, c) => a + c, 0)));
  console.log("\n各檔案：" + files.map(f => `${f.file} ${f.count}題 ${(f.bytes / 1024).toFixed(0)}KB`).join("；"));
  console.log("mate1：" + m1rows.length + " 題；各級題數 " + [1, 2, 3, 4].map(l => m1rows.filter(r => r.level === l).length).join("/") + "；分數 " + m1rows[0].rating + "–" + m1rows[m1rows.length - 1].rating);
}
main().catch(e => { console.error(e); process.exit(1); });

/*
 * 產生 docs/stage5-content.md：殘局全部局面（FEN、課題、引擎結果、步數上限、殘局庫查證）、說明卡文字、
 * 開局「也可以」走法（連引擎數值）、走棋前三問改動（換走嘅題目、新增嘅題目 id 同答案）。
 * 用法：node tools/gen-stage5-content.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");
const EGD = require(path.join(ROOT, "data/endgames.js"));
const OPEN = require(path.join(ROOT, "data/openings.js"));
const THREE = require(path.join(ROOT, "data/three.js"));
const CFG = require(path.join(ROOT, "js/config.js"));
const { Chess } = require(path.join(ROOT, "vendor/chess.js/chess.cjs"));
const ev = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/stage5-endgames-verify.json"), "utf8"));
const tbr = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/stage5-endgames-tb.json"), "utf8"));
const ov = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/stage4-openings-verify.json"), "utf8"));
const ch = JSON.parse(fs.readFileSync(path.join(ROOT, "docs/stage5-three-changes.json"), "utf8"));
const esc = s => String(s).replace(/\|/g, "\\|");
const TASK = { mate: "將死", promote: "白方贏：把兵升變為后", judge: "判斷：這局面能贏嗎？" };
const THEME = { hangingPiece: "送子", fork: "捉雙", pin: "牽制", mateIn1: "一步殺", mateThreat: "對方威脅將死" };
const sfText = s => s.mate !== null && s.mate !== undefined ? "mate " + s.mate : (s.cp / 100 >= 0 ? "+" : "") + (s.cp / 100).toFixed(2);
const ans = q => q.kind === "squares" ? "點出 " + q.squares.join("、") : q.kind === "mate" ? "選「將死」類選項" : "選「沒有」類選項";

const L = ["# 第 5 階段內容清單（供逐題核對）", "",
  "由 `node tools/gen-stage5-content.js` 自動產生。FEN 可以貼到 lichess.org/editor 核對。", ""];

/* ---------- 一、殘局 ---------- */
const total = EGD.TOPICS.reduce((a, t) => a + t.positions.length, 0);
L.push("## 一、殘局訓練（4 個課題，共 " + total + " 個局面）", "",
  "**驗證方法**", "",
  "- 殺王課題（后、車、雙車）：局面由固定種子隨機產生（白先走），條件：局面合法、黑王沒有被將軍、黑方有棋可走（沒有一開始就逼和）、沒有白子一開始就可以被黑王白吃。再去 Lichess 殘局庫（tablebase.lichess.ovh）查「將死步數 N」，每個目標步數挑候選；然後用 **Stockfish 19（depth " + ev.sfDepth + "，或者每個局面 " + ev.sfMs / 1000 + " 秒，先到先停）** 要算出同一個 mate N；再做一次「自我對弈」：白方用提示設定（depth " + CFG.ENDGAME.HINT.depth + "）、黑方用防守設定（depth " + CFG.ENDGAME.DEFENDER.depth + "，Stockfish 全力，沒有降低強度），必須在步數上限內將死。三項都合格才收。",
  "- 王兵對王：局面人手設計，每個局面標明預期結果（win／draw），要同 **Lichess 殘局庫** 同 **Stockfish（depth " + ev.sfDepth + " 或 " + ev.sfMs / 1000 + " 秒）** 兩邊一致才收：贏＝殘局庫 win 而且 Stockfish 分數 ≥ " + CFG.ENDGAME.WIN_CP + " cp（或將死分數）；和棋＝殘局庫 draw 而且 Stockfish 分數絕對值 ≤ 50 cp。「贏」課題再做自我對弈：兵要升變，而且升變後 Stockfish 仍然判斷白方贏（后沒有被吃）。",
  "- **殘局庫查證結果**：全部局面都已經用 Lichess 殘局庫（tablebase.lichess.ovh/standard）查過，網絡可以連接，所以不是只靠 Stockfish。查到嘅 category／dtm／dtz 記錄喺下表同 `docs/stage5-endgames-tb.json`。",
  "- 步數上限＝引擎最短將死步數 × " + CFG.ENDGAME.CAP_MULT + " + " + CFG.ENDGAME.CAP_ADD + "（最多 " + CFG.ENDGAME.CAP_MAX + " 步）。王兵對王「贏」課題冇「最短將死」，所以 shortest ＝ 引擎自我對弈升變嘅白方步數（不是嚴格最短），上限用同一條公式。",
  "- 星星：3 星＝不用提示而且步數 ≤ 最短 + " + CFG.ENDGAME.STAR3_EXTRA + "；2 星＝不用提示、上限內完成；1 星＝用過提示完成；判斷題答對 3 星、答錯 0 星。提示每次練習最多 " + CFG.ENDGAME.HINT_LIMIT + " 次。", "");

EGD.TOPICS.forEach(t => {
  L.push("### " + t.title + "（" + t.sub + "，id：`" + t.id + "`）", "", "**說明卡（App 顯示，書面語）**", "");
  t.steps.forEach((s, i) => L.push((i + 1) + ". " + s));
  L.push("", "| id | 課題 | FEN（白先走） | 預期／N | Stockfish | 殘局庫（category／dtm／dtz） | 步數上限 | 自我對弈步數 |", "|---|---|---|---|---|---|---|---|");
  t.positions.forEach(p => {
    const exp = p.task === "mate" ? "將死 N=" + p.shortest : p.expect === "win" ? "白方能贏" : "只能和棋";
    L.push("| " + p.id + " | " + TASK[p.task] + " | `" + p.fen + "` | " + exp + " | " + sfText(p.sf) + "（depth " + p.sf.depth + "） | " + p.tb.category + "／" + p.tb.dtm + "／" + p.tb.dtz + " | " + (p.cap ? p.cap + "（最短 " + p.shortest + "）" : "—") + " | " + (p.selfPlayMoves || "—") + " |");
  });
  if (t.task === "mixed") {
    L.push("", "**王兵對王：App 顯示嘅提示／解釋文字**", "");
    t.positions.forEach(p => L.push("- " + p.id + "（" + TASK[p.task] + "）：" + (p.tip || p.explain)));
  }
  L.push("");
});

const rejected = [];
ev.mate.forEach(m => m.tried.filter(x => x.rejected).forEach(x => rejected.push(m.topic + " N=" + m.N + "：" + x.fen + " — " + x.rejected)));
ev.kpk.filter(x => !x.consistent).forEach(x => rejected.push("kpk：" + x.fen + " — 預期 " + x.expect + "，Stockfish " + x.sfLabel + "，殘局庫 " + x.tb.category));
L.push("### 被淘汰嘅候選", "", rejected.length ? rejected.map(r => "- " + r).join("\n") : "沒有候選局面被淘汰（所有試過嘅候選都通過 Stockfish 同自我對弈驗證）。", "");
L.push("### 殘局庫候選分佈（隨機抽樣結果）", "", "| 課題 | 查詢局面數 | 各 N 嘅候選數量 |", "|---|---|---|");
Object.keys(tbr.mate).forEach(k => L.push("| " + k + " | " + tbr.mate[k].queried + " | " + Object.keys(tbr.mate[k].distribution).sort((a, b) => a - b).map(n => "N=" + n + "：" + tbr.mate[k].distribution[n]).join("，") + " |"));
L.push("");

/* ---------- 二、開局「也可以」 ---------- */
L.push("## 二、開局「也可以」走法（Stockfish depth " + ov.depth + "）", "",
  "規則：學習者某一步走咗唔係主線、但合理嘅走法 → 唔當錯，顯示「也可以！不過這條路線練習的是 X，請再走一次。」，還原棋步，等學習者走主線；唔影響「連續 3 次全對」。每步最多 2 個；條件：勝率跌幅 < " + ov.altMaxDrop + "（同主線嗰步嘅走前評價比較）而且符合開局原則（出子、易位、佔中心；候選已排除重複走同一枚子、過早出后、邊兵等）。", "",
  "| 路線 | 第幾步 | 主線 | 也可以 | 勝率跌幅 | 評價（學習者角度，cp） |", "|---|---|---|---|---|---|");
let altCount = 0;
OPEN.ROUTES.forEach(r => Object.keys(r.alts || {}).map(Number).sort((a, b) => a - b).forEach(ply => r.alts[ply].forEach(a => {
  altCount++;
  const mn = Math.floor(ply / 2) + 1, label = (ply % 2 === 0 ? mn + "." : mn + "…") + r.moves[ply];
  L.push("| " + r.title + "（" + r.id + "） | " + label.replace(/\.\.\./, "…") + " | " + r.moves[ply] + " | " + a.san + " | " + a.drop.toFixed(3) + " | " + (a.cp >= 0 ? "+" : "") + (a.cp / 100).toFixed(2) + " |");
})));
L.push("", "共 " + altCount + " 個「也可以」走法。", "", "**試過但未採用嘅候選（跌幅 ≥ " + ov.altMaxDrop + "，或者同一步已有 2 個更好嘅）**", "");
const notKept = [];
Object.keys(ov.alts).forEach(id => ov.alts[id].filter(a => !a.kept).forEach(a => notKept.push("- " + id + " 第 " + (a.ply + 1) + " 個半步 " + a.san + "：跌幅 " + a.drop)));
L.push(notKept.length ? notKept.join("\n") : "沒有。", "");

/* ---------- 三、三問改動 ---------- */
const byId = {}; THREE.forEach(q => { byId[q.id] = q; });
L.push("## 三、走棋前三問（70 題）改動", "",
  "**原因**：「白吃」判斷以前只檢查對方「有冇棋子攻擊嗰格」，冇檢查吃返係咪**合法**（例如王唔可以吃返有後援保護嘅子、被牽制嘅子唔可以吃返）。現在改用 chess.js 嘅合法步（`moves({verbose:true})`）判斷。重新計算全部 60 題，答案改變或者 Q3 候選步判斷改變嘅題目已經換走，同一主題補返新題；另外新增 10 題「對方威脅將死」。", "",
  "**門檻**：三問用淨得益 ≥ " + CFG.TACTICS.THREE_MIN_GAIN + "；賽後檢討「送子」「漏吃」用 ≥ " + CFG.TACTICS.REVIEW_MIN_GAIN + "（兩個數字都喺 `js/config.js` 嘅 `TACTICS`）。", "",
  "### 換走嘅題目（" + ch.changed.length + " 題）", "", "| 舊題 id | 主題 | 分數 | 換走原因 |", "|---|---|---|---|");
ch.changed.forEach(c => L.push("| [" + c.id + "](https://lichess.org/training/" + c.id + ") | " + THEME[c.theme] + " | " + c.rating + " | " + esc(c.reasons.join("；")) + " |"));
L.push("", "### 補上嘅新題（" + ch.replacedBy.length + " 題）", "", "| 新題 id | 主題 | 分數 | 走棋方 | FEN | Q1 答案 | Q2 答案 | Q3（✅＝會送子／被將死） |", "|---|---|---|---|---|---|---|---|");
function row(q) { const side = q.fen.split(" ")[1] === "w" ? "白" : "黑"; return "| [" + q.id + "](https://lichess.org/training/" + q.id + ") | " + THEME[q.theme] + " | " + q.rating + " | " + side + " | `" + q.fen + "` | " + esc(ans(q.q1)) + "：" + esc(q.q1.text) + " | " + esc(ans(q.q2)) + "：" + esc(q.q2.text) + " | " + q.q3.options.map(o => o.san + (o.uci === q.q3.answer ? " ✅" : "")).join("、") + " |"; }
ch.replacedBy.forEach(r => L.push(row(byId[r.id])));
L.push("", "### 新增嘅「對方威脅將死」（10 題）", "",
  "局面＝Lichess mateIn1 謎題嘅 FEN 本身（對手第一步**之前**）；條件：交換走棋方之後有一步將死、局面合法、走棋方冇被將軍。Q1 答案＝「對方威脅將死」；Q2、Q3 照一般規則由程式計算。", "",
  "| 新題 id | 主題 | 分數 | 走棋方 | FEN | Q1 答案 | Q2 答案 | Q3（✅＝會送子／被將死） |", "|---|---|---|---|---|---|---|---|");
ch.mateThreatIds.forEach(id => L.push(row(byId[id])));
L.push("");

fs.writeFileSync(path.join(ROOT, "docs/stage5-content.md"), L.join("\n") + "\n");
console.log("已寫入 docs/stage5-content.md（" + L.length + " 行）");

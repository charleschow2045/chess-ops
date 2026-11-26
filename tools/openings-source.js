/*
 * 開局訓練：路線同原則小測嘅「來源定義」（人手寫嘅走法同解釋）。
 * tools/verify-openings.js 會用 chess.js 驗證合法，並用 Stockfish 檢查學習者一方每一步（勝率跌幅 < 0.1）同小測答案，
 * 然後寫出最終嘅 data/openings.js（唔合格嘅步／題目會被刪走並喺報告列出）。
 * 解釋一律書面語，每步一句，講開局原則（控制中心、出子、易位、不要過早出后、不要重複走同一枚子）。
 */
"use strict";

const ITALIAN_NOTES = [
  "白方走 e4：用兵佔據中心，同時打開象和后的出路。",
  "黑方也走 e5：同樣控制中心。",
  "白方出馬到 f3：出子，同時攻擊 e5 兵。開局先出子，比亂走兵更重要。",
  "黑方走 Nc6：出馬，並保護 e5 兵。",
  "白方出象到 c4：瞄準對方較弱的 f7，同時是出子。",
  "黑方走 Bc5：出象，同樣瞄準對方的 f2。",
  "白方走 c3：為日後推進 d4 做準備，爭取更多中心空間。",
  "黑方走 Nf6：出另一枚馬，並攻擊 e4 兵。",
  "白方走 d3：保護 e4 兵，同時讓 c1 的象有出路。",
  "黑方走 d6：保護 e5 兵，也讓 c8 的象有出路。",
  "白方易位（O-O）：王走到安全位置，車也出動了。",
  "黑方易位（O-O）：王同樣安全了，雙方出子完成。"
];

const ROUTES = [
  { id: "w-italian", side: "w", title: "意大利開局（主線）", desc: "白方：1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.c3 Nf6 5.d3 d6 6.O-O O-O",
    moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6", "d3", "d6", "O-O", "O-O"], notes: ITALIAN_NOTES,
    altCandidates: { 0: ["d4", "Nf3", "c4"], 2: ["Nc3", "Bc4"], 4: ["Bb5", "Nc3", "d4"], 6: ["d3", "O-O", "Nc3"], 8: ["O-O", "Nc3", "Bg5"], 10: ["Nbd2", "Re1", "Nc3"] } },
  { id: "w-two-knights", side: "w", title: "黑方走 3…Nf6（雙馬防禦）", desc: "白方：1.e4 e5 2.Nf3 Nc6 3.Bc4 Nf6 4.d3 Be7 5.O-O O-O",
    moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "d3", "Be7", "O-O", "O-O"],
    altCandidates: { 0: ["d4", "Nf3", "c4"], 2: ["Nc3", "Bc4"], 4: ["Bb5", "Nc3", "d4"], 6: ["O-O", "Nc3", "c3"], 8: ["Nc3", "c3", "Re1"] },
    notes: [ITALIAN_NOTES[0], ITALIAN_NOTES[1], ITALIAN_NOTES[2], ITALIAN_NOTES[3], ITALIAN_NOTES[4],
      "黑方走 Nf6：出另一枚馬，並攻擊 e4 兵（雙馬防禦）。",
      "白方走 d3：穩穩保護 e4 兵，也讓 c1 的象有出路。",
      "黑方走 Be7：出象，為易位做準備。",
      "白方易位（O-O）：王走到安全位置，車也出動了。",
      "黑方易位（O-O）：雙方都完成了出子和易位。"] },
  { id: "w-philidor", side: "w", title: "黑方走 2…d6", desc: "白方：1.e4 e5 2.Nf3 d6 3.d4，之後正常出子",
    moves: ["e4", "e5", "Nf3", "d6", "d4", "exd4", "Nxd4", "Nf6", "Nc3", "Be7", "Be2", "O-O", "O-O"],
    altCandidates: { 0: ["d4", "Nf3", "c4"], 2: ["Nc3", "Bc4"], 4: ["Bc4", "Nc3", "Bb5+"], 8: ["Be2", "Bd3", "Be3"], 10: ["Be3", "Bd3", "O-O"], 12: ["Be3", "Nb3", "Bf3"] },
    notes: [ITALIAN_NOTES[0], ITALIAN_NOTES[1], ITALIAN_NOTES[2],
      "黑方走 d6：保護 e5 兵，但這樣會限制自己 f8 的象。",
      "白方走 d4：用兵爭奪中心，這是對付 d6 最直接的走法。",
      "黑方走 exd4：吃掉白兵，交換中心兵。",
      "白方走 Nxd4：用馬吃回兵，馬同時佔據中心。",
      "黑方走 Nf6：出馬，並攻擊 e4 兵。",
      "白方走 Nc3：出另一枚馬，並保護 e4 兵。",
      "黑方走 Be7：出象，為易位做準備。",
      "白方走 Be2：出象，準備易位。",
      "黑方易位（O-O）：王走到安全位置。",
      "白方易位（O-O）：王安全了，車也出動了。"] },
  { id: "b-italian", side: "b", title: "對意大利開局", desc: "黑方：1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.c3 Nf6 5.d3 d6 6.O-O O-O",
    moves: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6", "d3", "d6", "O-O", "O-O"], notes: ITALIAN_NOTES,
    altCandidates: { 1: ["c5", "e6", "c6"], 3: ["Nf6", "d6"], 5: ["Nf6", "Be7"], 7: ["d6", "Qe7", "Be7"], 9: ["O-O", "Be7"], 11: ["Re8", "Nbd7"] } },
  { id: "b-scholar", side: "b", title: "防守學者殺法", desc: "黑方：1.e4 e5 2.Qh5 Nc6 3.Bc4 g6 4.Qf3 Nf6",
    moves: ["e4", "e5", "Qh5", "Nc6", "Bc4", "g6", "Qf3", "Nf6"],
    altCandidates: { 1: ["c5", "e6", "c6"], 3: ["Nf6", "Bc5"], 5: ["Nf6", "d6", "Nh6"], 7: ["d6", "Bc5", "Nh6"] },
    notes: [ITALIAN_NOTES[0],
      "黑方走 e5：控制中心，是最穩健的回應。",
      "白方過早出后（Qh5）：同時攻擊 e5 和 f7。過早出后容易被對方追打，這是學者殺法的開始。",
      "黑方走 Nc6：出馬，並保護 e5 兵。",
      "白方出象到 c4：瞄準 f7，威脅 Qxf7 將死（學者殺法）。",
      "黑方走 g6：攻擊白后，同時擋住后對 f7 的攻擊。",
      "白后退到 f3：繼續瞄準 f7，但已經失去了先手。",
      "黑方走 Nf6：出馬擋住白后對 f7 的攻擊，同時出子，防守完成。"] },
  { id: "b-bishop", side: "b", title: "對 2.Bc4", desc: "黑方：1.e4 e5 2.Bc4 Nf6，之後正常出子",
    moves: ["e4", "e5", "Bc4", "Nf6", "d3", "Nc6", "Nf3", "Be7", "O-O", "O-O"],
    altCandidates: { 1: ["c5", "e6", "c6"], 3: ["Nc6", "Bc5"], 5: ["Be7", "d5", "Bc5"], 7: ["d6", "O-O", "Bc5"], 9: ["d6", "Re8"] },
    notes: [ITALIAN_NOTES[0], "黑方走 e5：控制中心。",
      "白方先出象到 c4：瞄準 f7。",
      "黑方走 Nf6：出馬，並攻擊 e4 兵。",
      "白方走 d3：保護 e4 兵。",
      "黑方走 Nc6：出另一枚馬，控制中心。",
      "白方出馬到 f3：出子，控制中心。",
      "黑方走 Be7：出象，為易位做準備。",
      "白方易位（O-O）：王走到安全位置。",
      "黑方易位（O-O）：雙方都完成了出子和易位。"] }
];

/*
 * 開局原則小測候選題（程式會用 Stockfish 驗證，挑出頭 10 題合格者）：
 *   prefix：由開局走完呢啲步之後輪到走棋；options[0] 係「符合開局原則」嘅答案，其餘係違反原則嘅步
 */
const QUIZ_CANDIDATES = [
  { prefix: ["e4", "e5"], options: ["Nf3", "Qh5", "a3"], explain: "出馬到 f3：出子，控制中心，並攻擊 e5 兵。過早出后（Qh5）容易被追打，a3 對開局沒有幫助。" },
  { prefix: ["e4", "e5", "Nf3"], options: ["Nc6", "a6", "h6"], explain: "走 Nc6：出馬並保護 e5 兵。a6 和 h6 只是邊兵的小步，沒有出子。" },
  { prefix: ["e4", "e5", "Nf3", "Nc6"], options: ["Bc4", "h4", "Ke2"], explain: "出象到 c4：出子並瞄準 f7。h4 浪費時間，Ke2 令王失去易位的機會。" },
  { prefix: ["e4", "e5", "Nf3", "Nc6", "Bc4"], options: ["Bc5", "a6", "h6"], explain: "出象到 c5：出子，控制中心對角線。a6、h6 沒有出子，落後於對方的出子速度。" },
  { prefix: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5"], options: ["c3", "Bxf7+", "a3"], explain: "c3：準備 d4 爭奪中心。Bxf7+ 用象換兵，只會損失一枚象。" },
  { prefix: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6", "d3", "d6"], options: ["O-O", "h4", "Ke2"], explain: "易位：王走到安全位置，車也出動。h4 和 Ke2 都沒有幫助出子，Ke2 還令王留在中心。" },
  { prefix: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3"], options: ["Nf6", "h6", "a6"], explain: "走 Nf6：出另一枚馬，並攻擊 e4 兵。h6、a6 不是出子。" },
  { prefix: ["e4", "e5", "Qh5"], options: ["Nc6", "a6", "h6"], explain: "走 Nc6：出馬並保護 e5 兵，不用急著趕走對方的后。" },
  { prefix: ["d4", "d5"], options: ["Nf3", "Qd3", "a3"], explain: "出馬到 f3：出子並控制中心。Qd3 把后放在兵前面，擋住 d 兵，也太早出后。" },
  { prefix: ["d4", "Nf6", "c4", "e6", "Nc3"], options: ["d5", "a6", "h6"], explain: "走 d5：用兵爭奪中心。a6、h6 都不是出子，也不爭中心。" },
  { prefix: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Nf6", "d3", "Be7"], options: ["O-O", "a3", "h3"], explain: "易位：王走到安全位置。a3 和 h3 只是等着走的小步。" },
  { prefix: ["e4", "e5", "Nf3", "Nc6", "Bc4", "Bc5", "c3", "Nf6", "d3"], options: ["d6", "Bb6", "h6"], explain: "走 d6：保護 e5 兵，並讓 c8 的象有出路。Bb6 把剛出的象再走一次，浪費時間。" },
  { prefix: ["e4", "c5", "Nf3"], options: ["Nc6", "h6", "a5"], explain: "走 Nc6：出馬，並控制 d4。h6 和 a5 沒有出子。" },
  { prefix: ["e4", "e6", "d4", "d5", "Nc3"], options: ["Nf6", "a6", "h6"], explain: "走 Nf6：出馬，並攻擊 e4 兵。a6 和 h6 沒有出子。" },
  { prefix: ["Nf3", "d5", "g3"], options: ["Nf6", "h6", "a5"], explain: "走 Nf6：出馬，控制中心。h6 和 a5 不是出子。" },
  { prefix: ["e4", "e5", "Nf3", "Nc6", "d4", "exd4"], options: ["Nxd4", "Qxd4", "h3"], explain: "用馬吃回 d4 的兵，馬同時佔據中心。Qxd4 會被 Nxd4 吃掉后。" },
  { prefix: ["e4", "e5", "Nf3", "d6", "d4"], options: ["Nf6", "Qd7", "h6"], explain: "走 Nf6：出馬並攻擊 e4 兵。Qd7 把后太早放出來，還擋住象的出路。" },
  { prefix: ["d4", "d5", "c4", "e6", "Nc3", "Nf6", "Bg5"], options: ["Be7", "h6", "a6"], explain: "走 Be7：出象，並為易位做準備，同時解除牽制。a6 和 h6 沒有出子。" }
];

module.exports = { ROUTES, QUIZ_CANDIDATES };

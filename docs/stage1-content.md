# 第 1 階段題目清單（供逐題核對）

由 `node tools/gen-content.js` 自動產生。每個局面的 FEN 可以貼到任何棋盤程式（例如 lichess.org/editor）核對。
「chess.js 計算結果」欄位是程式用 chess.js 重新算出來的答案，`tests/run-all.js` 會確保它與題庫內寫的答案一致。

## 一、規則快測（30 題）

### 易位（王車易位的條件）

**castling-1**（選擇題）

- 局面 FEN：`r3k2r/pppq1ppp/2n2n2/2bpp3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 0 1`
- 問題：輪到白方走棋。白方可以短易位（O-O）嗎？
- 選項：可以 ✅　／　不可以
- 標準答案：**可以**（chess.js 計算結果：`yes`，與題庫一致）
- 驗證方法：`{"kind":"castle","wing":"k"}`
- 解釋：可以。王和 h1 的車都未移動過，王與車之間的 f1、g1 沒有棋子，而且王、f1、g1 都沒有被攻擊。

**castling-2**（選擇題）

- 局面 FEN：`r3k2r/8/8/8/8/8/8/R3KB1R w KQkq - 0 1`
- 問題：輪到白方走棋。白方可以短易位（O-O）嗎？
- 選項：可以　／　不可以 ✅
- 標準答案：**不可以**（chess.js 計算結果：`no`，與題庫一致）
- 驗證方法：`{"kind":"castle","wing":"k"}`
- 解釋：不可以。f1 還有一個象，王與車之間必須沒有任何棋子。（這個局面長易位 O-O-O 是可以的。）

**castling-3**（選擇題）

- 局面 FEN：`r3k2r/8/8/8/4r3/8/8/R3K2R w KQkq - 0 1`
- 問題：輪到白方走棋。白方可以短易位（O-O）嗎？
- 選項：可以　／　不可以 ✅
- 標準答案：**不可以**（chess.js 計算結果：`no`，與題庫一致）
- 驗證方法：`{"kind":"castle","wing":"k"}`
- 解釋：不可以。白王正被 e4 的黑車將軍，被將軍時不可以易位。

**castling-4**（選擇題）

- 局面 FEN：`r3k2r/8/8/8/8/5r2/8/R3K2R w KQkq - 0 1`
- 問題：輪到白方走棋。白方可以短易位（O-O）嗎？
- 選項：可以　／　不可以 ✅
- 標準答案：**不可以**（chess.js 計算結果：`no`，與題庫一致）
- 驗證方法：`{"kind":"castle","wing":"k"}`
- 解釋：不可以。王要經過 f1，而 f1 被 f3 的黑車攻擊。王所經過或到達的格子都不可以被攻擊。（長易位則沒有問題。）

**castling-5**（在棋盤上走一步）

- 局面 FEN：`r3k2r/pppq1ppp/2n1bn2/3pp3/3PP3/2N1BN2/PPPQ1PPP/R3K2R w KQkq - 0 1`
- 問題：請在棋盤上用易位走一步。（把王移動兩格）
- 標準答案：**O-O-O、O-O**（uci：e1c1、e1g1；chess.js 計算結果：e1c1、e1g1，與題庫一致）
- 驗證方法：`{"kind":"plays","pred":"castle"}`
- 解釋：王向右移兩格是短易位（O-O），向左移兩格是長易位（O-O-O）。這個局面兩種都可以。

### 吃過路兵（兵的特殊吃法）

**enpassant-1**（選擇題）

- 局面 FEN：`rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3`
- 問題：黑方剛剛把 f 兵由 f7 一步走到 f5。白方可以用 e5 兵吃過路兵（exf6）嗎？
- 選項：可以 ✅　／　不可以
- 標準答案：**可以**（chess.js 計算結果：`yes`，與題庫一致）
- 驗證方法：`{"kind":"ep"}`
- 解釋：可以。對方的兵一步走兩格，落在自己的兵旁邊時，下一步可以像它只走一格那樣斜吃它。

**enpassant-2**（選擇題）

- 局面 FEN：`rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq - 0 3`
- 問題：黑方的 f 兵早前是先走到 f6，之後才再走到 f5（不是一步走兩格）。現在白方可以用 e5 兵吃過路兵嗎？
- 選項：可以　／　不可以 ✅
- 標準答案：**不可以**（chess.js 計算結果：`no`，與題庫一致）
- 驗證方法：`{"kind":"ep"}`
- 解釋：不可以。吃過路兵只可以在對方的兵「剛剛一步走兩格」之後的下一步使用，錯過了就不能再吃。

**enpassant-3**（在棋盤上走一步）

- 局面 FEN：`rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3`
- 問題：請在棋盤上走出吃過路兵。
- 標準答案：**exf6**（uci：e5f6；chess.js 計算結果：e5f6，與題庫一致）
- 驗證方法：`{"kind":"plays","pred":"ep"}`
- 解釋：e5 兵斜走到 f6，吃掉的是 f5 的兵（不是 f6 格上的棋子）。

**enpassant-4**（選擇題）

- 局面 FEN：`rnbqkbnr/ppp1p1pp/8/3pPp2/8/8/PPPP1PPP/RNBQKBNR w KQkq f6 0 3`
- 問題：白方吃過路兵（exf6）之後，哪一格的黑兵會被吃掉？
- 選項：f6　／　f5 ✅　／　e5　／　d5
- 標準答案：**f5**（chess.js 計算結果：`f5`，與題庫一致）
- 驗證方法：`{"kind":"epCaptured"}`
- 解釋：被吃掉的是 f5 的兵。白兵落在 f6，好像黑兵只走了一格時被吃掉一樣。

**enpassant-5**（選擇題）

- 局面 FEN：`rnbqkbnr/pppp1ppp/8/8/3Pp3/8/PPP1PPPP/RNBQKBNR b KQkq d3 0 3`
- 問題：白方剛剛把 d 兵由 d2 一步走到 d4。黑方可以用 e4 兵吃過路兵（exd3）嗎？
- 選項：可以 ✅　／　不可以
- 標準答案：**可以**（chess.js 計算結果：`yes`，與題庫一致）
- 驗證方法：`{"kind":"ep"}`
- 解釋：可以。黑方也可以吃過路兵：白兵一步走兩格落在黑兵旁邊，黑兵斜走到 d3 就可以吃掉它。

### 升變（兵走到底線之後）

**promotion-1**（在棋盤上走一步）

- 局面 FEN：`8/P5k1/8/8/8/8/6K1/8 w - - 0 1`
- 問題：請把 a7 的兵升變為馬。（走到 a8 後選擇馬）
- 標準答案：**a8=N**（uci：a7a8n；chess.js 計算結果：a7a8n，與題庫一致）
- 驗證方法：`{"kind":"plays","pred":"promo:n"}`
- 解釋：兵走到底線可以升變為后、車、象或馬。升變為馬叫做「低升變」，有時比升變為后更適合。

**promotion-2**（在棋盤上走一步）

- 局面 FEN：`6k1/P7/8/8/8/8/6K1/8 w - - 0 1`
- 問題：請走一步升變，並同時將軍。
- 標準答案：**a8=Q+、a8=R+**（uci：a7a8q、a7a8r；chess.js 計算結果：a7a8q、a7a8r，與題庫一致）
- 驗證方法：`{"kind":"plays","pred":"promoCheck"}`
- 解釋：升變為后或車，都會沿第 8 橫行攻擊黑王，所以都是將軍。升變為象或馬則不能將軍。

**promotion-3**（選擇題）

- 局面 FEN：`8/P5k1/8/8/8/8/6K1/8 w - - 0 1`
- 問題：白兵走到 a8（底線）時，必須怎樣做？
- 選項：必須升變為后、車、象或馬其中一種 ✅　／　可以選擇保持為兵
- 標準答案：**必須升變為后、車、象或馬其中一種**（chess.js 計算結果：`must`，與題庫一致）
- 驗證方法：`{"kind":"promoRequired","from":"a7","to":"a8"}`
- 解釋：必須升變，不可以保持為兵，也不能升變為王或升變為對方的棋子。

**promotion-4**（選擇題）

- 局面 FEN：`rn5k/1P6/8/8/8/8/8/K7 w - - 0 1`
- 問題：輪到白方走棋。下面哪一步是合法的？
- 選項：bxa8=Q（b7 兵吃 a8 的車，並升變為后） ✅　／　bxc8=Q（b7 兵斜走到 c8，並升變為后）　／　b8=Q（b7 兵直走到 b8，並升變為后）　／　b6（b7 兵向後退一格）
- 標準答案：**bxa8=Q（b7 兵吃 a8 的車，並升變為后）**（chess.js 計算結果：`a`，與題庫一致）
- 驗證方法：`{"kind":"legalChoice"}`
- 解釋：兵只可以斜吃對方的棋子：b8 有馬擋住所以不能直走，c8 沒有棋子可吃所以不能斜走，兵也不能後退。只有 bxa8=Q 合法。

**promotion-5**（在棋盤上走一步）

- 局面 FEN：`7k/P5pp/8/8/8/8/8/K7 w - - 0 1`
- 問題：請走一步升變，並將死黑王。
- 標準答案：**a8=Q#、a8=R#**（uci：a7a8q、a7a8r；chess.js 計算結果：a7a8q、a7a8r，與題庫一致）
- 驗證方法：`{"kind":"plays","pred":"promoMate"}`
- 解釋：黑王被自己的 g7、h7 兵困住，沿第 8 橫行的將軍無法擋住或吃掉，所以升變為后或車都是將死。

### 將死與逼和（分辨勝負與和棋）

**mate-1**（選擇題）

- 局面 FEN：`R5k1/5ppp/8/8/8/8/8/6K1 b - - 0 1`
- 問題：輪到黑方走棋。這個局面是什麼結果？
- 選項：將死 ✅　／　逼和（和棋）　／　只是被將軍，還有走法
- 標準答案：**將死**（chess.js 計算結果：`checkmate`，與題庫一致）
- 驗證方法：`{"kind":"status"}`
- 解釋：將死。黑王正被 a8 的車將軍，王無處可走（f8、h8 被車攻擊，f7、g7、h7 被自己的兵佔住），也無法擋住或吃掉車。

**mate-2**（選擇題）

- 局面 FEN：`7k/5Q2/6K1/8/8/8/8/8 b - - 0 1`
- 問題：輪到黑方走棋。這個局面是什麼結果？
- 選項：將死　／　逼和（和棋） ✅　／　只是被將軍，還有走法
- 標準答案：**逼和（和棋）**（chess.js 計算結果：`stalemate`，與題庫一致）
- 驗證方法：`{"kind":"status"}`
- 解釋：逼和。黑王沒有被將軍，但無論走到哪一格都會被攻擊，而黑方沒有其他棋子可以走。輪到的一方沒有合法步又沒有被將軍，就是和棋。

**mate-3**（選擇題）

- 局面 FEN：`4k3/8/8/8/4r3/8/8/4K3 w - - 0 1`
- 問題：輪到白方走棋。這個局面是什麼結果？
- 選項：將死　／　逼和（和棋）　／　只是被將軍，還有走法 ✅
- 標準答案：**只是被將軍，還有走法**（chess.js 計算結果：`check`，與題庫一致）
- 驗證方法：`{"kind":"status"}`
- 解釋：只是被將軍，不是將死。白王可以走到 d1、f1、d2 或 f2 避開將軍。

**mate-4**（在棋盤上走一步）

- 局面 FEN：`6k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1`
- 問題：請走一步將死黑王。
- 標準答案：**Ra8#**（uci：a1a8；chess.js 計算結果：a1a8，與題庫一致）
- 驗證方法：`{"kind":"plays","pred":"mate"}`
- 解釋：Ra8 是「底線將死」：黑王被自己的 f7、g7、h7 兵擋住去路，沒有辦法逃走。

**mate-5**（在棋盤上走一步）

- 局面 FEN：`7k/5K2/8/6Q1/8/8/8/8 w - - 0 1`
- 問題：白方佔優，但要小心逼和。請走出一步會令黑方被逼和的棋。（這是優勢方要避免的錯誤）
- 標準答案：**Qf5、Qg6**（uci：g5f5、g5g6；chess.js 計算結果：g5f5、g5g6，與題庫一致）
- 驗證方法：`{"kind":"plays","pred":"stalemate"}`
- 解釋：Qf5 或 Qg6 之後，黑王沒有被將軍，但 g8、g7、h7 都被控制，黑方無棋可走，變成和棋。贏棋時每一步之前都要檢查對方是否還有走法。

### 和棋規則（三次重複、50 步、子力不足）

**draw-1**（選擇題）

- 局面 FEN：`rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 8 5`（由開局走：Nf3 Nf6 Ng1 Ng8 Nf3 Nf6 Ng1 Ng8）
- 問題：雙方這樣來回走馬：1.Nf3 Nf6 2.Ng1 Ng8 3.Nf3 Nf6 4.Ng1 Ng8。現在同一個局面已經第三次出現，可以要求和棋嗎？
- 選項：可以 ✅　／　不可以
- 標準答案：**可以**（chess.js 計算結果：`yes`，與題庫一致）
- 驗證方法：`{"kind":"flag","name":"threefold"}`
- 解釋：可以。同一個局面（同一方走棋、棋子位置和權利都相同）出現三次，輪到走棋的一方可以要求和棋。

**draw-2**（選擇題）

- 局面 FEN：`rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 4 3`（由開局走：Nf3 Nf6 Ng1 Ng8）
- 問題：雙方這樣走：1.Nf3 Nf6 2.Ng1 Ng8。現在這個局面只是第二次出現，可以要求和棋嗎？
- 選項：可以　／　不可以 ✅
- 標準答案：**不可以**（chess.js 計算結果：`no`，與題庫一致）
- 驗證方法：`{"kind":"flag","name":"threefold"}`
- 解釋：不可以。同一個局面要出現三次才可以要求和棋，現在只是第二次。

**draw-3**（選擇題）

- 局面 FEN：`4k3/8/8/8/8/8/R7/4K3 w - - 100 80`
- 問題：雙方已經連續 50 步（共 100 個半步）沒有吃子，也沒有走兵。可以要求和棋嗎？
- 選項：可以 ✅　／　不可以
- 標準答案：**可以**（chess.js 計算結果：`yes`，與題庫一致）
- 驗證方法：`{"kind":"flag","name":"fifty"}`
- 解釋：可以。這叫「50 步規則」：連續 50 步（雙方各 50 步）既沒有吃子也沒有走兵，輪到走棋的一方可以要求和棋。吃子或走兵會令計數歸零。

**draw-4**（選擇題）

- 局面 FEN：`8/8/4k3/8/8/4K3/8/6N1 w - - 0 1`
- 問題：白方只有王和一隻馬，黑方只有王。這是子力不足的自動和棋嗎？
- 選項：是，可以和棋 ✅　／　不是
- 標準答案：**是，可以和棋**（chess.js 計算結果：`yes`，與題庫一致）
- 驗證方法：`{"kind":"flag","name":"insufficient"}`
- 解釋：是。只剩王，或者王加一隻馬／一隻象，都不可能將死對方，所以自動判和。

**draw-5**（選擇題）

- 局面 FEN：`8/8/4k3/8/8/4K3/8/5NN1 w - - 0 1`
- 問題：白方有王和兩隻馬，黑方只有王。這是子力不足的自動和棋嗎？
- 選項：是，可以和棋　／　不是 ✅
- 標準答案：**不是**（chess.js 計算結果：`no`，與題庫一致）
- 驗證方法：`{"kind":"flag","name":"insufficient"}`
- 解釋：不是。王加兩隻馬在理論上仍有可能將死（需要對方走出錯誤的棋），所以不算子力不足，對局繼續。

### 將軍的三種應對（走王、擋住、吃子）

**check-1**（在棋盤上走一步）

- 局面 FEN：`4k3/8/8/8/8/3n4/P7/4K3 w - - 0 1`
- 問題：白王被 d3 的馬將軍。請用「走王」的方式解除將軍。
- 標準答案：**Kd1、Kd2、Ke2、Kf1**（uci：e1d1、e1d2、e1e2、e1f1；chess.js 計算結果：e1d1、e1d2、e1e2、e1f1，與題庫一致）
- 驗證方法：`{"kind":"plays","pred":"kingMove"}`
- 解釋：走王：把王走到沒有被攻擊的格子。f2 被馬攻擊，所以不可以去。馬的將軍無法擋住，也無法被其他白棋吃掉，只能走王。

**check-2**（在棋盤上走一步）

- 局面 FEN：`4k3/8/8/8/8/8/5B2/4K2r w - - 0 1`
- 問題：白王被 h1 的車將軍。請用「擋住」的方式解除將軍。（用另一隻棋子擋在車與王之間）
- 標準答案：**Bg1**（uci：f2g1；chess.js 計算結果：f2g1，與題庫一致）
- 驗證方法：`{"kind":"plays","pred":"block"}`
- 解釋：擋住：把象走到 g1，擋在車與王之間。擋住只對直線攻擊（車、象、后）有用，對馬和兵的將軍沒有用。

**check-3**（在棋盤上走一步）

- 局面 FEN：`R3r1k1/8/8/8/8/8/8/4K3 w - - 0 1`
- 問題：白王被 e8 的車將軍。請用「吃掉」將軍棋子的方式解除將軍。
- 標準答案：**Rxe8+**（uci：a8e8；chess.js 計算結果：a8e8，與題庫一致）
- 驗證方法：`{"kind":"plays","pred":"capture"}`
- 解釋：吃掉：白車沿第 8 橫行吃掉 e8 的黑車，將軍即時解除。

**check-4**（選擇題）

- 局面 FEN：`4k3/8/8/8/8/3n4/8/4KB2 w - - 0 1`
- 問題：白王被 d3 的馬將軍。下面哪一種應對方式在這個局面無法使用？
- 選項：走王　／　擋住 ✅　／　吃掉將軍的棋子
- 標準答案：**擋住**（chess.js 計算結果：`block`，與題庫一致）
- 驗證方法：`{"kind":"impossible"}`
- 解釋：馬是跳著走的，中間沒有格子可以擋，所以無法擋住。這個局面可以走王，也可以用 f1 的象吃掉 d3 的馬。

**check-5**（選擇題）

- 局面 FEN：`4r1k1/8/8/8/8/3n4/8/4K3 w - - 0 1`
- 問題：白王同時被 e8 的車和 d3 的馬將軍（雙將）。可以怎樣應對？
- 選項：只能走王 ✅　／　擋住其中一個將軍就可以　／　吃掉其中一個將軍的棋子就可以
- 標準答案：**只能走王**（chess.js 計算結果：`only`，與題庫一致）
- 驗證方法：`{"kind":"onlyKing"}`
- 解釋：雙將時，擋住或吃掉一個攻擊者都無法解除另一個將軍，所以只能走王。這裡白王可以走到 d1、d2 或 f1。

## 二、一步將死（Lichess 真實 mateIn1，60 題）

題目來自 Lichess 謎題資料庫（CC0）。FEN 是對手走之前的局面；App 先自動走「對手先走」那一步，然後輪到玩家將死。接受所有能將死的走法（下表列出全部）。

| 編號 | 級 | 謎題分 | Lichess 連結 | 對手先走 | 全部將死的走法 | FEN（對手走之前） |
|---|---|---|---|---|---|---|
| fQQzO | 1 | 432 | [fQQzO](https://lichess.org/training/fQQzO) | Bxh6 | Qxh6# | `r2q1r1k/pb2n1b1/1p1pB2B/2p5/4P2P/2N5/PPPQ1PP1/2KR3R b - - 0 18` |
| hkUOl | 1 | 432 | [hkUOl](https://lichess.org/training/hkUOl) | Qxa6 | Rf1# | `5rk1/1Q5p/p5p1/8/PPP5/4n3/7P/6K1 w - - 0 37` |
| 6o5lS | 1 | 444 | [6o5lS](https://lichess.org/training/6o5lS) | h5 | Ra1# | `8/8/r4p2/5R2/7P/4k3/8/4K3 w - - 0 61` |
| j6MJE | 1 | 466 | [j6MJE](https://lichess.org/training/j6MJE) | h6 | Qh7# | `r2qrbk1/pbpp1ppp/1pn1p3/3nP3/3PQB2/2PB1N2/PP1N1PPP/R3K2R b KQ - 2 11` |
| 5oB98 | 1 | 472 | [5oB98](https://lichess.org/training/5oB98) | c4 | Qxh7# | `3r1rk1/p1q1bppp/1p6/2pbP3/5p2/1NPQ1P2/PPB3PP/R3R1K1 b - - 2 21` |
| lEraY | 1 | 482 | [lEraY](https://lichess.org/training/lEraY) | Rxg8 | Qxg8# | `1rbr2Rk/pq2bp1B/1p1p1p2/2pPP2P/P1N3Q1/2P2N2/1P3P2/2K3R1 b - - 8 27` |
| zZ4bD | 1 | 541 | [zZ4bD](https://lichess.org/training/zZ4bD) | Bxe5 | Qxh7# | `1r1q1rk1/p4ppp/2pbp3/3pN3/2pP4/2P1PPP1/PPQ3P1/R3K2R b KQ - 0 17` |
| 8iDwM | 1 | 559 | [8iDwM](https://lichess.org/training/8iDwM) | Ra2 | Qd8# | `6k1/q4ppp/8/P7/8/3Q1P2/1rr3PP/4B1RK b - - 5 33` |
| kQwbI | 1 | 568 | [kQwbI](https://lichess.org/training/kQwbI) | Bxd4 | Qxg2# | `r4rk1/1b3pbp/pp4p1/2pq4/3n4/P2PB2P/1P1NBPP1/1R1Q1RK1 w - - 2 16` |
| EGXZl | 1 | 570 | [EGXZl](https://lichess.org/training/EGXZl) | f5 | Qxg7# | `r2q1rk1/4bpp1/2b1p2p/p3B3/P1pPpPQ1/2P1P2R/2B3PP/R5K1 b - - 1 22` |
| a8rn0 | 1 | 575 | [a8rn0](https://lichess.org/training/a8rn0) | Na5 | Qh7# | `r1bq1rk1/5pp1/p1n2b1p/1pp1p1N1/2PpQ3/1B1P4/PP3PPP/R1B2RK1 b - - 1 16` |
| waKlr | 1 | 576 | [waKlr](https://lichess.org/training/waKlr) | hxg6 | Qxg6# | `rn1qkb1r/pb1p3p/1p1Pp1N1/3np2Q/8/8/PP3PPP/RNB1KB1R b KQkq - 0 11` |
| aTcRY | 1 | 639 | [aTcRY](https://lichess.org/training/aTcRY) | Rxd8 | Rf7# | `3Q4/2R5/8/4p1p1/5k2/3r1P2/5K2/8 b - - 0 40` |
| wcocX | 1 | 648 | [wcocX](https://lichess.org/training/wcocX) | Bxd5 | Rc1# | `2r2k2/R3pp2/8/3b4/1pBPn3/1P6/5r1P/4K2R w K - 0 25` |
| i545h | 1 | 674 | [i545h](https://lichess.org/training/i545h) | Nxc5 | Nxc2# | `2kr2nr/ppp4p/4b3/2q5/3n4/P2N4/1PP1PPPP/RN2KB1R w KQ - 0 14` |
| l3L2y | 2 | 682 | [l3L2y](https://lichess.org/training/l3L2y) | Rb8 | Re8# | `r1b2k2/ppN2pbp/2n3p1/2p5/8/7P/PPP2PP1/R3R1K1 b - - 2 18` |
| aAYXZ | 2 | 687 | [aAYXZ](https://lichess.org/training/aAYXZ) | Kh2 | Rh5# | `8/pR2R1pp/1pp3k1/5r2/5P2/P1P3P1/Bb4P1/3r3K w - - 1 29` |
| Depzm | 2 | 694 | [Depzm](https://lichess.org/training/Depzm) | Kg4 | Rg1# | `8/8/5k2/6p1/5n1p/5PK1/7P/R2B3r w - - 0 51` |
| DNkgl | 2 | 707 | [DNkgl](https://lichess.org/training/DNkgl) | Qf4 | Qxg2# | `r1b2rk1/1pp2pbp/p3p1p1/3pB1q1/3PP2n/P1NN1Q2/1PP2PPP/R3R1K1 w - - 1 15` |
| 6VWOG | 2 | 718 | [6VWOG](https://lichess.org/training/6VWOG) | Rxb1 | Bxc3# | `r5k1/pp3ppp/2n2b2/8/8/P1P1Pq1P/5P1B/1b1RKQR1 w - - 0 24` |
| pSxlE | 2 | 732 | [pSxlE](https://lichess.org/training/pSxlE) | dxc6 | Qxf2# | `r3kb1r/pp2ppp1/1qp2n2/1B1P2Bp/6n1/2N2N2/PPP2PP1/R2QK2R w KQkq - 0 12` |
| K3nqS | 2 | 736 | [K3nqS](https://lichess.org/training/K3nqS) | Nxg3 | Qxh6# | `r5rk/p7/1p2pp1p/n4npQ/P1Pq4/6B1/3N1PPP/R2R2K1 b - - 3 24` |
| vqTMW | 2 | 771 | [vqTMW](https://lichess.org/training/vqTMW) | O-O-O | Qxb2# | `r1b1k2r/pp2Bpb1/1n1P2pp/2p1q3/2P5/8/PP1NQ1PP/R3KB1R w KQkq - 0 15` |
| 8hVcI | 2 | 789 | [8hVcI](https://lichess.org/training/8hVcI) | g3 | Qxf2# | `2r3k1/4Rpbp/3p2p1/1N1P4/5q2/1R1Q3P/5PPK/2r5 w - - 3 28` |
| l8NGi | 2 | 807 | [l8NGi](https://lichess.org/training/l8NGi) | Bxe7 | Qxg2# | `r1b1k1r1/ppp1npqp/8/2b3B1/2pp4/5N2/PPP2PPP/RN1QR1K1 w q - 0 12` |
| 5jZtI | 2 | 835 | [5jZtI](https://lichess.org/training/5jZtI) | Qxe3 | Qb2# | `r3k2r/pp3pp1/4p3/3pPPP1/6Bp/qPpPn2P/P1P2Q2/1K4RR w kq - 0 24` |
| UJRGE | 2 | 837 | [UJRGE](https://lichess.org/training/UJRGE) | gxf3 | Qxh2# | `N4rk1/1p3ppp/p1nb3q/8/3P4/3BPb2/PP3PPP/R2Q1RK1 w - - 0 14` |
| R4UAb | 2 | 848 | [R4UAb](https://lichess.org/training/R4UAb) | b2 | Rb8# | `4k3/1R6/4K3/3P3p/5P2/1p6/8/1r6 b - - 5 51` |
| Uo3nA | 2 | 867 | [Uo3nA](https://lichess.org/training/Uo3nA) | Kc1 | Qa3# | `2k4r/ppp1qppp/1r6/7b/4Q3/4PP1P/PKPB1PB1/3R3R w - - 1 17` |
| z0xVV | 2 | 894 | [z0xVV](https://lichess.org/training/z0xVV) | Qxe8 | Qg7# | `rnb1N1kr/ppp4p/4qPpQ/2b5/2p5/2P5/P2B1nPP/RN3K1R b - - 1 19` |
| eSgaa | 3 | 904 | [eSgaa](https://lichess.org/training/eSgaa) | dxe5 | Qf7# | `r2q1bkr/pppb2pp/3p4/2n1R1N1/3p4/5Q2/PPP2PPP/RNB3K1 b - - 0 12` |
| pPugs | 3 | 912 | [pPugs](https://lichess.org/training/pPugs) | Qxf7 | Bxf7# | `3rkb1r/1R3Qpb/pn3q1p/2p4P/2B1P3/2P3N1/P4PP1/2B2RK1 b k - 0 19` |
| A5FZU | 3 | 940 | [A5FZU](https://lichess.org/training/A5FZU) | a3 | Be7# | `1r6/5pp1/5k1p/1p1p3P/pBnP2P1/2PK1P2/4R3/8 b - - 22 50` |
| lwRdC | 3 | 946 | [lwRdC](https://lichess.org/training/lwRdC) | Kf8 | Qh8# | `6k1/4rp2/p1r1pQp1/3pP3/8/2P2R2/5PPK/1q6 b - - 1 33` |
| 9XlXO | 3 | 987 | [9XlXO](https://lichess.org/training/9XlXO) | Kg7 | Qh6# | `r2qbr2/4p2k/3pBp2/3p2P1/pP1BP3/7Q/P4P2/4K3 b - - 1 29` |
| qUi0T | 3 | 992 | [qUi0T](https://lichess.org/training/qUi0T) | Bxe1 | Qf1# | `r5k1/ppp2ppp/8/8/8/2Pq1B2/PP1B1bPP/RN1Qr2K w - - 2 17` |
| wWkTn | 3 | 1012 | [wWkTn](https://lichess.org/training/wWkTn) | Ke6 | Re7# | `8/1p1R1kp1/p2p3p/3Np1r1/1P1nP2K/7P/8/8 b - - 3 37` |
| j0xBu | 3 | 1013 | [j0xBu](https://lichess.org/training/j0xBu) | Rg8 | Rd8# | `2k2b1r/1rp2Npp/4pn2/1p6/5B2/2N5/PPP3PP/2KR4 b - - 0 15` |
| 49D2N | 3 | 1015 | [49D2N](https://lichess.org/training/49D2N) | Kd3 | Rd2# | `8/pp5R/1kp2p2/3p4/2n1QN2/2P1P3/PPK2r2/8 w - - 0 37` |
| K9FDW | 3 | 1029 | [K9FDW](https://lichess.org/training/K9FDW) | Rd5 | Qxc2# | `2q2nQ1/1r1pk2p/p2R1pp1/1p2p3/3nP2N/P5P1/1PP2P1P/2KR4 w - - 2 25` |
| 5iTQQ | 3 | 1032 | [5iTQQ](https://lichess.org/training/5iTQQ) | Kd3 | Rd2# | `5k2/3Q4/1B4p1/pP2PpP1/Pb2r3/2K5/r6P/8 w - - 1 45` |
| l8EUN | 3 | 1041 | [l8EUN](https://lichess.org/training/l8EUN) | Kf2 | Qg3# | `5r1k/5pb1/5Np1/2P1P1qp/4Q3/P2pB2P/1P2n1P1/5RK1 w - - 8 42` |
| zZw3D | 3 | 1105 | [zZw3D](https://lichess.org/training/zZw3D) | Nd7 | Qe7# | `r3k2r/5pp1/5n2/p2qp1Q1/3p3p/B7/PPP2PPP/R3R1K1 b kq - 1 18` |
| Zyf6z | 3 | 1110 | [Zyf6z](https://lichess.org/training/Zyf6z) | gxh6 | Qxh7# | `r3nrk1/pRQ3pp/7N/3p4/3q4/3B3P/5PPK/8 b - - 2 31` |
| dmSjb | 3 | 1113 | [dmSjb](https://lichess.org/training/dmSjb) | Bxf6 | Qxg2# | `r4rk1/pb3ppp/1p2pn2/2b3N1/8/1P1B2qP/PBP2PP1/R2Q1RK1 w - - 2 16` |
| FEisj | 4 | 1131 | [FEisj](https://lichess.org/training/FEisj) | f3 | Rh1# | `8/8/1p1r2p1/7p/5p1k/P2r4/1PK3R1/5R2 b - - 1 42` |
| 8pzv8 | 4 | 1156 | [8pzv8](https://lichess.org/training/8pzv8) | Ra7 | Bg4# | `8/6p1/5p2/Rp2pK1k/pP2P2P/4P3/4b3/8 w - - 3 38` |
| wBYsq | 4 | 1161 | [wBYsq](https://lichess.org/training/wBYsq) | Bd7 | Nf6# | `r1bqkb1r/pp2np1p/6p1/3Np3/Q1B1P3/8/PP3PPP/R1B1K2R b KQkq - 2 11` |
| TAPaU | 4 | 1224 | [TAPaU](https://lichess.org/training/TAPaU) | Kxf8 | Qd8# | `5Rk1/2Q2pp1/7p/p7/8/1P1p3P/q5PK/8 b - - 0 30` |
| n5qt5 | 4 | 1230 | [n5qt5](https://lichess.org/training/n5qt5) | exd8=Q | Qxg2# | `3rr2k/p3P1pp/1p4q1/1Q6/4b3/1B6/PP3PPP/R5K1 w - - 0 24` |
| X8XHQ | 4 | 1245 | [X8XHQ](https://lichess.org/training/X8XHQ) | Kxe6 | Qd5# | `5r1r/p3p1q1/2PkP3/4b3/1p6/P3PQPp/7K/3R1R2 b - - 2 34` |
| CLmMD | 4 | 1254 | [CLmMD](https://lichess.org/training/CLmMD) | d8=Q | Re6# | `5n2/3PK1k1/r6p/4N1p1/8/6P1/4R2P/8 w - - 9 56` |
| MQzAW | 4 | 1278 | [MQzAW](https://lichess.org/training/MQzAW) | Kxa2 | Ra8# | `5rk1/4bpp1/3p3p/1p1Pp3/1q2Q1PP/3B4/r1P2P2/K2R3R w - - 0 25` |
| nHGXA | 4 | 1291 | [nHGXA](https://lichess.org/training/nHGXA) | Nxg5 | Qd6# | `r4b1r/ppN1kppp/2n1b3/3QP1B1/4n3/P4N2/1PP2qPP/R2K1B1R b - - 5 13` |
| ZbmNs | 4 | 1348 | [ZbmNs](https://lichess.org/training/ZbmNs) | Re8 | Qh8# | `r1bq1rk1/pp1n2p1/4p1P1/3p3Q/5p2/2P5/PP3PP1/R3K2R b KQ - 0 17` |
| dtDSk | 4 | 1369 | [dtDSk](https://lichess.org/training/dtDSk) | Kh2 | Rh1# | `8/p7/5rpk/4R2p/4Q2P/P3PqP1/3R1P2/2r3K1 w - - 1 45` |
| qzrwW | 4 | 1373 | [qzrwW](https://lichess.org/training/qzrwW) | Rae1 | Qxh2# | `4r1k1/ppQ2pp1/8/4P3/5Pb1/2P3Pp/PP1rq2P/R4RKB w - - 1 25` |
| hHv24 | 4 | 1376 | [hHv24](https://lichess.org/training/hHv24) | Kg8 | Qe6# | `r2qnb1r/1pp2kpp/p1np4/3NPQ2/3P4/8/PPP2PPP/R1B2RK1 b - - 6 13` |
| 1wMwl | 4 | 1387 | [1wMwl](https://lichess.org/training/1wMwl) | Qe4 | Qh5# | `R7/5Qpk/1p6/2pP1pp1/2P4q/2P3P1/5K1P/4r3 b - - 0 34` |
| QVYCU | 4 | 1397 | [QVYCU](https://lichess.org/training/QVYCU) | Kh5 | Qg5# | `3Q4/8/p3r1k1/5p2/2q1r2P/6B1/P5PK/8 b - - 3 42` |

## 三、找出將軍（20 題）

列出該局面全部能將軍的走法（走棋一方見「走棋」欄）。

| 編號 | 走棋 | FEN | 將軍數 | 全部將軍的走法 |
|---|---|---|---|---|
| ck-01 | 黑 | `2b1kb1r/1rqppp1p/p5pn/1pB1PP2/1np1B1PP/1P6/2PPN3/RN1QK1R1 b Qk - 5 16` | 2 | Nxc2+、Nd3+ |
| ck-02 | 白 | `rn1q1b2/1p1bk1p1/p1pNp2r/7p/P1B2PP1/4PP2/1PPP1K1R/R1BQ2N1 w - - 1 14` | 2 | Nc8+、Nf5+ |
| ck-03 | 黑 | `rn1qkb1r/4pp1p/p1p2np1/1pPp1b2/1P6/P3PP2/3P1KPP/RNBQ1BNR b kq - 2 8` | 2 | Ne4+、Ng4+ |
| ck-04 | 白 | `rn3b1r/p2qpkpp/1pp4n/4Bp2/1P1Pb3/2P2PPP/P1QNBK2/R5NR w - - 0 15` | 2 | Qb3+、Bc4+ |
| ck-05 | 黑 | `3qkbn1/1bppp1p1/r1n2p2/pp6/P1PNPPp1/7r/QP1P4/RNB2K1R b - - 0 17` | 2 | Rf3+、Rxh1+ |
| ck-06 | 白 | `rnq1k2r/1pp3bp/4p2n/p2p2p1/b3Qp1P/PP1PPN2/2P2PP1/R1B1KBNR w KQkq - 1 12` | 3 | Qxa4+、Qxe6+、Qg6+ |
| ck-07 | 黑 | `r1bqkb1r/1p1ppppp/p1n5/2p3N1/2N3P1/1P2Pn2/P1P1KP1P/R1BQ1B1R b kq - 0 8` | 3 | Ncd4+、Nfd4+、Ng1+ |
| ck-08 | 白 | `1rbq1knr/p2n3p/3p1pp1/1pp3B1/3Q2P1/NP3N1P/P1P1PP2/R3KB1R w KQ - 1 12` | 3 | Qxd6+、Qxf6+、Bh6+ |
| ck-09 | 黑 | `4kbn1/1bp2p1p/r2p1Bp1/pP6/2N1n1PP/3Pq3/P1P1PP2/1R1QK1NR b K - 0 15` | 3 | Qd2+、Qxe2+、Qxf2# |
| ck-10 | 黑 | `1rb1rB2/pppp1kpp/7n/4pP2/N5Pq/1P1P1B1N/P2P1P1P/R2Q1RK1 b - - 0 15` | 3 | Qxf2+、Qg3+、Qxg4+ |
| ck-11 | 白 | `1rb2br1/pp3ppp/3ppk1P/2p1n1Nq/1P1P1P2/P1P1B1P1/5K2/RN1Q1B1R w - - 0 15` | 4 | dxe5+、fxe5+、Ne4+、Nxh7+ |
| ck-12 | 黑 | `r1b1k2r/p1p1qp2/3p3P/1p2n3/N2PPp1n/1N4P1/1bPB1K2/R2Q1BR1 b kq - 2 17` | 4 | Bxd4+、Nd3+、Ng4+、fxg3+ |
| ck-13 | 白 | `r2qkb1r/2pn1n1p/bp1P2p1/pP2pQ2/3P2P1/4P2B/P4P1P/RNB1K1NR w kq - 1 14` | 4 | Qxd7+、Qxe5+、Qe6+、Qxf7+ |
| ck-14 | 白 | `5bnr/p2n1kp1/5p1p/q1p5/Q3Pp1P/NpP2B1b/PP1P2P1/R1B1K1NR w KQ - 2 19` | 4 | Qxb3+、Qc4+、Qxd7+、Bh5+ |
| ck-15 | 白 | `1n1qkbn1/2pbp1p1/2rBQ3/p4p1p/P2P3P/4r1P1/RPpNPP2/2K2BNR w - - 3 19` | 4 | Qxd7+、Qxe7+、Qf7+、Qg6# |
| ck-16 | 黑 | `1n1k2nr/1r1b3p/3b1pp1/p1pppqN1/PPp1PB2/R2P2K1/3N1PPP/4QB1R b - - 1 18` | 5 | exf4+、Qxf4#、Qg4#、Qxg5+、Qh3+ |
| ck-17 | 白 | `r1b1qbnr/p2kppp1/Bpnp4/2pQ3p/P3P3/R1P5/1P1P1PPP/1NB1K1NR w K - 0 10` | 5 | Bxc8+、Qxc6+、Qxd6+、Qe6+、Qf5+ |
| ck-18 | 黑 | `rnb2kn1/pp1p1p2/4p2b/r1p3pp/PqPP2P1/3KBB1P/2Q1PP2/RN4NR b - - 3 15` | 5 | Qa3+、Qb3+、Qc3+、Qxc4+、Qd2+ |
| ck-19 | 白 | `r1bq3r/1ppp1kb1/2n1p3/pn3p1p/2P1N3/PP2PN2/5KPP/R1BQ1B1R w - - 2 18` | 5 | Qxd7+、Nd6+、Neg5+、Ne5+、Nfg5+ |
| ck-20 | 白 | `1rb1kb1r/ppp2qpp/n2p3n/1N1Ppp2/Q7/2P4B/PP2PP1P/R3BKNR w k - 1 13` | 5 | Na3+、Nxa7+、Nxc7+、Nd4+、Nxd6+ |

## 四、騎士迷宮（15 關）

白馬（N）、黑棋用小寫字母（r 車、b 象、q 后、n 馬、p 兵）；星的位置另列。最少步數由 BFS 計出，並附一條最短路徑。

| 關 | 起點 | 星 | 黑棋 | 最少步數 | 最短路徑 |
|---|---|---|---|---|---|
| 1 | f8 | b7、e6 | bd4、ng1、rh3、nh8 | 3 | f8→e6→d8→b7 |
| 2 | a7 | c7、d4 | ra2、ba3、pc3、rf6、bg4 | 4 | a7→b5→c7→b5→d4 |
| 3 | c6 | f3、g1、h3 | pd4、ne6、bf7、nh7 | 4 | c6→e5→f3→g1→h3 |
| 4 | f3 | d1、f2 | qb4、rb5、rh7、bh8 | 6 | f3→g1→e2→c1→d3→f2→d1 |
| 5 | h8 | a6、b4 | pd6、bd8、ne6 | 7 | h8→f7→h6→g4→f2→d3→b4→a6 |
| 6 | h4 | d6、e3 | ra5、nc6、bg2、bh8 | 8 | h4→g6→f4→d3→f2→g4→e3→c4→d6 |
| 7 | d2 | e2、e6、e8 | rb5、bc2、bg1、pg4 | 7 | d2→f1→g3→e2→f4→e6→g7→e8 |
| 8 | g7 | a3、e7、f4 | na8、bc8、ne4、bf2 | 8 | g7→h5→f4→g6→e7→g6→e5→c4→a3 |
| 9 | f6 | b7、e6、g6、g8 | qa1、rd4、bf2 | 7 | f6→g8→e7→g6→f8→e6→c5→b7 |
| 10 | d6 | c4、f2、f4、g5 | qb7、rh1、bh5 | 8 | d6→c4→e5→d3→f2→d3→f4→e6→g5 |
| 11 | c2 | b3、e2、h2 | ra5、nb6、nd3、qd8 | 10 | c2→e3→g4→h2→f1→g3→e2→g3→f1→d2→b3 |
| 12 | c8 | e6、f2、g1 | bd6、bf1 | 11 | c8→b6→d7→f6→g4→f2→e4→g5→e6→g5→f3→g1 |
| 13 | c4 | a1、f1 | na2、qd2、rh6 | 13 | c4→a3→b5→c7→e8→g7→f5→g3→f1→g3→e4→c5→b3→a1 |
| 14 | e3 | a4、b5、b8、c1 | bd8、rh2 | 12 | e3→f5→d4→b3→c1→d3→c5→a4→c3→b5→d4→c6→b8 |
| 15 | g3 | b2、c2、g5、h4 | bc7、bc8、rd6、qf7、ng7 | 14 | g3→e4→g5→e4→c3→a4→b2→a4→c3→b1→a3→c2→e3→g2→h4 |


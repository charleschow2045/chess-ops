# 第 2 階段內容抽查清單

由 `node tools/gen-stage2-content.js` 自動產生（固定種子）。

## 一、隨機抽 30 題謎題（每個主題 4 題，另外隨機 2 題）

- 「玩家」是要走棋的一方（FEN 是對手走之前的局面，所以玩家是 FEN 輪到走棋方的對方）。
- 「答案」是 Lichess 的標準答案（含對手回應的步，以「→」分隔）；玩家走出不同但同樣將死的步，App 一樣當答對。
- 點 Lichess 連結可以在網站上核對同一題。

| # | Lichess 連結 | 謎題分 | 主題 | 玩家 | 對手先走 | 答案 | FEN（對手走之前） |
|---|---|---|---|---|---|---|---|
| 1 | [oAac6](https://lichess.org/training/oAac6) | 584 | 送子 Hanging Piece、一步殺 Mate in 1 | 白 | Nxd4 | Rxe8# | `r1b1r1k1/1p3ppp/p1np4/2n5/3N4/1P1P1B2/PBP3PP/4RRK1 b - - 1 17` |
| 2 | [Jzcim](https://lichess.org/training/Jzcim) | 559 | 送子 Hanging Piece、一步殺 Mate in 1 | 白 | Qxe8 | Qxe8# | `r1b1R1k1/p1Pq1ppp/1p1p4/n2P4/Q4B2/8/PPP2PPP/6K1 b - - 2 19` |
| 3 | [l0hzA](https://lichess.org/training/l0hzA) | 570 | 送子 Hanging Piece、一步殺 Mate in 1 | 黑 | Rc1 | Qxc1# | `k1r5/p1B2p2/1p5p/3b3P/Q4PP1/P1R5/1P6/K3q3 w - - 2 43` |
| 4 | [yI0CY](https://lichess.org/training/yI0CY) | 771 | 送子 Hanging Piece、兩步殺 Mate in 2 | 黑 | Rxe8 | Rxd1+ → Re1 → Rxe1# | `4r3/5kpp/p7/q2r4/1p6/7Q/1P3PPP/3RR1K1 w - - 0 28` |
| 5 | [eSgaa](https://lichess.org/training/eSgaa) | 904 | 一步殺 Mate in 1 | 白 | dxe5 | Qf7# | `r2q1bkr/pppb2pp/3p4/2n1R1N1/3p4/5Q2/PPP2PPP/RNB3K1 b - - 0 12` |
| 6 | [K9FDW](https://lichess.org/training/K9FDW) | 1029 | 一步殺 Mate in 1 | 黑 | Rd5 | Qxc2# | `2q2nQ1/1r1pk2p/p2R1pp1/1p2p3/3nP2N/P5P1/1PP2P1P/2KR4 w - - 2 25` |
| 7 | [JsgX8](https://lichess.org/training/JsgX8) | 726 | 一步殺 Mate in 1 | 白 | Bc7 | Qxf7# | `r1bq1k1r/pp3pp1/2nb1n2/2P1p1N1/3p4/1Q2B1Pp/PP1NPP1P/R3KB1R b KQ - 0 13` |
| 8 | [Zc98f](https://lichess.org/training/Zc98f) | 1296 | 一步殺 Mate in 1 | 白 | Kf8 | Qe7# | `4b1k1/1Q5p/3P2p1/3Bp1P1/1p5P/3qP3/7K/8 b - - 2 55` |
| 9 | [CVTei](https://lichess.org/training/CVTei) | 931 | 捉雙 Fork、兩步殺 Mate in 2 | 白 | Bh6 | Qxf7+ → Kh8 → Qxh7# | `r2qr1k1/1b3pbp/p5p1/1p4N1/2pPpQ2/1PP4P/P4PP1/RN2R1K1 b - - 1 21` |
| 10 | [tPIcm](https://lichess.org/training/tPIcm) | 1304 | 捉雙 Fork、兩步殺 Mate in 2 | 白 | Ke7 | Qxd7+ → Kf8 → Nxe6# | `r3k2r/pb1p3p/2p1pNp1/2b3N1/P4PnP/q7/2P1P1P1/3QKB1R b Kkq - 0 17` |
| 11 | [kBOLS](https://lichess.org/training/kBOLS) | 888 | 捉雙 Fork | 黑 | h6 | Nc4+ → Kxb3 → Nxd6 | `5k2/6pp/rp1R1p2/n3p2P/P7/1pP1P3/1K3PP1/7R w - - 2 24` |
| 12 | [TwnDr](https://lichess.org/training/TwnDr) | 571 | 捉雙 Fork、兩步殺 Mate in 2 | 黑 | Rxf6 | Re1+ → Rf1 → Rxf1# | `4r1k1/2p4b/p2p1qpb/1p1P4/1PP3Q1/P7/6PP/1B3R1K w - - 0 36` |
| 13 | [kRG9h](https://lichess.org/training/kRG9h) | 867 | 牽制 Pin | 黑 | c4 | Rb7 → Kc2 → Rxb4 | `8/3rk1pp/2Rn1p2/4p3/1B5P/8/2P2PP1/1K6 w - - 8 35` |
| 14 | [s9vXV](https://lichess.org/training/s9vXV) | 1296 | 兩步殺 Mate in 2、牽制 Pin | 白 | Rxf4 | Re7+ → Rf7 → h6# | `3R4/pp4kp/1r3rp1/2n3PP/5Q2/8/PPP2P2/2K1R3 b - - 0 31` |
| 15 | [bslpH](https://lichess.org/training/bslpH) | 765 | 一步殺 Mate in 1、牽制 Pin | 白 | Rxg7 | Rf8# | `6rk/ppp3Qp/2b5/4B3/8/8/P1q3PP/5R1K b - - 0 25` |
| 16 | [sXpLt](https://lichess.org/training/sXpLt) | 501 | 兩步殺 Mate in 2、牽制 Pin | 白 | Rxf7 | Rc8+ → Qe8 → Rxe8# | `5rk1/5Qpp/p7/1p2q3/8/P5P1/BP5P/2R3K1 b - - 0 27` |
| 17 | [iqlGS](https://lichess.org/training/iqlGS) | 527 | 兩步殺 Mate in 2 | 白 | Rxf8 | Qxf8+ → Rxf8 → Rxf8# | `r3rB1k/pp3Qpp/1q2p3/2n1P3/3pP1P1/8/PP5P/R4RK1 b - - 2 22` |
| 18 | [JGRa8](https://lichess.org/training/JGRa8) | 1195 | 兩步殺 Mate in 2 | 黑 | Nd5 | Nd3+ → Kd1 → Qg4# | `1Q6/5p2/1Nkpqp2/p7/1PP1pP2/4P1P1/P4n1r/4K1R1 w - - 7 39` |
| 19 | [4NB9y](https://lichess.org/training/4NB9y) | 750 | 兩步殺 Mate in 2 | 黑 | Kf1 | Re1+ → Rxe1 → dxe1=Q# | `6k1/5p1p/P5p1/2P1r3/1P6/2b3P1/R1Pp1PP1/3R2K1 w - - 1 30` |
| 20 | [QqYg0](https://lichess.org/training/QqYg0) | 599 | 兩步殺 Mate in 2 | 黑 | Rfe1 | Rxe1+ → Rxe1 → Qxe1# | `6k1/bp3pp1/p2Nq3/2P1r2p/1P4nP/8/P1Q2PP1/3R1RK1 w - - 2 23` |
| 21 | [iZ8sr](https://lichess.org/training/iZ8sr) | 691 | 串擊 Skewer | 白 | b4 | Rh8+ → Kf7 → Rxb8 | `1r3k2/8/5P1R/1p1n4/6p1/6K1/5P2/8 b - - 0 43` |
| 22 | [K5u6H](https://lichess.org/training/K5u6H) | 1080 | 串擊 Skewer | 白 | h5 | Qa8+ → Kd7 → Qxh8 | `2k4r/p1p3pp/3b2r1/3Qp1q1/8/3P2P1/PPP2P1P/4RRK1 b - - 0 17` |
| 23 | [0QFfu](https://lichess.org/training/0QFfu) | 694 | 串擊 Skewer | 白 | Bb4 | Re8+ → Kc7 → Rxa8 | `r2k1bnr/pp3ppp/8/1B1p1p2/8/1P5P/P1KN2P1/R3R3 b - - 1 18` |
| 24 | [fBnTF](https://lichess.org/training/fBnTF) | 720 | 串擊 Skewer | 白 | Rh1 | Rh8+ → Kg4 → Rxh1 | `6R1/8/3K4/7k/8/7r/8/8 b - - 1 67` |
| 25 | [yokJ4](https://lichess.org/training/yokJ4) | 815 | 閃擊 Discovered Attack | 白 | Nd2 | Nd6+ → Rxd6 → Rxe8+ | `2krr3/pp3ppp/2p5/5P2/2n1N3/7P/PPP2K2/R3R3 b - - 4 24` |
| 26 | [01VZi](https://lichess.org/training/01VZi) | 1239 | 閃擊 Discovered Attack | 黑 | Qe4 | b3 → axb3 → Qxd2 | `2r3k1/2r2p2/p5p1/q5Pp/1p3P1P/8/PPPRQ3/1K3R2 w - - 0 32` |
| 27 | [fFkbT](https://lichess.org/training/fFkbT) | 1085 | 閃擊 Discovered Attack | 白 | g5 | Bxg5+ → Kg6 → Qh6+ → Kf7 → Qf6# | `4r1q1/7k/p3n1pB/1p3p2/2nP3Q/P1P3P1/1P3P1P/6K1 b - - 4 33` |
| 28 | [cmIwL](https://lichess.org/training/cmIwL) | 579 | 閃擊 Discovered Attack | 白 | Na5 | Bxh7+ → Kxh7 → Rxd8 | `3r2k1/1n3ppp/p3p3/1p6/8/2PBPP2/P4P1P/3R2K1 b - - 2 20` |
| 29 | [kKKnC](https://lichess.org/training/kKKnC) | 521 | 兩步殺 Mate in 2 | 黑 | Nxb4 | Rc1+ → Rxc1 → Rxc1# | `2r5/1kr2p2/Np2p3/3p1p2/1q1P4/b2RP1P1/P3QP1P/K6R w - - 1 28` |
| 30 | [YOVw9](https://lichess.org/training/YOVw9) | 1368 | 牽制 Pin | 白 | Bxd4 | Bd6 → Bc5 → Bxc7+ | `1kr4r/1bqn1pp1/ppp1Rb1p/8/2QN1P2/BP4P1/P1PP2BP/2KR4 b - - 0 17` |

（資料庫共 2450 題，來源與篩選條件見 `docs/THIRD_PARTY.md` 和 `docs/stage2-report.md`。）

## 二、規則快測 check-5（新題目）

- 局面 FEN：`4r1k1/8/8/8/8/3n4/8/4K3 w - - 0 1`
- 題目：白王同時被 e8 的車和 d3 的馬將軍（雙將）。可以怎樣應對？
- 選項：只能走王 ✅　／　擋住其中一個將軍就可以　／　吃掉其中一個將軍的棋子就可以
- 解釋：雙將時，擋住或吃掉一個攻擊者都無法解除另一個將軍，所以只能走王。這裡白王可以走到 d1、d2 或 f1。
- chess.js 驗證：白王被將軍＝true；全部合法步＝Kd2、Kf1、Kd1；是否全部是王的步＝true；答案計算結果＝`only`


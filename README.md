# 記帳道場 — 経理の実務知識レベルチェック（LMJスタッフ向け）

簿記の基本は分かっていて現場で経理をしている人が、**一般的な会計の実務知識**（取引の見方・日々の仕訳・消費税・給与と社保・固定資産・月次チェック・決算整理・BS/PLの読み方）を場面から考えて身につける静的Webアプリ。最初に20問の実力診断で分野ごとの得意・苦手を見える化し、8章・28ステージをゲーム形式で進む。問題ごとに Codex（image2）で生成したマンガ風の1コマ絵を添える。進捗は「名前＋4桁の合言葉」で本人に紐づけ、端末（localStorage）と指導者用の Google スプレッドシートに記録し、別の端末でも復元できる。

v1（2026-10-15、記帳エンジンの監査ルールを元にした7章版）は 2026-10-18 の石島さんの指摘で作り直した。v1 の問題・図解は使っていない。

- 公開URL：https://livemissionjapan.github.io/mf-kicho-dojo/ （GitHub Pages・独立リポジトリ `livemissionjapan/mf-kicho-dojo`）
- 進捗スプレッドシート：https://docs.google.com/spreadsheets/d/1CUeTd0LeKLGeB3JlTae5KYr-KZgq1eEJQo_4hBDkp74/edit （石島さんのDrive。タブ：README／進捗ログ／ダッシュボード）
- GAS（スプレッドシートに紐づくスクリプト）：https://script.google.com/d/17Y8Rzez51fSCFVXK1jhLWccIFRo5UgJrIDLz-lzw9bW2UGY0G4cB1YPF/edit
- 作成：2026-10-15。対象＝LMJのスタッフ。重み付け＝考え方重視（石島さん決定）

## 構成

| ファイル | 中身 |
|---|---|
| `index.html` | 画面の骨組み（名前／ワールドマップ／章／ステージ／結果）。`window.GAS_URL` をここで設定 |
| `css/app.css` | 見た目。ライト／ダーク対応。図解用のCSS変数 `--d-*` もここ |
| `js/app.js` | 進行・実力診断・出題（6タイプ）・採点・クリア判定・「むずかしかった」の印・結果 |
| `js/store.js` | localStorage（版キー `kicho-dojo:v2`）、未送信キュー、サーバー記録の取り込み（merge） |
| `js/sheet.js` | GAS との通信（`restore` で名前＋合言葉の記録を取得、POST は no-cors、`ack` で受領確認） |
| `js/diagrams.js` | 図解10枚（インラインSVG＋操作）。`data-link` が同じ要素は一緒に光る |
| `data/curriculum.js` | 分野・実力診断・章・ステージ・図解と画像の対応。問題タイプの契約と画像の共通スタイルもここ |
| `data/questions-a.js` / `questions-b.js` / `questions-add-1〜4.js` | 問題バンク（a：診断＋1〜3章の a〜c、b：4〜8章の a〜c、add-1〜4：各ステージの d〜j）。2026-10-27 から各ステージ10問・合計300問。各問に `field`・`scene`・`explainScene`・`source` |
| `img/<id>.jpg` | 画像（章 `c1`…、ステージ `s1-1`…、問題 `q1-1-a`…、診断 `diag`）。`scripts/gen_images.py` で生成 |
| `gas/Code.js` | doPost（受講者の合言葉を確かめて進捗ログに追記・logId で二重防止）／doGet（restore・ack・ping・setup） |

ビルド不要。外部依存は Google Fonts だけ。

## 入口と財務ルート（2026-10-19 追加）

ログイン（名前＋合言葉）の後は入口（`#track`）で「経理を学ぶ」「財務を学ぶ」を選ぶ。経理＝これまでのワールドマップ、財務＝財務アドバイザー・カルロさんの考え方（`#finance`）。

| ファイル | 中身 |
|---|---|
| `data/finance.js` | 財務ルートの中身（一般化版）：セッション一覧・思考回路の5段・視点11・思考の実演・知識カード・盗める型 |
| `js/finance.js` | 入口と財務ルートの画面。視点を押すと発言の一覧（ダイアログ） |
| `data/finance-images.json` | 財務ルートの画像17枚の場面（入口 `t-keiri`/`t-zaimu`、`f-hero`、視点 `f-<視点id>`、思考の実演 `f-t1`〜）。`python3 scripts/gen_images.py --input data/finance-images.json --skip-existing` |

- **公開リポジトリなので、顧客名・実金額・録音IDは入れない。** 発言は金額を抜いた言い換え、制度の数字（税率・上限・期限）だけ残す
- 実際の会議の数字が入った版はローカルの `lmj/30_開発/Webサイト/carlo-board`（非公開）。新しいセッションはまず carlo-board に入れ、一般化して `data/finance.js` に足す
- 財務ルートの閲覧は進捗ログに記録しない（今は読むだけ）

## 対象と書き方（v2）

- 対象：簿記の基本は分かっていて、現場で経理をやっている人（LMJのスタッフ）
- 問題は「場面から始める・1問1論点・選択肢は現場でやりがちな誤り・解説は『なぜ』＋『現場ではこう見る』」。AI向けの運用用語（確認に回す・自動登録・判定4区分）やルールIDは使わない
- `source` は `curriculum.js` の `sources` のキー（簿記／会計実務／消費税／インボイス／給与実務／税務／月次／決算）

## v1 のときの出典（参考・v2 では元ネタにしない）

| 出典ID | ファイル |
|---|---|
| `rules.md A1〜F3` | `project/lmj-standards/skills/accounting-audit/references/rules.md`（2026-09-29版・36項目） |
| `共通 C2〜C10` | `project/mf-engine/_共通ルール/仕訳ナレッジ_共通.md` |
| `SKILL` | `project/lmj-standards/skills/accounting-audit/SKILL.md`（判定4区分・課税方式） |
| `指摘パターン集`／`判断辞書`／`MF実務`／`月次の回し方` | 石島さんのTwin `Brain/08_専門知識/財務・バックオフィス/`（実務の勘所） |
| `給与SKILL` | `project/dashboards/_共通ルール/給与仕訳の統一/` |
| `LMJナレッジ §6` | `lmj/10_経営・事業/会計/仕訳自動化システム/offices/lmj/仕訳ナレッジ.md`（AI-OCR補正） |

数字が食い違うときは rules.md と共通ルールを採る（インボイス経過措置は 2026-10-01〜2028-09-30 が 70%。家事按分の率・会議費の金額は固定しない。固定資産は10万円以上）。改正で変わる問題には `valid_until` を付けてある。

**公開リポジトリなので、問題・解説・図解に実名・顧問先名・取引先名・実金額を入れない。**

## 更新手順

### 問題を足す・直す
1. `data/questions-a.js`（診断＋1〜3章）か `questions-b.js`（4〜8章）に追記（`stage`・`type`・`field`・`scene`・`source` は `data/curriculum.js` の契約どおり）
2. 検証：`node -e 'global.window={};require("./data/curriculum.js");require("./data/questions-a.js");require("./data/questions-b.js");console.log(window.QUESTIONS_A.length+window.QUESTIONS_B.length)'`
3. 画像を足す：`python3 scripts/gen_images.py --only <問題id> --from-questions`（下の「画像の作り方」）
3. ブラウザで `index.html` を開いて該当ステージを解く
4. `git commit` → `git push origin main`（数十秒で公開に反映）

ステージの問題数を増やしても、クリア条件（正答率）はそのまま効く。問題バンクの版を上げるときは `data/curriculum.js` の `version` も上げる（結果画面とログに出る）。

### 画像（章の扉絵・ステージの場面絵）を作る
場面の指定は `data/curriculum.js` の `imageStyle`（共通）と各 `scene`（diag・c1〜c8・s1-1〜s8-3＝37枚）。Codex 内蔵の image2（gpt-image-2）で生成する。

```bash
python3 scripts/gen_images.py --from-curriculum --only c1                     # まず1枚試す（約100秒）
python3 scripts/gen_images.py --from-curriculum --parallel 3 --skip-existing  # 残りを並列3で（37枚で20〜30分）
```

- ChatGPT サブスク枠で動く（`codex login status` が「Logged in using ChatGPT」であること）。API キー（`.env`）は使わず、戻りの `MODEL: gpt-image-2` を1枚ごとに検証する（違えば失敗扱い・自動で1回リトライ）
- 出力：`img/<id>.jpg`（横960px・品質80・Web配信用）。原寸PNGは `img/_raw/`、作業ログは `_stock/`、結果は `img/_log.jsonl`。`_raw` と `_stock` は `.gitignore` 済みで Git に入れない
- 画像に文字・数字・吹き出しは入れない（日本語が崩れるため。説明文は HTML 側で出す）。`scene` を直したら `--only <id>` で該当の1枚だけ作り直す

### 進捗の保存先（GAS）を直す
1. `gas/Code.js` を編集
2. `cd gas && clasp push -f`（ソース同期）
3. 動作を変えたら `clasp deploy -i <既存のdeploymentId> -d "説明"`（公開版の更新。新しい deployment を作ると URL が変わるので、必ず既存IDを `-i` で指定）
4. `clasp deployments` で公開版を確認

ウェブアプリURL（`index.html` の `window.GAS_URL`）は README 末尾の「公開情報」に記録する。

### localStorage の版
保存形式を変えるときは `js/store.js` の `KEY` を上げる（古い端末の進捗は初期化されるが、名前＋合言葉でスプレッドシートから戻る）。

### 進捗の復元（名前＋合言葉）
- 初回に名前と4桁の合言葉を決める。GAS の「受講者」シートに名前と合言葉のハッシュ（SHA-256）を保存
- 別の端末で同じ名前＋合言葉を入れると、`?action=restore` が進捗ログを集計して返し、端末の記録と良い方を残して合流する
- 合言葉を忘れた人は、石島さんが「受講者」シートのその行を消す → 次回は新規登録になる（進捗ログは残るので、同じ名前で登録し直せば記録も戻る）

## 検証のしかた

- 受講者フロー：名前→章1-1を解く→不正解の解説が出る→80%未満で再挑戦→クリアで次が開く→結果画面
- 保存：リロードしても進捗が残る
- 送信：ステージを終えるたびに「進捗ログ」に1行追加。同じ logId は二重に入らない。オフラインで解いた分は次回起動で再送
- 図解：各章の図で操作が効き、375px幅で横スクロールが出ない

## 公開情報

- GAS ウェブアプリURL：https://script.google.com/macros/s/AKfycbxeHMXOCjEd1-VPHxlM3yyty6kzxCYo2NmnRS3sBOj0piYlnOSu66i6Lpg7Yr9HceaE/exec
- deploymentId：AKfycbxeHMXOCjEd1-VPHxlM3yyty6kzxCYo2NmnRS3sBOj0piYlnOSu66i6Lpg7Yr9HceaE（@5・2026-10-19 v2.1。URLは@1から変わっていない）
- 初回の権限承認は 2026-10-17 に石島さんが実施済み。未承認だと exec が「アクセス権が必要です」を返す
- `?action=setup` は列の並びが古い進捗ログを新しい並びへ移し、v1（2026-10-15.x）の行と logId の重複を外す（2026-10-19）
- 検証用GET：`?action=ping`／`?action=setup`（ダッシュボード作り直し）／`?action=count&deviceId=…`／`?action=cleanup_test`（受講者名「接続テスト」「動作確認テスト」の行だけ削除）
- clasp のトークンは失効しやすい（`invalid_rapt`）。`clasp push` が失敗したら `clasp login` で再認証

## v2.2（2026-10-26）石島さんの指摘への対応

| 指摘 | 対応 |
|---|---|
| 仕訳が縦並び・税区分が片側 | 借方｜貸方を左右に並べ、それぞれ科目＋税区分を選ぶ。答えは `answer:{debit, debitTax, credit, creditTax}`（BS科目は「対象外（不課税）」） |
| 解説が短い・絵がほしい | 全問の `explanation` を「結論→なぜ→やりがちな誤り→現場ではこう見る」の4〜6文に。`explainScene` から解説の絵 `img/e-<id>.jpg` を生成（仕訳問題は正解の仕訳表をラベル入りで） |
| 図解が文字ばかりで小さい | 図解の上にラベル入りの説明図 `img/d-<S〜>.jpg`。SVG は横スクロール枠で原寸表示 |
| 今いる場所が分からない | 画面上部に現在地（入口（トップ）› 経理の道 › 第N章 › 📍 ステージ）。各段をタップで戻れる |

ラベル入りの説明図（図解・仕訳表）は `scripts/gen_images.py --input <json>` に `prompt` を直接渡す（文字を入れる指示を含める。`_stock/diagram_prompts.json` が例）。マンガ場面の絵は `scene` 渡し（文字なしの共通ルールが付く）。

## v2.3（2026-10-27）クリア基準＝「3店舗規模の飲食店・美容・小売の記帳代行ができる」

石島さんの決定：学習を終えたら3店舗運営規模の飲食店・サービス業の記帳代行が一人でできることをクリア基準にする。会計ソフトの操作は入れない。財務の道も同じ基準（財務支援ができる）にする。

| 増えたもの | 中身 |
|---|---|
| 第0章 簿記の土台（4ステージ） | 5つの箱・B/S・P/L・C/F とその連動。連動シミュレーター（`js/diagrams.js` の S0：取引を押すと3表の動く行が光る） |
| 第9章 飲食店3店舗の記帳（6ステージ） | 題材 `docs/題材_3店舗の飲食店.md`（架空の「まる食堂」）。現金売上・決済5種・仕入と棚卸・店舗別損益・出店費用・アルバイト人件費 |
| 第10章 美容・小売の記帳と代行の進め方（5ステージ） | 美容室・雑貨店の固有取引、資料の集め方、月次締めと質問、報告と税理士への引き継ぎ |
| 卒業試験 30問 | まる食堂の4月分を資料→仕訳→照合→報告まで。全章クリアで開き、90%で合格＝「記帳代行 独り立ち」バッジ。ダッシュボードに独り立ちの一覧 |
| 各ステージ10問 | 合計 490問（診断30＋43ステージ×10＋卒業試験30）。問題ファイルは `data/questions-add-5〜8.js` |

絵は `scripts/retry_images.sh` が足りない分（章・ステージ・問題・解説）を拾って生成する。

# 記帳道場 — MF記帳レベルチェック（LMJスタッフ向け）

マネーフォワード クラウド会計で記帳するための「考え方」（仕訳の型・消費税の区分・帳簿チェックの観点・MF画面の連動）を、7章・29ステージのゲーム形式で身につける静的Webアプリ。進捗は端末（localStorage）と、指導者用の Google スプレッドシートに記録する。

- 公開URL：https://livemissionjapan.github.io/mf-kicho-dojo/ （GitHub Pages・独立リポジトリ `livemissionjapan/mf-kicho-dojo`）
- 進捗スプレッドシート：https://docs.google.com/spreadsheets/d/1CUeTd0LeKLGeB3JlTae5KYr-KZgq1eEJQo_4hBDkp74/edit （石島さんのDrive。タブ：README／進捗ログ／ダッシュボード）
- GAS（スプレッドシートに紐づくスクリプト）：https://script.google.com/d/17Y8Rzez51fSCFVXK1jhLWccIFRo5UgJrIDLz-lzw9bW2UGY0G4cB1YPF/edit
- 作成：2026-10-15。対象＝LMJのスタッフ。重み付け＝考え方重視（石島さん決定）

## 構成

| ファイル | 中身 |
|---|---|
| `index.html` | 画面の骨組み（名前／ワールドマップ／章／ステージ／結果）。`window.GAS_URL` をここで設定 |
| `css/app.css` | 見た目。ライト／ダーク対応。図解用のCSS変数 `--d-*` もここ |
| `js/app.js` | 進行・出題（6タイプ）・採点・クリア判定・結果 |
| `js/store.js` | localStorage（版キー `kicho-dojo:v1`）と未送信キュー |
| `js/sheet.js` | GAS への送信（POST は no-cors、GET `?action=ack` で受領確認してキューを落とす） |
| `js/diagrams.js` | 図解14枚（インラインSVG＋操作）。`data-link` が同じ要素は一緒に光る |
| `data/curriculum.js` | 章・ステージ・クリア条件・図解の対応。問題タイプの契約もここ |
| `data/questions.js` | 問題バンク。`stage` でステージに束ねる。各問に `source`（出典ID） |
| `gas/Code.js` | doPost（進捗ログに追記・logId で二重防止）／doGet（ack・ping・setup） |

ビルド不要。外部依存は Google Fonts だけ。

## 教材の正本と出典ID

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
1. `data/questions.js` に追記（`stage` と `type` は `data/curriculum.js` の契約どおり。`source` 必須）
2. 検証：`node -e 'global.window={};require("./data/curriculum.js");require("./data/questions.js");console.log(window.QUESTIONS.length)'`
3. ブラウザで `index.html` を開いて該当ステージを解く
4. `git commit` → `git push origin main`（数十秒で公開に反映）

ステージの問題数を増やしても、クリア条件（正答率）はそのまま効く。問題バンクの版を上げるときは `data/curriculum.js` の `version` も上げる（結果画面とログに出る）。

### 進捗の保存先（GAS）を直す
1. `gas/Code.js` を編集
2. `cd gas && clasp push -f`（ソース同期）
3. 動作を変えたら `clasp deploy -i <既存のdeploymentId> -d "説明"`（公開版の更新。新しい deployment を作ると URL が変わるので、必ず既存IDを `-i` で指定）
4. `clasp deployments` で公開版を確認

ウェブアプリURL（`index.html` の `window.GAS_URL`）は README 末尾の「公開情報」に記録する。

### localStorage の版
保存形式を変えるときは `js/store.js` の `KEY` を `kicho-dojo:v2` に上げる（古い端末の進捗は初期化される）。

## 検証のしかた

- 受講者フロー：名前→章1-1を解く→不正解の解説が出る→80%未満で再挑戦→クリアで次が開く→結果画面
- 保存：リロードしても進捗が残る
- 送信：ステージを終えるたびに「進捗ログ」に1行追加。同じ logId は二重に入らない。オフラインで解いた分は次回起動で再送
- 図解：各章の図で操作が効き、375px幅で横スクロールが出ない

## 公開情報

- GAS ウェブアプリURL：https://script.google.com/macros/s/AKfycbxeHMXOCjEd1-VPHxlM3yyty6kzxCYo2NmnRS3sBOj0piYlnOSu66i6Lpg7Yr9HceaE/exec
- deploymentId：AKfycbxeHMXOCjEd1-VPHxlM3yyty6kzxCYo2NmnRS3sBOj0piYlnOSu66i6Lpg7Yr9HceaE（@1・2026-10-15）
- 初回だけ所有者がスクリプトの権限を承認する必要がある（スクリプトエディタで setupDashboard を実行→承認）。未承認だと exec が「アクセス権が必要です」を返す

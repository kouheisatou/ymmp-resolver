# YMMP Resolver

YukkuriMovieMaker4 (YMM4) のプロジェクトファイル (`.ymmp`) 内で、素材ファイル（動画・画像・音声）のパスがリンク切れを起こした場合に、パスを修正・再リンクするためのデスクトップ GUI ツール。

PC の移行やフォルダ構成の変更により `.ymmp` 内の絶対パスが無効になった場合、本ツールでフォルダを指定して自動的にファイルを再検索し、パスを一括修正できる。

> **現在の UI スクリーンショット**: `debug/screenshot.png`（`npm run screenshot` で取得可能）

---

## 技術スタック

| レイヤー       | 技術                         | バージョン制約                                             |
| -------------- | ---------------------------- | ---------------------------------------------------------- |
| フレームワーク | nextron (Electron + Next.js) | nextron@9, **next@14 固定**（nextron@9 が next@14 に依存） |
| 言語           | TypeScript                   | ^5.7                                                       |
| UI             | React + ピュア CSS           | React 18, **CSS ライブラリ禁止**                           |
| Lint           | ESLint                       | **v8 固定**（eslint-config-next@14 が v8 に依存）          |
| Format         | Prettier                     | ^3.8                                                       |
| ビルド         | electron-builder             | ^26.8                                                      |
| ランタイム     | Electron                     | ^41.0                                                      |

### バージョン制約の背景

- `next@15+` に上げると nextron@9 のビルドが壊れる
- `eslint@9+` に上げると eslint-config-next@14 が動作しない
- `npm overrides` で nextron の間接依存（babel, webpack, serialize-javascript）を安全なバージョンに固定済み

---

## ディレクトリ構成

```
ymmp-resolver/
├── main/                          # Electron メインプロセス
│   ├── background.ts              #   ウィンドウ管理、IPC ハンドラー、protocol 登録
│   ├── preload.ts                 #   contextBridge による IPC ブリッジ
│   └── helpers/
│       ├── file-scanner.ts        #   フォルダ再帰検索、ファイル名マッチング
│       └── debug-server.ts        #   開発モード用スクリーンショット HTTP サーバー
├── renderer/                      # Next.js レンダラープロセス
│   ├── pages/
│   │   ├── _app.tsx               #   App ラッパー（CSS インポート）
│   │   └── index.tsx              #   メイン画面（テーブル、ツールバー、ステータスバー）
│   ├── lib/
│   │   └── ymmp-parser.ts         #   ymmp パース、パス抽出、パス置換ロジック
│   ├── styles/
│   │   └── retro.css              #   macOS 8 風レトロ UI の全スタイル
│   ├── types/
│   │   └── electron.d.ts          #   window.electronAPI の型定義
│   ├── next.config.js             #   Next.js 設定（output: 'export'）
│   └── tsconfig.json              #   レンダラー用 TypeScript 設定
├── scripts/
│   └── screenshot.ts              #   スクリーンショット取得スクリプト
├── docs/
│   ├── requirements.md            #   機能要件定義書
│   └── design.md                  #   UI デザイン仕様書
├── debug/
│   └── screenshot.png             #   最新のスクリーンショット（.gitignore 対象）
├── .github/workflows/
│   └── release.yml                #   CI/CD（check -> build -> release）
├── package.json
├── tsconfig.json
├── electron-builder.yml
├── .eslintrc.json
├── .prettierrc
└── project-file-sample.ymmp       #   テスト用サンプルプロジェクトファイル
```

### 自動生成ディレクトリ（Git 管理外）

| ディレクトリ    | 内容                                                             |
| --------------- | ---------------------------------------------------------------- |
| `app/`          | nextron ビルド出力（メインプロセス JS + レンダラー静的ファイル） |
| `dist/`         | electron-builder パッケージ出力（.dmg, .exe）                    |
| `.next/`        | Next.js 開発サーバーキャッシュ                                   |
| `node_modules/` | npm 依存                                                         |

---

## アーキテクチャ

### プロセス構成

```
┌─────────────────────────────────────────────────┐
│ Electron メインプロセス (main/background.ts)      │
│                                                  │
│  - ウィンドウ管理                                  │
│  - ファイル I/O（ymmp 読み書き）                    │
│  - フォルダスキャン                                │
│  - ネイティブダイアログ                             │
│  - デバッグ HTTP サーバー（開発時のみ）              │
│                                                  │
│         ↕ IPC (contextBridge)                     │
│                                                  │
│ Electron レンダラープロセス (renderer/)             │
│                                                  │
│  - Next.js Pages Router                          │
│  - React UI（状態管理はローカル useState）          │
│  - ymmp パースロジック                             │
│  - retro CSS スタイリング                          │
└─────────────────────────────────────────────────┘
```

**セキュリティ原則**: `contextIsolation: true`, `nodeIntegration: false`。レンダラーから Node.js API には一切直接アクセスしない。全てのファイル操作・OS 操作は IPC 経由でメインプロセスが実行する。

### IPC チャネル一覧

| チャネル名             | 方向             | 引数                                      | 戻り値                                  | 用途                          |
| ---------------------- | ---------------- | ----------------------------------------- | --------------------------------------- | ----------------------------- |
| `dialog:open-ymmp`     | renderer -> main | なし                                      | `string \| null`                        | ymmp ファイル選択ダイアログ   |
| `dialog:select-folder` | renderer -> main | なし                                      | `string \| null`                        | フォルダ選択ダイアログ        |
| `file:read-ymmp`       | renderer -> main | `filePath: string`                        | `{ content: string; filePath: string }` | ymmp 読み込み（BOM 除去済み） |
| `file:save-ymmp`       | renderer -> main | `filePath: string, jsonString: string`    | `boolean`                               | ymmp 保存（BOM 付与）         |
| `file:scan-folder`     | renderer -> main | `folderPath: string, fileNames: string[]` | `Record<string, string>`                | フォルダ再帰検索              |

新しい IPC チャネルを追加する場合、以下の 3 ファイルを **必ず同時に** 更新すること:

1. `main/background.ts` - `ipcMain.handle()` でハンドラー登録
2. `main/preload.ts` - `contextBridge.exposeInMainWorld()` に API 追加
3. `renderer/types/electron.d.ts` - `ElectronAPI` インターフェースに型追加

---

## ymmp ファイル仕様

### 基本情報

- **形式**: JSON
- **エンコーディング**: UTF-8 with BOM (`0xEF 0xBB 0xBF`)
- **パス形式**: Windows 絶対パス（例: `C:\Users\yuma\...\video.mp4`）

### 構造（関連部分のみ）

```json
{
  "FilePath": "C:\\...\\project.ymmp", // プロジェクトファイル自体のパス ※変更禁止
  "Timelines": [
    {
      "Items": [
        {
          "$type": "YukkuriMovieMaker.Project.Items.VideoItem, YukkuriMovieMaker",
          "FilePath": "C:\\...\\video.mp4" // ← 再リンク対象
        }
      ]
    }
  ]
}
```

### 再リンク対象アイテムタイプ

| `$type` プレフィックス                      | 説明 |
| ------------------------------------------- | ---- |
| `YukkuriMovieMaker.Project.Items.VideoItem` | 動画 |
| `YukkuriMovieMaker.Project.Items.ImageItem` | 画像 |
| `YukkuriMovieMaker.Project.Items.AudioItem` | 音声 |

`TextItem`, `ShapeItem` には `FilePath` が存在しないため対象外。

### 保存時のルール

- 元の JSON 構造を完全に保持する（パース -> 修正 -> 再シリアライズ）
- 先頭に UTF-8 BOM (`\uFEFF`) を付与する
- `Timelines[*].Items[*].FilePath` のみ変更する
- **トップレベルの `FilePath`（プロジェクトファイルパス）は絶対に変更しない**

---

## UI デザインルール

### コンセプト

**macOS 8 / System 7 風のレトロなピクセル調デザイン**。1990 年代のクラシック OS を再現したグレー基調の UI。

### 設計原則

- 全スタイルは `renderer/styles/retro.css` に集約する（CSS Modules 不使用）
- CSS クラス名は `retro-` プレフィックスを使用する（例: `retro-btn`, `retro-table`）
- 外部 CSS ライブラリ（Tailwind, MUI, styled-components 等）は使用しない
- アニメーションは原則なし（レトロ感の維持）
- `border-radius: 0`（角丸禁止）

### CSS 変数一覧

```css
--bg: #c0c0c0; /* メイン背景（クラシックグレー） */
--bg-dark: #a0a0a0; /* 暗い背景 */
--bg-light: #d4d0c8; /* 明るい背景 */
--highlight: #ffffff; /* 3D ベベルのハイライト（左上） */
--shadow: #808080; /* 3D ベベルのシャドウ */
--shadow-dark: #404040; /* 3D ベベルの濃いシャドウ（右下） */
--text: #000000; /* テキスト */
--text-disabled: #808080; /* 無効テキスト */
--accent: #000080; /* アクセント（ネイビーブルー） */
--accent-light: #1084d0; /* タイトルバーグラデーション */
--input-bg: #ffffff; /* 入力フィールド背景 */
--font-main: 'VT323', 'Chicago', 'Geneva', 'Monaco', monospace;
```

### 3D ベベルの規則

- **凸 (raised)**: `border-color: highlight shadow-dark shadow-dark highlight`
- **凹 (sunken)**: `border-color: shadow-dark highlight highlight shadow-dark`
- ボタン押下時は凸→凹に反転

---

## 開発コマンド

```bash
npm run dev          # 開発サーバー起動（ホットリロード + デバッグサーバー）
npm run build:mac    # macOS 向けビルド（dist/*.dmg）
npm run build:win    # Windows 向けビルド（dist/*.exe）
npm run lint         # ESLint チェック（warnings=0 で失敗）
npm run lint:fix     # ESLint 自動修正
npm run format       # Prettier フォーマットチェック
npm run format:fix   # Prettier 自動整形
npm run audit:ci     # npm audit（production deps のみ）
npm run screenshot   # アプリのスクリーンショットを debug/screenshot.png に保存
```

---

## AI デバッグループ

開発モード (`npm run dev`) で起動すると、アプリ内にローカル HTTP サーバー (port 13456) が自動的に起動する。

### 使い方

```
1. npm run dev          → アプリ起動（デバッグサーバーも起動）
2. npm run screenshot   → debug/screenshot.png にスクリーンショット保存
3. 画像を読み込んで UI を視覚的に分析
4. ソースコード修正（ホットリロードで即反映）
5. 2 に戻る
```

### エンドポイント

| URL                                 | 説明                                      |
| ----------------------------------- | ----------------------------------------- |
| `http://127.0.0.1:13456/screenshot` | ウィンドウの PNG スクリーンショットを返す |
| `http://127.0.0.1:13456/health`     | サーバー起動確認                          |

本番ビルドではデバッグサーバーは起動しない。

---

## 禁止事項 (MUST NOT)

| 項目                                                       | 理由                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `production` ブランチへの直接 push                         | ブランチ保護ルール。必ず main -> PR -> production                                     |
| `contextIsolation: false` の設定                           | セキュリティ違反。IPC を経由せずに Node.js API にアクセス可能になる                   |
| `nodeIntegration: true` の設定                             | 同上                                                                                  |
| トップレベル `FilePath` の変更                             | プロジェクトファイルパス自体の書き換えは YMM4 の動作を壊す                            |
| Tailwind / MUI 等の CSS ライブラリ導入                     | macOS 8 風のレトロデザインを純粋な CSS で表現する方針                                 |
| `next@15+` へのアップグレード                              | nextron@9 のビルドが壊れる                                                            |
| `eslint@9+` へのアップグレード                             | eslint-config-next@14 との互換性が失われる                                            |
| `npm audit fix --force` の実行                             | nextron のメジャーバージョンがダウングレードされ、ビルドが壊れる                      |
| 自明なコードコメントの追加                                 | `// import module` のような意味のないコメントは禁止。意図やトレードオフのみコメント可 |
| `renderer/` から直接 `fs` / `path` 等の Node.js API を使用 | 全て IPC 経由でメインプロセスに委譲する                                               |

---

## 推奨事項 (SHOULD)

| 項目                                | 詳細                                                                  |
| ----------------------------------- | --------------------------------------------------------------------- |
| コード変更後は lint + format を実行 | `npm run lint && npm run format` で CI と同じチェックをローカルで確認 |
| IPC 追加時は 3 ファイル同時更新     | `background.ts` + `preload.ts` + `electron.d.ts`                      |
| CSS は `retro.css` に集約           | インラインスタイルは最小限にとどめ、CSS 変数を活用                    |
| ファイル操作はメインプロセスで      | `main/helpers/` にロジックを配置                                      |
| コミット前に audit を確認           | `npm run audit:ci` で production deps の脆弱性ゼロを維持              |
| スクリーンショットで UI を確認      | `npm run screenshot` で視覚的に変更を検証                             |
| 型定義を正確に保つ                  | `renderer/types/electron.d.ts` の `ElectronAPI` を実装と同期          |

---

## Git / CI フロー

### ブランチ戦略

```
main (開発) ──PR──> production (保護) ──Actions──> GitHub Release
```

- `main`: 開発用。自由に push 可能
- `production`: 保護ブランチ。PR のマージのみ。直接 push 禁止

### GitHub Actions ジョブ構成

```
check (ubuntu)          ← lint + format + audit
  ↓ (通過時のみ)
build (macOS + Windows)  ← electron-builder でパッケージング
  ↓
release (ubuntu)         ← GitHub Release にアップロード
```

- トリガー: `production` ブランチへの push（= PR マージ時）
- リリースタグ: `package.json` の `version` フィールドから `v{version}` を自動生成
- 成果物: `.dmg` (macOS), `.zip` (macOS), `.exe` (Windows)

### バージョン更新

リリース時は `package.json` の `version` を更新してからマージする。タグは Actions が自動生成するため、手動で `git tag` を打つ必要はない。

---

## Prettier / ESLint 設定

### Prettier (`.prettierrc`)

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "semi": true
}
```

### ESLint (`.eslintrc.json`)

- `eslint:recommended` + `@typescript-eslint/recommended` + `next/core-web-vitals` + `prettier`
- `@typescript-eslint/no-explicit-any`: off（ymmp の生 JSON を扱うため）
- `@typescript-eslint/no-unused-vars`: warn（`_` プレフィックスの引数は許可）
- `--max-warnings 0`: 警告もゼロで CI を通す

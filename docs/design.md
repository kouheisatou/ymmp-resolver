# YMMP Resolver - デザイン仕様書

## デザインコンセプト

**macOS 8 / System 7 風のレトロなピクセル調デザイン**

1990年代のクラシックOSを彷彿とさせるグレー基調のUI。
3Dベベル、ピクセルフォント、横縞タイトルバーなど、
往年のデスクトップ体験を再現する。

---

## カラーパレット

| 用途          | カラーコード | 説明                           |
| ------------- | ------------ | ------------------------------ |
| Base BG       | `#C0C0C0`    | メイン背景（クラシックグレー） |
| Dark BG       | `#A0A0A0`    | 暗めの背景                     |
| Light BG      | `#D4D0C8`    | 明るめの背景                   |
| Highlight     | `#FFFFFF`    | 3Dベベルのハイライト面         |
| Shadow        | `#808080`    | 3Dベベルのシャドウ面           |
| Shadow Dark   | `#404040`    | 3Dベベルの濃いシャドウ         |
| Text          | `#000000`    | テキスト                       |
| Text Disabled | `#808080`    | 無効テキスト                   |
| Accent        | `#000080`    | アクセント（ネイビーブルー）   |
| Accent Light  | `#1084D0`    | タイトルバーグラデーション用   |
| Input BG      | `#FFFFFF`    | 入力フィールド背景             |

## タイポグラフィ

- **メインフォント**: `VT323`（Google Fonts）
  - フォールバック: `Chicago`, `Geneva`, `Monaco`, `monospace`
- **サイズ**: 16px（基本）、14px（ステータスバー）、18px（タイトルバー）
- **アンチエイリアス**: 無効（`-webkit-font-smoothing: none`）
- **レンダリング**: ピクセル化（`image-rendering: pixelated`）

---

## コンポーネント仕様

### 1. ウィンドウ枠 (RetroWindow)

```
┌─────────────────────────────────┐  ← 外枠: highlight / shadow-dark
│ ■ YMMP Resolver                │  ← タイトルバー: navy→blue gradient
├─────────────────────────────────┤
│ [Open] | [Auto Re-link] | [Save]│  ← ツールバー
├─────────────────────────────────┤
│                                 │
│       メインコンテンツ            │
│                                 │
├─────────────────────────────────┤
│ Ready                    │ 0    │  ← ステータスバー: sunken border
└─────────────────────────────────┘
```

- 全画面を1つのウィンドウとして表現
- 外枠は2pxの3Dベベル（highlight / shadow-dark）

### 2. タイトルバー

- 背景: `linear-gradient(90deg, #000080, #1084D0)`
- テキスト: 白、太字、18px
- テキストシャドウ: `1px 1px 0 rgba(0,0,0,0.5)`
- 左端に16x16のアイコンプレースホルダー
- `-webkit-app-region: drag`（ドラッグ可能）

### 3. ボタン (RetroButton)

**通常状態:**

```
  ┌─ highlight (white)
  │ ┌─ light inset
  ▼ ▼
┌──────────┐
│  Button  │  ← 背景: #C0C0C0
└──────────┘
  ▲ ▲
  │ └─ shadow inset
  └─ shadow-dark
```

**押下状態:**

- border反転: shadow-dark / highlight が入れ替わり
- box-shadow反転: 凹み表現
- テキスト位置が右下に1pxシフト

**Primary バリアント:**

- 太字テキスト
- 黒い2pxのoutline（`outline: 2px solid #000; outline-offset: -4px`）

### 4. テーブル (RetroTable)

- ラッパー: sunken border（凹み）、白背景
- ヘッダー: sticky、グレー背景、raised border
- 行ホバー: `#E8E8FF`（薄い青）
- Type列: バッジ表示（小さいグレーの囲み）

### 5. 入力フィールド (RetroInput)

- sunken border: shadow-dark / highlight
- 白背景
- フォーカス時: 点線のoutline
- 値が入力済みの場合: テキストを緑色 (`#008000`) に

### 6. ステータスバー

- 上辺: highlight の1pxボーダー
- セクションはsunken borderで区切り
- 左セクション（flex: 3）: メッセージ
- 右セクション: アイテム数

### 7. スクロールバー

- 幅: 16px
- トラック: 斜め45度のストライプパターン
- サム: raised border のグレーブロック
- ボタン: raised border の正方形

---

## 画面遷移

### 初期画面（未読み込み）

- 中央にファイルアイコン（📂）
- "Open a .ymmp file to begin" テキスト
- 「Open .ymmp File」ボタン（Primary）

### メイン画面（読み込み済み）

- ツールバーに全操作ボタン
- テーブルに素材ファイル一覧
- ステータスバーに情報表示

---

## レスポンシブ対応

- ウィンドウ最小サイズ: 800 x 500
- テーブルは水平スクロール可能
- New Path列が最も広く取る（flex）

---

## アニメーション

- アニメーションは原則なし（レトロ感の維持）
- ボタン押下のみ即座の状態変化

# YMMP Resolver - 機能要件定義書

## 概要

YukkuriMovieMaker4 (YMM4) のプロジェクトファイル (.ymmp) 内で、
素材ファイル（動画・画像・音声）のパスがリンク切れを起こした場合に、
パスを修正・再リンクするためのデスクトップGUIツール。

## 対象ユーザー

- YukkuriMovieMaker4 を使用する動画制作者
- 素材ファイルの移動やPC変更によりプロジェクトファイルのリンクが壊れた人

## 対象プラットフォーム

- macOS (dmg)
- Windows (exe / nsis installer)

---

## 機能一覧

### F-001: ymmpファイルの読み込み

- ファイル選択ダイアログから .ymmp ファイルを選択
- UTF-8 BOM 付き JSON としてパース
- `Timelines[*].Items[*].FilePath` から素材ファイルパスを抽出
- 対象アイテムタイプ:
  - `VideoItem` (動画)
  - `ImageItem` (画像)
  - `AudioItem` (音声)
- 同一パスの重複はユニーク化して1行にまとめる
- 各素材の参照元アイテム数を保持

### F-002: 素材ファイルリストの表示

メイン画面にテーブル形式で以下の情報を表示:

| 列            | 内容                                             |
| ------------- | ------------------------------------------------ |
| #             | 連番                                             |
| Type          | アイテム種別 (VideoItem / ImageItem / AudioItem) |
| File Name     | ファイル名 (basename)                            |
| Original Path | 元の絶対パス (読み取り専用)                      |
| New Path      | 修正後のパス (入力可能)                          |

### F-003: 自動再リンク

1. 「Auto Re-link」ボタンを押下
2. フォルダ選択ダイアログが開く
3. 選択フォルダ内を再帰的にスキャン
4. ファイル名（basename）が一致する素材を検索
   - 大文字小文字を区別しない
5. 見つかったファイルの絶対パスを「New Path」に自動入力
6. 結果サマリーをステータスバーに表示（例: "5/8 file(s) found"）

### F-004: 手動パス入力

- 各素材の「New Path」フィールドに直接パスを入力可能
- 自動再リンクで見つからなかったファイルを手動で指定

### F-005: プロジェクトファイルの保存

1. 「Save」ボタンを押下
2. New Path が入力されている素材について、元ファイル内の全参照箇所の `FilePath` を置換
3. UTF-8 BOM 付きで元のファイルパスに上書き保存
4. JSON構造は元の形式を保持（インデント2スペース）

### F-006: 保存時の制約

- トップレベルの `FilePath`（プロジェクトファイル自体のパス）は変更しない
- New Path が空欄の素材は変更しない
- 元のJSON構造（キー順、ネスト構造）を可能な限り保持

---

## 非機能要件

### パフォーマンス

- 10,000ファイル以下のフォルダスキャンは5秒以内に完了すること
- 100アイテム以下のymmpファイルの読み込みは即座に完了すること

### ユーザビリティ

- 主要操作は3ステップ以内で完了（ファイルを開く → 自動再リンク → 保存）
- ステータスバーで常に現在の状態を表示

### セキュリティ

- contextIsolation: true（レンダラーから Node.js API に直接アクセスしない）
- IPC 経由でのみファイル操作を実行

---

## ymmpファイル構造仕様

```json
{
  "FilePath": "C:\\...\\project.ymmp",  // プロジェクトファイルパス（変更しない）
  "Timelines": [
    {
      "Items": [
        {
          "$type": "YukkuriMovieMaker.Project.Items.VideoItem, YukkuriMovieMaker",
          "FilePath": "C:\\...\\video.mp4",  // ← 再リンク対象
          ...
        },
        {
          "$type": "YukkuriMovieMaker.Project.Items.ImageItem, YukkuriMovieMaker",
          "FilePath": "C:\\...\\image.jpg",  // ← 再リンク対象
          ...
        },
        {
          "$type": "YukkuriMovieMaker.Project.Items.TextItem, YukkuriMovieMaker",
          // FilePathなし（対象外）
          ...
        }
      ]
    }
  ]
}
```

- エンコーディング: UTF-8 with BOM (0xEF 0xBB 0xBF)
- フォーマット: JSON（1行 or インデント付き）

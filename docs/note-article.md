# デスクトップアプリに「AIが叩けるAPI」を埋め込む ― HTTP操作+スクリーンショットによるAIデバッグ手法

## はじめに

AIコーディングエージェントは、Webアプリの開発では非常に強力だ。ブラウザのDevToolsやHTTPリクエストを通じてアプリの状態を確認し、コードを修正し、その結果をすぐに検証できる。

しかし**デスクトップアプリ**となると話が変わる。Electronで作ったアプリを`npm run dev`で起動しても、AIにとっては「中身の見えないブラックボックス」でしかない。ボタンを押すことも、画面を見ることも、状態を取得することもできない。

この問題を解決するために、**開発モード限定のHTTP APIサーバーをアプリ内部に埋め込む**手法を考案した。AIエージェントは`curl`コマンドでアプリを操作し、スクリーンショットで結果を視覚的に確認できる。本記事ではこの手法の設計思想、アーキテクチャ、実装方法を体系的に解説する。

---

## この手法が解決する課題

デスクトップアプリ（特にElectronアプリ）をAIエージェントに開発させる場合、以下の壁がある。

| 課題 | 詳細 |
|---|---|
| **UIを操作できない** | ファイルダイアログの選択、ボタンクリック等はGUI操作が前提 |
| **画面が見えない** | レイアウト崩れやスタイルの問題を検知できない |
| **状態を取得できない** | アプリ内部のReact stateやデータを外部から読めない |
| **操作のフィードバックがない** | 「保存が成功したか」をプログラム的に確認する手段がない |

Webアプリなら`fetch()`やDevToolsプロトコルで解決できるが、デスクトップアプリにはそのような標準的なインターフェースが存在しない。

---

## 手法の全体像

核となるアイデアは単純だ。

> **開発モードでだけ起動するローカルHTTPサーバーを埋め込み、UIのボタン操作と等価なAPIエンドポイントを公開する。加えて、ウィンドウのスクリーンショットをPNG画像として返すエンドポイントも用意する。**

これにより、AIエージェントは以下のループを自律的に回せるようになる。

```
┌─────────────────────────────────────────────┐
│          AI デバッグループ                     │
│                                              │
│  1. curl で API を叩いてアプリを操作          │
│       ↓                                      │
│  2. curl でスクリーンショットを取得            │
│       ↓                                      │
│  3. 画像を分析して UI の状態を視覚的に確認     │
│       ↓                                      │
│  4. ソースコードを修正（ホットリロード反映）    │
│       ↓                                      │
│  5. 1 に戻る                                  │
└─────────────────────────────────────────────┘
```

**ポイント**: APIによる「構造的な情報」とスクリーンショットによる「視覚的な情報」を組み合わせることで、AIはアプリの状態を正確かつ多角的に把握できる。

---

## アーキテクチャ

Electronアプリのプロセスモデルに沿った設計になっている。

```
外部（AIエージェント / curl）
       │
       │ HTTP リクエスト
       ▼
┌─────────────────────────────────────┐
│  デバッグ HTTP サーバー (port 13456)  │
│  main/helpers/debug-server.ts       │
│                                     │
│  - /screenshot  → capturePage()     │
│  - /api/state   ─┐                  │
│  - /api/open    ─┤                  │
│  - /api/relink  ─┤ コマンド送信      │
│  - /api/save    ─┘                  │
└───────────┬─────────────────────────┘
            │ webContents.send('debug:command')
            ▼
┌─────────────────────────────────────┐
│  Electron メインプロセス             │
│  main/background.ts                 │
│                                     │
│  - IPC 中継                          │
│  - ファイル I/O                      │
│  - OS ダイアログ                     │
└───────────┬─────────────────────────┘
            │ contextBridge (IPC)
            ▼
┌─────────────────────────────────────┐
│  レンダラープロセス (React)           │
│  renderer/pages/index.tsx           │
│                                     │
│  - コマンドリスナー (useEffect)       │
│  - React state 更新                  │
│  - UI 描画                           │
│  - レスポンス返却                     │
└───────────┬─────────────────────────┘
            │ ipcRenderer.send('debug:response')
            ▼
       HTTP レスポンスとして返却
```

### なぜレンダラーを経由するのか

「メインプロセスで直接ファイルを読み書きすればいいのでは？」と思うかもしれない。しかし、そうするとReactの状態が更新されず、**UIとデータの不整合**が起きる。

この手法の重要な設計判断は、**APIリクエストをレンダラーのReactコンポーネントに到達させ、ユーザーがボタンを押したときと完全に同じコードパスを通す**ことだ。これにより：

- React stateが正しく更新される
- UIが即座に反映される
- スクリーンショットに最新の状態が映る
- 「APIで操作したのにUIに反映されない」という問題が起きない

---

## 実装ガイド

以下、Electron + React (Next.js) アプリを例に具体的な実装手順を示す。他のフレームワークでも考え方は同じだ。

### Step 1: デバッグHTTPサーバーの骨格

メインプロセスにHTTPサーバーを作る。**開発モードでのみ起動する**のが鉄則だ。

```typescript
// main/helpers/debug-server.ts
import http from 'http';
import { BrowserWindow, ipcMain } from 'electron';

const DEBUG_PORT = 13456;
let server: http.Server | null = null;

export function startDebugServer(mainWindow: BrowserWindow) {
  server = http.createServer(async (req, res) => {
    // ここにルーティングを書く
  });

  server.listen(DEBUG_PORT, '127.0.0.1', () => {
    console.log(`[Debug] API server: http://127.0.0.1:${DEBUG_PORT}`);
  });
}

export function stopDebugServer() {
  if (server) {
    server.close();
    server = null;
  }
}
```

**`127.0.0.1` にバインドする**ことで、外部ネットワークからのアクセスを遮断する。

起動側（`main/background.ts`）:

```typescript
app.on('ready', async () => {
  await createWindow();
  // 開発モード限定
  if (!isProd && mainWindow) {
    startDebugServer(mainWindow);
  }
});

app.on('window-all-closed', () => {
  stopDebugServer();
  app.quit();
});
```

### Step 2: スクリーンショットエンドポイント

ElectronのBrowserWindowには`capturePage()`というAPIがある。これをHTTPで公開する。

```typescript
if (req.url === '/screenshot' && req.method === 'GET') {
  const image = await mainWindow.webContents.capturePage();
  const png = image.toPNG();
  res.writeHead(200, {
    'Content-Type': 'image/png',
    'Content-Length': png.length,
  });
  res.end(png);
}
```

これだけで、`curl http://127.0.0.1:13456/screenshot -o screenshot.png` でアプリの画面をキャプチャできる。AIはこの画像を読み込んでUIの状態を視覚的に分析できる。

### Step 3: コマンド転送の仕組み（ここが肝）

HTTPリクエストをレンダラーに届け、結果を待ってHTTPレスポンスとして返す。この双方向の非同期通信を実現するために、**Promise + コマンドIDパターン**を使う。

```typescript
// Promiseの保管庫
const pendingCommands = new Map<string, {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timer: ReturnType<typeof setTimeout>;
}>();

let commandCounter = 0;

function sendCommandToRenderer(
  mainWindow: BrowserWindow,
  type: string,
  payload: any,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const id = `cmd_${++commandCounter}_${Date.now()}`;

    // タイムアウト設定（レンダラーが応答しない場合のセーフティ）
    const timer = setTimeout(() => {
      pendingCommands.delete(id);
      reject(new Error(`Command '${type}' timed out`));
    }, 30000);

    pendingCommands.set(id, { resolve, reject, timer });

    // レンダラーにコマンド送信
    mainWindow.webContents.send('debug:command', { id, type, payload });
  });
}
```

レンダラーからの応答を受け取る部分:

```typescript
ipcMain.on('debug:response', (_event, { id, result, error }) => {
  const pending = pendingCommands.get(id);
  if (!pending) return;
  clearTimeout(pending.timer);
  pendingCommands.delete(id);
  if (error) {
    pending.reject(new Error(error));
  } else {
    pending.resolve(result);
  }
});
```

これで`await sendCommandToRenderer(mainWindow, 'open', { filePath: '...' })`と書けば、レンダラーが処理を完了するまで待ち、結果をそのままHTTPレスポンスとして返せる。

### Step 4: Preloadでブリッジを公開

Electronのセキュリティモデルに従い、`contextBridge`でAPIを公開する。

```typescript
// main/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  // ... 既存のAPI ...

  // デバッグ用: メインプロセスからのコマンドを受信
  onDebugCommand: (callback) => {
    ipcRenderer.on('debug:command', (_event, data) => callback(data));
  },
  // デバッグ用: コマンドの実行結果を返送
  sendDebugResponse: (id, result, error) => {
    ipcRenderer.send('debug:response', { id, result, error });
  },
});
```

### Step 5: レンダラーでコマンドリスナーを実装

Reactコンポーネント内でコマンドを受け取り、**既存のハンドラー関数をそのまま呼ぶ**。

ここで重要な設計ポイントがある。UIのボタンクリックで呼ぶ関数と、APIコマンドで呼ぶ関数は**同一の関数にする**。差分はダイアログの有無だけだ。

```typescript
// ボタンクリック用: ダイアログでパスを取得してから実行
const handleOpenFile = useCallback(async () => {
  const filePath = await window.electronAPI.openYmmpDialog(); // ← ダイアログ
  if (!filePath) return;
  await loadFile(filePath); // ← 共通ロジック
}, [loadFile]);

// API用: パスを直接受け取って実行
// loadFile() をそのまま呼ぶだけ
```

コマンドリスナーの実装:

```typescript
useEffect(() => {
  if (!window.electronAPI?.onDebugCommand) return;

  window.electronAPI.onDebugCommand(async ({ id, type, payload }) => {
    try {
      let result;
      switch (type) {
        case 'get-state':
          result = {
            appState: stateRef.current.state,
            assets: stateRef.current.assets,
            // ...
          };
          break;
        case 'open':
          result = await loadFile(payload.filePath);
          break;
        case 'relink':
          result = await relinkFromFolder(payload.folderPath);
          break;
        case 'save':
          result = await saveFile();
          break;
        // ...
      }
      window.electronAPI.sendDebugResponse(id, result, null);
    } catch (err) {
      window.electronAPI.sendDebugResponse(id, null, err.message);
    }
  });
}, [loadFile, relinkFromFolder, saveFile]);
```

**`stateRef`のポイント**: Reactのstateはクロージャに閉じ込められるため、`useRef`で最新値への参照を保持する。これを怠ると、コマンド実行時に古いstateを参照してしまう。

```typescript
const stateRef = useRef({ state, ymmpData, assets, statusMessage });
useEffect(() => {
  stateRef.current = { state, ymmpData, assets, statusMessage };
}, [state, ymmpData, assets, statusMessage]);
```

### Step 6: APIエンドポイントの定義

HTTPサーバーにルーティングを追加する。

```typescript
// ファイルを開く
if (url === '/api/open' && method === 'POST') {
  const body = JSON.parse(await readBody(req));
  if (!body.filePath) {
    jsonResponse(res, 400, { error: 'filePath is required' });
    return;
  }
  const result = await sendCommandToRenderer(
    mainWindow, 'open', { filePath: body.filePath }
  );
  jsonResponse(res, 200, result);
}
```

同様に、アプリのあらゆるUI操作に対応するエンドポイントを用意する。

---

## 使い方

### 基本的なAIデバッグフロー

```bash
# 1. 開発サーバーを起動
npm run dev

# 2. ヘルスチェック
curl http://127.0.0.1:13456/health
# → {"status":"ok"}

# 3. プロジェクトファイルを開く
curl -X POST http://127.0.0.1:13456/api/open \
  -d '{"filePath": "/path/to/project.ymmp"}'
# → {"assetCount":5,"filePath":"...","status":"Loaded: 5 asset(s) found"}

# 4. 状態を確認
curl http://127.0.0.1:13456/api/state
# → {"appState":"loaded","assets":[...],"statusMessage":"..."}

# 5. スクリーンショットで視覚的に確認
curl http://127.0.0.1:13456/screenshot -o debug/screenshot.png

# 6. データを操作
curl -X PATCH http://127.0.0.1:13456/api/assets \
  -d '{"index": 0, "newPath": "/new/path/file.mp4"}'

# 7. 保存
curl -X POST http://127.0.0.1:13456/api/save -d '{}'
```

### AIエージェントが実際にやること

AIコーディングエージェント（Cursor, Claude Code等）にとって、このAPIは以下のように機能する。

1. **コード修正後の確認**: CSSやレイアウトを変えた後、`/screenshot`で結果を視覚的に確認し、意図通りか判断する
2. **機能テスト**: `/api/open`でファイルを開き、`/api/state`で内部データを確認し、パース処理が正しいかJSON構造レベルで検証する
3. **E2Eシナリオの自動実行**: open → relink → save の一連のフローを`curl`で流し、各ステップで`/api/state`と`/screenshot`を確認する
4. **エラー状態の再現**: 存在しないファイルパスを`/api/open`に投げてエラーハンドリングの動作を確認する

---

## 設計上の判断とトレードオフ

### Q: なぜWebSocketではなくHTTPなのか？

**単純さを優先した。** `curl`一発で叩けることの価値は大きい。AIエージェントのツールチェーンは`curl`やHTTPライブラリは標準で使えるが、WebSocketクライアントとなると追加のセットアップが必要になる場合がある。リクエスト-レスポンスの同期的なモデルもAIにとって理解しやすい。

### Q: Playwright等のE2Eテストツールではダメなのか？

Playwrightは優れたツールだが、目的が異なる。

| 観点 | 本手法 | Playwright等 |
|---|---|---|
| **セットアップ** | アプリ起動のみ | テストランナー+ブラウザドライバ設定が必要 |
| **操作粒度** | ビジネスロジック単位 (`open`, `save`) | DOM要素単位 (`click('#button')`) |
| **状態取得** | 構造化JSON | DOM解析が必要 |
| **AIとの相性** | curlで完結 | テストコード記述が必要 |
| **ホットリロード連携** | 自然に統合 | 再起動が必要な場合がある |

本手法は「AIがコードを書きながらインタラクティブに検証する」ユースケースに特化している。定型的な回帰テストにはE2Eテストツールが適している。

### Q: 本番ビルドに含まれないのか？

起動時のフラグ分岐で確実に除外される。

```typescript
if (!isProd && mainWindow) {
  startDebugServer(mainWindow);
}
```

`isProd`は`process.env.NODE_ENV === 'production'`で判定する。本番ビルドではデバッグサーバーのコードは実行されず、HTTPポートも開かない。

### Q: セキュリティリスクは？

3つの防御層がある。

1. **開発モード限定**: 本番ビルドでは起動しない
2. **ローカルバインド**: `127.0.0.1`にバインドし、外部ネットワークからアクセスできない
3. **認証不要**: ローカル開発環境なので認証の複雑性を避け、シンプルに保つ

---

## このパターンの汎用化

この手法はElectronアプリに限定されない。以下のような応用が考えられる。

### 他のデスクトップフレームワーク

- **Tauri**: Tauriのコマンドシステムに対してHTTPブリッジを書く
- **Flutter Desktop**: Dart側にHTTPサーバーを立て、MethodChannelでUIに中継する
- **SwiftUI / AppKit**: `NWListener`でローカルHTTPサーバーを起動し、UIスレッドにディスパッチする

### 最小構成テンプレート

どんなデスクトップアプリにも応用できる最小要素は3つだけだ。

```
1. ローカル HTTP サーバー（開発モード限定、127.0.0.1 バインド）
2. ウィンドウのスクリーンショット API（/screenshot）
3. UI 操作と等価な JSON API（/api/...）
```

---

## データフロー図解

1つのAPIリクエストが処理される流れを時系列で示す。

```
AIエージェント                    デバッグサーバー       レンダラー(React)
     │                              │                     │
     │  POST /api/open              │                     │
     │  {"filePath":"..."}          │                     │
     │ ─────────────────────────>   │                     │
     │                              │                     │
     │                    コマンドID生成                    │
     │                    Promiseを保管                    │
     │                              │                     │
     │                              │  debug:command      │
     │                              │  {id, type, payload}│
     │                              │ ──────────────────> │
     │                              │                     │
     │                              │             ファイル読み込み
     │                              │             React state更新
     │                              │             UI再描画
     │                              │                     │
     │                              │  debug:response     │
     │                              │  {id, result}       │
     │                              │ <────────────────── │
     │                              │                     │
     │                    Promiseをresolve                  │
     │                              │                     │
     │  200 OK                      │                     │
     │  {"assetCount":5,...}        │                     │
     │ <─────────────────────────   │                     │
     │                              │                     │
     │  GET /screenshot             │                     │
     │ ─────────────────────────>   │                     │
     │                              │                     │
     │                    capturePage()                    │
     │                              │                     │
     │  200 OK (image/png)          │                     │
     │ <─────────────────────────   │                     │
```

---

## 実際の動作例

### AIエージェントがファイルを開いてスクリーンショットで確認するまで

```bash
$ curl -s http://127.0.0.1:13456/api/state | python3 -m json.tool
{
    "appState": "empty",
    "filePath": "",
    "statusMessage": "Ready",
    "assets": []
}
```

まだ何も開いていない状態。ファイルを開く。

```bash
$ curl -s -X POST http://127.0.0.1:13456/api/open \
    -d '{"filePath": "/Users/kohei/project-file-sample.ymmp"}' \
    | python3 -m json.tool
{
    "assetCount": 5,
    "filePath": "/Users/kohei/project-file-sample.ymmp",
    "status": "Loaded: 5 asset(s) found"
}
```

5つの素材が見つかった。スクリーンショットでUIを確認する。

```bash
$ curl -s http://127.0.0.1:13456/screenshot -o debug/screenshot.png
```

この画像をAIのビジョン機能に渡すと、テーブルに5行のデータが表示されていること、各素材のタイプ（VideoItem, ImageItem, AudioItem）が正しくバッジ表示されていること、レトロなUIスタイルが維持されていることなどを視覚的に確認できる。

**API（構造データ）とスクリーンショット（視覚データ）の二重確認**により、AIは「データは正しいがレイアウトが崩れている」「UIは正常だがパースされたデータが欠けている」といった問題を漏れなく検出できる。

---

## 導入時のチェックリスト

自分のデスクトップアプリに導入する際の確認事項:

- [ ] HTTPサーバーは**開発モードでのみ**起動するか
- [ ] `127.0.0.1`にバインドしているか（`0.0.0.0`は厳禁）
- [ ] 本番ビルドにデバッグコードが含まれないか
- [ ] スクリーンショットエンドポイントがあるか
- [ ] 全てのUI操作に対応するAPIエンドポイントがあるか
- [ ] API操作がUIの状態を正しく更新するか（レンダラー経由か）
- [ ] レスポンスはJSON形式で、エラー時も構造化されているか
- [ ] コマンドにタイムアウトが設定されているか

---

## まとめ

「デスクトップアプリ内部にHTTP APIを埋め込む」というシンプルなアイデアが、AIエージェントによるデスクトップアプリ開発の体験を劇的に改善する。

**この手法の本質は、「人間用のGUI」と「AI用のAPI」を同一のビジネスロジック上に構築する**ことだ。APIを叩いてもボタンを押しても、同じ関数が呼ばれ、同じstateが更新され、同じUIが描画される。この一貫性が、AIの操作結果の信頼性を保証する。

将来的に、AIコーディングエージェントがより高度になるにつれ、このような「AIが理解・操作可能なインターフェース」をアプリケーションに組み込む設計パターンはさらに重要になるだろう。現時点では数百行の追加コードで実現できる、低コスト・高リターンなアプローチだ。

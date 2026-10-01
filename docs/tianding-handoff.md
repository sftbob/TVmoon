# TVmoon → 添丁影像館網站交接 v1

## 基準與範圍

- TVmoon 原草稿 PR #6：`cc009f9dab5dedea9a3ed42920bdbd891b2dbf65`，main：`59702c7`。檢查時工作樹乾淨，儲存庫與上層沒有 AGENTS.md。
- 本分支基於 PR #6，保留其播放頁入口與 PWA；以插件交接替換 JSON 匯出與 Windows 腳本。此 PR 包含 PR #6 尚未合併的 PWA 變更，請勿再單獨合併舊下載流程。
- 添丁 PR #1 head 檢查仍為 `bd5e7e693496f87d42961d261bf09befa8b3d256`，與指定契約無差異。不修改添丁儲存庫或本機安裝。
- 契約：[TVMOON_HANDOFF_V1.md](https://github.com/sftbob/tianding-video-hall/blob/bd5e7e693496f87d42961d261bf09befa8b3d256/docs/TVMOON_HANDOFF_V1.md)；證據：[TVMOON_VALIDATION.md](https://github.com/sftbob/tianding-video-hall/blob/bd5e7e693496f87d42961d261bf09befa8b3d256/docs/TVMOON_VALIDATION.md)。
- `src/lib/tvmoon-handoff.js` 原樣採用附件 helper，SHA-256：`37A5F17CBA2436270E4FEE271946E6B00892C9C603CED356AF1CDC4D396A80A4`；TypeScript 宣告與欄位／回覆驗證置於另檔。
- 需要桌面 2.9.0、插件 2.9.0、契約 1。probe AVAILABLE 只表示插件回覆，不代表桌面、設定或 FFmpeg 已就緒。

## 使用與資料流

1. Windows Chrome／Edge 安裝相容候選版，於添丁更新 Native 整合，重新載入插件。
2. 插件選項逐站核准下面的完整 HTTPS origin，接受權限、儲存，再重新整理網站。
3. 添丁保存下載資料夾、畫質、格式與片段並行，確認 FFmpeg／ffprobe。
4. TVmoon 播放頁：勾選集數 → 加入待下載清單。每项顯示來源；換源不會修改既有任務。
5. 网站按來源／影片分組請求 `/api/detail?source=…&id=…&handoff=1`，保留各集完整播放網址。此路徑及上游詳情 fetch 使用 no-store，不代理或探測影片內容。標準詳情分隔只去除第一個名稱分隔符，保留 URL 的 `$`；HTML HLS 備援保留簽名 query。
6. 準備穩定 clientItemId（source＋影片 ID＋集數的 SHA-256）、UUID requestId、版本 1 請求，完成前按鈕禁用。
7. 真實 click 內立即 `sendBatch`，沒有先 await 網路；一次最多 50 筆，不自動分批或重試。網站不傳 parallel/fragments、路徑、命令、headers、Cookie 或 Token 欄位。
8. 桌面負責逐部下載、片段並行、合併、進度與取消。網站顯示交接階段、接受／重複／拒絕數量及逐集拒絕原因，不顯示成下載完成。

本地可保留最多 500 筆 metadata；單次交接最多 50 筆、添丁總清單最多 200 筆。超限時網站禁用送出，桌面容量不足依 QUEUE_FULL 逐項提示。來源需匿名 HEAD／GET 可用且是真正媒體；HTML、直播、DRM、登入或限流不能靠網站橋接繞過。

## 精確網站 origins

| 用途 | 完整 origin | 證據／狀態 |
|---|---|---|
| 正式站 | `https://tv-moon-lime.vercel.app` | 使用者於本次交接提供；本次不更新正式站 |
| 指定預覽 | 待本 PR 的 Vercel 部署確認後填入 | 不沿用 PR #6 的舊預覽 origin |

不含路徑、尾斜線、帳密或萬用字元。不同 hostname／www／port 須分別核准，禁止 `*.vercel.app`。網站只提示授權，不能替使用者修改核准清單。

## 隱私、結果未知與重送

- 載入時清理所有 `tvmoon-downloads:*` 舊清單，持久化 allowlist 只有片名、集數、稳定 ID 與來源 metadata；保留現有 500 筆容量，媒體 URL、sourcePageUrl、preparedRequest 不落盤，不匯出、不記錄。無效／損壞 metadata 不沿用。下載簽名不做 URL 正規化。
- 媒體 URL 與凍結請求只保存在頁面記憶體；重整需重新取得。中斷舊準備時避免晚到資料覆蓋新選擇；播放頁 HLS／播放器错误不記錄原始錯誤資料。
- probe 等 2 秒；batch 等 65 秒。逾時表示結果未知，不是拒絕或取消，鎖住原選擇，手動重試傳同一物件、同一 ID、完整原內容。
- LAUNCH_TIMEOUT、HOST_ERROR、無效回覆與橋接錯誤同樣先核對桌面。REQUEST_ID_CONFLICT／RECEIPT_UNCERTAIN 不提供直接原請求重試；先勾選人工核對確認，再重新選擇確定未交接／需更新項目。
- replayed 是原收據，不是當前進度。already_running 表示追加，不重啟現有 worker。全部重複不會啟動其他等待任務。
- 部分拒絕提供「只勾選被拒集數」，重新取得這些項目的網址並產生新 requestId，成功項目不放入新批次。
- 來源過期或需新內容，使用「重新取得網址／建立新請求」。結果未知時，先人工核對再解鎖，不能在原 ID 下改內容。

## Gate 與驗證證據

- Gate A：固定契約與附件完整閱讀、分支／PR／main 檢查完成。
- Gate B：網站準備、查詢、送出、結果、手動重試、隱私迁移與 50 筆限制完成。
- Gate C：Jest mock／本機合成回覆驗證成功、重複、部分／整批拒絕、逾時同物件重送、准备期禁用、晚到結果、51 筆拒絕、簽名保留、稳定 ID、舊清單清理及 message source/origin/channel/version/ID 驗證。lint／typecheck；production build 以 Linux GitHub CI 與 Vercel 結果為準。
- Gate D：本次查核的本機插件仍是 2.7.0，Native manifest 指向桌面 2.8.0，不能使用本契約。下列共同驗收未完成；mock 測試、添丁隔離 Edge 證據都不等於此網站 Native 交接完成。
- Gate E：等待阿哖驗收；未合併 main、未發布正式版本、未修改添丁安裝。

## 共同驗收清單（目前待測）

使用相容候選桌面／插件與一般 Windows Chrome／Edge profile，先核准預覽 origin，再測：

- [ ] 缺插件、未核准 origin、撤銷權限、重載插件後提示正確。
- [ ] 桌面未開／已開／正在下載／正在關閉，MP4／HLS 單筆與多集交接。
- [ ] 50 筆可準備、51 筆不能送出，桌面容量不足逐項拒絕。
- [ ] 部分拒絕修正後只補送被拒集數；相同請求重送去重與 replayed。
- [ ] 短效 URL 完整送出；過期後明確重新取得、新 ID，不在原 ID 改內容。
- [ ] 桌面重啟需重新提供 URL；網站 localStorage、日誌、匯出皆無媒體網址。
- [ ] 一般 profile 的首次權限提示、相容候選安裝／更新。
- [ ] Windows PWA 視窗另行測試；不宣稱手機可控制 Windows。

真實來源由使用者受控提供，勿將簽名網址貼入公開 PR／日誌。缺少候選包或測試來源時保持待測狀態，不把 mock 當成共同驗收。

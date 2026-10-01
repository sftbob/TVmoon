# 個人版本與上游同步
main 是個人正式版本。功能從 main 建立 feature/*，經 PR、CI、人工檢查後合併。
sync/upstream 從個人 main 建立，包含個人修改與上游 merge commit，不是上游鏡像。

## 初次核對（2026-10-01）
- 個人 main：87463f343c448a2c6283e1913db77fbd39b2dfb6。
- 原設定 senshinya/MoonTV main：129f7dbf34e1a85b3943b7bdf578c97406ea0a5e，無共同祖先。同步必須停止。
- Fork parent samqin123/MoonTV main：c0bba763d16fb5cd830a808d58329025337491cf，是個人 main 的祖先，落後 14 個提交。
- 未確認新的維護來源前，不切換 URL、不用 allow-unrelated-histories 或 force push。變更固定來源需另一個 PR。

## 同步流程
1. 舊 Upstream Sync 在初次檢查時為 disabled_inactivity。流程 PR 合併後，先確認 main 上已是新的手動版，再於 Actions 啟用此 workflow，從 main 手動執行。初期沒有排程。
2. 只推送 sync/upstream；衝突、無共同祖先或 automation 變更一律停止並保留紀錄。
3. 有更新時建立或沿用 draft PR。先審查再批准 GitHub 要求批准的 CI，沒有結果不得合併。
4. 審查依賴、資料格式、環境變數、workflow 與個人化功能；手動檢查登入、搜尋、播放與部署預覽。
5. 通過後以 merge commit 合併。同步 PR 不 squash/rebase，不啟用 auto-merge。
6. 下次同步先合併新的 main。衝突人工解決，不重置 main。

## 管理設定
此 PR 的檔案不修改管理設定。CI 首次成功後另外設定 main 保護：必須 PR、必要 validate 和 pr-build 兩平台檢查、禁止 force push 和刪除、管理員不得繞過。個人倉庫不要求第二位審查者，但本人仍須審查。所有 PR 都執行必要檢查，包括文件變更，避免 path filter 造成永久 pending。
流程 PR 合併前，main 的旧同步仍存在，勿執行旧 Upstream Sync。排程是否啟用須從 Actions 設定確認。

## 站台與回復
不修改應用程式、vercel.json、環境變數。PR 可能觸發預覽站，合併 main 才可能正式部署。
Docker 僅 main 可發佈，PR 只建置、不登入、不發佈。
回復使用 revert PR 或部署平台上一個版本，不重寫 main。
目前有 Jest 設定但沒有應用測試；同步安全測試不是應用功能完整覆蓋。
既有 lint、型別或建置失敗必須處理，不得忽略或以 passWithNoTests 掩蓋。

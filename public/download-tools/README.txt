TVmoon Windows 下載助手（首次設定一次，之後只需選擇任務檔）

1. 解壓縮 tvmoon-windows.zip 到固定資料夾。
2. 從 yt-dlp 官方取得 Windows yt-dlp.exe，放在此資料夾：
   https://github.com/yt-dlp/yt-dlp/releases/latest
3. 從 FFmpeg 官方提供的 Windows 建置連結取得 ffmpeg.exe 與 ffprobe.exe，同樣放在此資料夾：
   https://ffmpeg.org/download.html#build-windows
   兩個工具若已在電腦 PATH 中，也可以沿用。
4. 可選：放入 aria2c.exe，讓支援分段的 HTTP 影片檔使用多連線。
   https://github.com/aria2/aria2/releases
   沒有 aria2c 時，串流片段仍會並行下載；一般檔案使用單連線。

平常使用：
- 網站播放頁展開「批量下載與待下載清單」，勾選集數並加入清單。
- 可切換其他影片累積清單；相同來源與集數重新加入會更新網址。
- 預設同時 2 部、每部 4 條連線。設定會保存在瀏覽器。
- 勾選待下載項目，按「匯出勾選任務」。
- 雙擊 Start-TVmoon.cmd，選擇剛下載的 JSON 任務檔。
- 助手自動處理整批任務。關閉網站不影響，但需保持助手視窗開啟、電腦不要休眠。
- 影片儲存在助手資料夾的 Downloads 子資料夾；各影片有獨立 log，結果在 report-*.json。
- 同一任务檔重跑會續傳或略過已完成的檔案；失败項目另外產生 failed-*.json，可再次選取重試。
- 網址若過期，請回網站重新加入該集並匯出。來源要求特殊驗證或不支援下載時可能失敗。

提醒：
- 網站清單只記錄待下載項目，不會自動接收本機下載進度；匯出不代表完成。
- 串流使用 yt-dlp 的片段並行功能與 FFmpeg 合併。輸出副檔名由來源决定，不強制轉碼。
- 來源限速或不支援分段時，增加連線不一定加快；可把同時下載數降到 1。
- 播放網址可能包含短期存取資訊；清單、任務檔與 log 請保留在自己的電腦。
- 啟動器只對本次 PowerShell 執行使用 Bypass，不會更改系統永久執行政策。
- 不自動下載或安裝工具，不新增服務、不傳送網站密碼，不經 Vercel 轉送影片。

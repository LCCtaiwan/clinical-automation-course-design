# Security Boundary

## Secrets

API key、LINE access token、LINE user ID、Google file ID 與 Apps Script deployment URL 都是部署環境資料，不是 source code。它們應放在 Script Properties 或其他 secret manager，並在分享前確認不會出現在：

- `.gs`、`.json`、HTML、Markdown。
- Git history、issue、pull request、截圖或 log。
- 用來展示的錯誤訊息與複製貼上範例。

公開範例只使用「由使用者自行設定」等 placeholder。

## Web App

Web App 若設定為任何持有連結者可存取，連結本身就等同資料入口。正式部署前應確認：

1. 最新電子報是否包含個人資料或不應公開的內容。
2. Drive 檔案與資料夾分享權限是否符合預期。
3. LINE 訊息是否只傳送給正確的 user ID。
4. 是否需要登入保護，而不是直接使用匿名存取。

## Public repository checklist

- [ ] 已移除真實識別值、token、key 與 URL。
- [ ] 已移除 `.clasp.json`、本地設定與環境檔。
- [ ] 已移除開發紀錄、交接紀錄、真實執行結果與截圖。
- [ ] 已掃描完整檔案內容與 Git history。
- [ ] 發布前以全新 clone 檢查 repository 內容。

# PubMed Newsletter Automation — Design Showcase

這是一個去識別化的設計展示版，說明如何把四大期刊的 PubMed 文獻整理成繁體中文 HTML 電子報，再透過 LINE 通知讀者。

本 repository 的目的，是讓讀者理解整體架構、資料流、模組責任與安全邊界。它不是某個實際部署的備份，也不包含任何真實帳號、部署網址、API key、token、Google Sheet 或開發交接紀錄。

## 系統設計

```text
PubMed E-utilities
        │
        ▼
Google Apps Script
  ├─ 抓取四大期刊文章
  ├─ 過濾研究類型與排除項目
  └─ 寫入 Google Sheet
        │
        ▼
selected_articles（可續跑佇列）
        │
        ▼
Gemini / Groq 翻譯與欄位驗證
        │
        ├──────────────► newsletter（電子報資料）
        │                         │
        │                         ▼
        │                    Google Drive HTML
        │                         │
        └─────────────────────────┴──► LINE Push
```

## 設計重點

- 先抓取與篩選，再翻譯，避免把不需要的文章送進模型。
- Google Sheet 同時扮演資料中繼佇列、翻譯狀態表與執行紀錄。
- 翻譯使用 `PENDING_TRANSLATION → TRANSLATING → TRANSLATED` 狀態，可在 Apps Script 時間限制或 API 額度不足時續跑。
- 文章內容以固定欄位保存，讓翻譯、HTML 組版與 LINE 摘要彼此解耦。
- HTML 電子報保存於 Drive；Web App 提供瀏覽器與手機可直接開啟的閱讀入口。
- LINE 通知只傳送摘要、文章數、研究類型統計與閱讀入口，不把整份文章內容塞進訊息。

## Repository 導覽

- `docs/architecture.md`：元件、資料流與執行生命週期。
- `docs/file-map.md`：公開範例檔案與責任對照。
- `docs/security.md`：公開版排除項目與部署時的安全規則。
- `docs/design-style.md`：課程與介面的視覺設計原則。
- `examples/gas/`：去識別化 Google Apps Script 範例，可作為教學參考。

## GAS 範例的設定方式

所有秘密都應放在 Apps Script 的 Script Properties，不要寫入程式碼或 Git：

```text
PUBMED_API_KEY=由使用者自行設定
GEMINI_API_KEY=由使用者自行設定
GEMINI_MODEL=由使用者自行設定
TRANSLATION_PROVIDER=gemini
DRIVE_FOLDER_ID=由使用者自行設定（可選）
LINE_CHANNEL_ACCESS_TOKEN=由使用者自行設定
LINE_USER_ID=由使用者自行設定
```

若要部署 Web App，請依使用情境決定存取權限。公開展示版的 manifest 只保留設計層級設定；實際部署時仍應由部署者檢查 Apps Script、Drive、Sheet 與 LINE 的分享範圍。

## 不包含的內容

本 repo 刻意不包含：

- 實際 Script ID、deployment URL、Google Drive／Sheet 識別值。
- PubMed、Gemini、Groq、LINE 等 API key、access token、使用者 ID。
- `.clasp.json`、本地設定、登入資訊與環境檔。
- `PROGRESS.md`、`CHANGELOG.md`、`docs/develog.md`、handover 與其他內部開發紀錄。
- 真實電子報、使用者資料、執行截圖與本地絕對路徑。

## 重要提醒

這個 repository 展示的是架構與範例程式。要執行真實流程，必須使用自己的 Google Apps Script、Google Sheet、Drive、API credentials 與 LINE channel，並自行完成授權與部署檢查。

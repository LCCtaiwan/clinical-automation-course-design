# Public File Map

## GAS 範例

| 檔案 | 責任 |
| --- | --- |
| `appsscript.json` | Apps Script runtime、OAuth scopes 與 Web App 設計層級設定 |
| `config.gs` | 期刊、Sheet 分頁、標頭與 Script Properties 讀取 |
| `main.gs` | 正式流程、demo、重試與續跑入口 |
| `pubmed.gs` | PubMed ESearch／EFetch 與 XML 正規化 |
| `filter.gs` | publication type 篩選與選文理由 |
| `sheets.gs` | Google Sheet 建立、讀寫、狀態與 run log |
| `translate.gs` | Gemini／Groq 呼叫、JSON 欄位、術語保護與品質警告 |
| `compose.gs` | 期刊分組、研究類型統計與響應式 HTML |
| `webapp.gs` | 操作頁、最新電子報閱讀路由與授權入口 |
| `line.gs` | LINE Push、完成摘要與閱讀網址 |
| `triggers.gs` | 每週 trigger 與翻譯續跑 trigger |
| `index.html` | GAS Web App 的最小操作介面 |

## 刻意不公開的維運檔

實際專案還需要部署與交接文件，但這些文件不應進入公開 repository，因為可能包含識別值、內部路徑、驗收紀錄或使用者環境資訊。公開版只呈現可重建的設計，不呈現某次實際執行的環境。

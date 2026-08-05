# Architecture

## 元件

| 元件 | 責任 | 主要輸出 |
| --- | --- | --- |
| PubMed E-utilities | 查詢四大期刊、取得文章與摘要 | `raw_articles` |
| 篩選器 | 排除 editorial、letter、comment 等非目標內容 | `selected_articles` |
| Google Sheet | 保存資料、翻譯佇列與執行狀態 | `raw_articles`、`selected_articles`、`newsletter`、`run_log`、`config` |
| Translation provider | 將固定欄位翻成台灣繁體中文 | 翻譯欄位與狀態 |
| Newsletter composer | 依期刊與研究類型分組，產生響應式 HTML | Drive HTML 檔案 |
| Web App | 直接提供最新 HTML 閱讀頁 | 瀏覽器／手機閱讀入口 |
| LINE Push | 傳送完成通知與統計 | LINE 使用者訊息 |

## 資料生命週期

1. `runNewsletterPipeline` 取得目前時間範圍與四個期刊的 PubMed IDs。
2. EFetch 將文章標題、摘要、期刊、出版日期、PMID 與 publication types 寫入 `raw_articles`。
3. 篩選器移除不符合目標的 publication types，將保留文章寫入 `selected_articles`。
4. 翻譯器以文章為單位處理固定欄位。每筆資料先標記為 `TRANSLATING`，成功後寫入翻譯欄位並標記 `TRANSLATED`。
5. 若接近 Apps Script 執行時間限制，流程保留佇列狀態並建立一次性續跑 trigger。
6. 組版器只讀取可交付的資料，依期刊建立章節，將 HTML 儲存到 Drive。
7. LINE 推播讀取文章統計，優先提供 Web App 閱讀網址；若 Web App 不可用，再使用 Drive 檔案網址。
8. `run_log` 記錄每個階段的狀態、處理數量與錯誤，供操作者診斷。

## 佇列狀態

```text
PENDING_TRANSLATION
        │
        ▼
TRANSLATING ──失敗──► TRANSLATE_FAILED
        │
        └────────────► TRANSLATED
```

失敗資料不會靜默消失。操作者可以依錯誤類型重試，或讓電子報以英文摘要作為明確標示的備援內容。

## 邊界與取捨

- Sheet 是教學與小規模流程的透明資料層；較大規模或高併發情境應改用資料庫與佇列服務。
- Apps Script 降低部署門檻，但受單次執行時間、UrlFetch 與模型配額限制，因此設計成可續跑。
- LINE 訊息保持短小，完整內容留在 HTML；這樣可維持閱讀體驗，也避免訊息超長。
- Drive HTML 是可保存的產物，Web App 是可直接閱讀的呈現層，兩者分離以降低單一入口故障的影響。

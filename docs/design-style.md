# ℞ Clinical Automation — 設計規範

一套給「醫院藥師 × 自動化教學」課程用的視覺語言。靈感來自處方箋與臨床紀錄紙:墨藍鋼印、琥珀訊號色、等寬字當「機器/程式」的聲音。這份文件是之後所有課程沿用的統一標準。

---

## 1. 設計精神

| 原則 | 說明 |
|------|------|
| **臨床紙感** | 溫暖的紙色底 + 細格線,像化驗單、處方箋 |
| **機器的聲音** | 程式碼、標籤、頁碼、數據一律用等寬字,和人讀的內文區分開 |
| **一處大膽** | 每頁只留一個記憶點(℞ 符號 / 訊號琥珀),其餘保持安靜克制 |
| **結構即資訊** | 編號、eyebrow、分隔線只在「內容真的有順序」時才用 |

---

## 2. 色彩 Tokens

複製這段到每個新檔的 `:root`:

```css
:root{
  --ink:#0F2A43;        /* 主色 · 深臨床墨藍 — 底、標題、深色頁 */
  --ink-soft:#1D3E5C;   /* 墨藍次階 — 卡片列、終端機列 */
  --paper:#F5F2EC;      /* 背景 · 溫暖化驗紙 */
  --paper-line:#E4DED2; /* 紙上細格線、邊框 */
  --amber:#E8912D;      /* 訊號色 · 琥珀 — 重點、accent、CTA */
  --amber-deep:#C56E14; /* 琥珀深階 — 文字用琥珀(對比足) */
  --teal:#2E7D74;       /* 輔色 · 驗證綠 — 完成、正向、✓ */
  --red:#B23A38;        /* 警示 · 眉角、必做、注意 */
  --white:#FBFAF6;      /* 卡片/表格底 */
  --mut:#5E6B78;        /* 次要文字 · 灰藍 */
}
```

**用色規則**

- 底色只有兩種:`--paper`(亮頁)或 `--ink`(暗頁)。交錯使用製造節奏。
- 琥珀是唯一的強調色,不要再加第二個亮色。文字用琥珀時務必用 `--amber-deep`(亮底對比才夠)。
- 綠只給「完成 / 正確 / 通過」,紅只給「警告 / 必做 / 眉角」。不要拿來裝飾。

---

## 3. 字體系統

```css
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700;900&family=JetBrains+Mono:wght@400;500;700&display=swap');
```

| 角色 | 字體 | 用途 |
|------|------|------|
| **內文 / 標題** | `Noto Sans TC` | 所有中文閱讀內容;標題用 900,內文 400 |
| **機器聲音** | `JetBrains Mono` | 程式碼、eyebrow、頁碼、標籤、數據、時間欄 |

**型階**

```css
h1   { font-size:clamp(38px,6vw,74px); font-weight:900; letter-spacing:-.02em; line-height:1.04 }
h2   { font-size:clamp(28px,4.2vw,46px); font-weight:900; letter-spacing:-.01em }
.lead{ font-size:clamp(17px,2vw,21px); color:var(--mut) }  /* 導言 */
body { line-height:1.7 }
```

> 大標一律負字距 + 900 粗;等寬字則放大字距(`letter-spacing:.2em~.32em`)做出「儀器標籤」感。這組對比是整套風格的骨架。

---

## 4. 招牌元素

**℞ 符號** — 全系列的記憶點。用 `JetBrains Mono` 700。
- 封面大型 ℞(120px+,琥珀)
- 深色頁背景浮水印 ℞(半透明琥珀 `rgba(232,145,45,.12)`)
- 頁尾小 ℞ 當品牌收束

**Eyebrow(小標籤)** — 每個段落開頭:

```css
.eyebrow{
  font-family:'JetBrains Mono'; font-size:12px; font-weight:700;
  letter-spacing:.32em; text-transform:uppercase; color:var(--amber-deep);
  display:flex; align-items:center; gap:12px;
}
.eyebrow::before{ content:""; width:34px; height:2px; background:currentColor }
```

**頁碼系統** — 每頁角落 `01 / GOAL` 格式,等寬字、大字距、灰藍色。編號要對應真實順序。

**十字準星** — 亮頁四角的 `+` 記號(化驗紙定位點):

```css
.slide.paper::before,.slide.paper::after{
  content:"+"; position:absolute; color:var(--paper-line);
  font-family:'JetBrains Mono'; font-size:22px;
}
```

---

## 5. 元件庫

**卡片** — 頂部 3px 色條標示語意(琥珀=一般、綠=正向、紅=警示):

```css
.card{ background:var(--white); border:1px solid var(--paper-line);
  border-top:3px solid var(--amber); padding:24px; border-radius:2px }
.card.ok   { border-top-color:var(--teal) }
.card.warn { border-top-color:var(--red) }
```

**表格** — 墨藍表頭配等寬大字距,hover 變紙色:

```css
th{ background:var(--ink); color:var(--white);
  font-family:'JetBrains Mono'; font-size:12px; letter-spacing:.15em;
  text-transform:uppercase; font-weight:500 }
td,th{ padding:16px 18px; border-bottom:1px solid var(--paper-line) }
tbody tr:hover{ background:#EFEBE1 }
```

**終端機區塊** — 放程式碼,墨藍底 + 三顆紅綠燈(首顆用琥珀):

```css
.terminal{ background:var(--ink); border-radius:6px; overflow:hidden;
  box-shadow:0 20px 50px -20px rgba(15,42,67,.6) }
.term-bar{ background:var(--ink-soft); padding:11px 16px; display:flex; gap:8px }
.term-bar span{ width:11px; height:11px; border-radius:50%; background:#3A5670 }
.term-bar span:first-child{ background:#E8912D }
.terminal pre{ padding:22px; font-family:'JetBrains Mono'; font-size:13.5px;
  line-height:1.8; color:#CFE0EE; white-space:pre-wrap; word-break:break-word }
/* 語法色:註解 #6E8296 / 關鍵字 var(--amber) / 字串 #7FC5A0 */
```

> **重要:** 程式碼永遠 `white-space:pre-wrap`,且每行控制在 ~40 字元內,手機才不會被切(這是先前踩過的坑)。

**流程節點** — 有順序的步驟用圓點 + 虛線連接,終點圓點反白(琥珀底墨藍字)。

**可勾選清單** — 30px 方框,勾選後綠底白勾 + 刪除線;搭配頂部進度條(琥珀漸層 `linear-gradient(90deg,var(--amber),var(--amber-deep))`)。

---

## 6. 版面與間距

- 內容容器 `max-width:1000px`(簡報)/ `820px`(文件),置中。
- 圓角一律小:`2px`(卡片/標籤)~ `6px`(終端機)。不用大圓角。
- 深淺頁交錯排版,製造翻頁節奏。
- 捲動式簡報:每頁 `min-height:100vh`,`.reveal` 進場淡入上移。

---

## 7. 文案語氣

- 標題用主動語態、白話動詞:「讓機器人幫你讀文獻」,不是「文獻自動化解決方案」。
- 從使用者角度命名:講「金鑰」「關鍵字」「按執行」,不是「webhook 設定」。
- 眉角/警示用直述句,不道歉、不含糊:「PubMed 有頻率限制 — 批次抓要加延遲」。
- 收尾放一句 ℞ 開頭的金句,呼應「把時間還給專業判斷」的主題。

---

## 8. 品質底線(每次交付前檢查)

- [ ] 手機(<560px)不溢出、程式碼不被切
- [ ] 鍵盤 focus 可見、`prefers-reduced-motion` 有處理
- [ ] `<div>` 開關數平衡、`<section>`/`<script>` 標籤成對
- [ ] 只有一個亮強調色(琥珀),沒有混入第二個
- [ ] 等寬字與內文字有明確分工

---

*℞ Clinical Automation Design System · 醫院藥師自動化課程系列*

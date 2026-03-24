const express = require('express');
const path = require('path');
const yahooFinance = require('yahoo-finance2').default;

// ============================================================
//  港股買賣信號系統 — Node.js 後端代理
//  功能：從 Yahoo Finance 取得即時報價和歷史數據，
//       加上快取機制，供前端頁面消費。
// ============================================================

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ====== 監控股票清單 ======
const STOCKS = [
  { code: '0700', name: '騰訊控股', sector: '科技' },
  { code: '9988', name: '阿里巴巴', sector: '科技' },
  { code: '9618', name: '京東集團', sector: '科技' },
  { code: '3690', name: '美團', sector: '科技' },
  { code: '9888', name: '百度集團', sector: '科技' },
  { code: '1810', name: '小米集團', sector: '科技' },
  { code: '0005', name: '滙豐控股', sector: '金融' },
  { code: '1398', name: '工商銀行', sector: '金融' },
  { code: '0941', name: '中國移動', sector: '電訊' },
  { code: '2318', name: '中國平安', sector: '金融' },
  { code: '0388', name: '香港交易所', sector: '金融' },
  { code: '2020', name: '安踏體育', sector: '消費' },
  { code: '1211', name: '比亞迪', sector: '汽車' },
  { code: '0981', name: '中芯國際', sector: '半導體' },
  { code: '2269', name: '藥明生物', sector: '醫藥' },
  { code: '0027', name: '銀河娛樂', sector: '博彩' },
  { code: '1928', name: '金沙中國', sector: '博彩' },
  { code: '0669', name: '創科實業', sector: '工業' },
  { code: '0066', name: '港鐵公司', sector: '公用' },
  { code: '0002', name: '中電控股', sector: '公用' },
  { code: '1024', name: '快手', sector: '科技' },
  { code: '9961', name: '攜程集團', sector: '旅遊' },
  { code: '6060', name: '眾安在線', sector: '保險科技' },
  { code: '2382', name: '舜宇光學', sector: '科技' },
  { code: '0175', name: '吉利汽車', sector: '汽車' },
  { code: '6862', name: '海底撈', sector: '餐飲' },
  { code: '2015', name: '理想汽車', sector: '汽車' },
  { code: '9866', name: '蔚來', sector: '汽車' },
  { code: '0883', name: '中國海油', sector: '能源' },
  { code: '3968', name: '招商銀行', sector: '金融' }
];

// ====== 快取 ======
let quoteCache = { data: null, time: 0 };
let historyCache = {};      // { [code]: { data, time } }
const QUOTE_TTL = 30000;    // 報價快取 30 秒
const HISTORY_TTL = 300000;  // 歷史快取 5 分鐘

function sym(code) {
  return `${code}.HK`;
}

// ====== API：即時報價 ======
app.get('/api/quotes', async (req, res) => {
  try {
    const now = Date.now();
    if (quoteCache.data && now - quoteCache.time < QUOTE_TTL) {
      return res.json({ data: quoteCache.data, cached: true, source: 'yahoo' });
    }

    const symbols = STOCKS.map(s => sym(s.code));
    let raw;
    try {
      raw = await yahooFinance.quote(symbols);
    } catch (e) {
      // 某些版本 quote 不支援陣列，逐個取
      const results = [];
      for (const s of symbols) {
        try {
          const q = await yahooFinance.quote(s);
          if (q) results.push(q);
        } catch (_) { /* skip */ }
      }
      raw = results;
    }

    const arr = Array.isArray(raw) ? raw : [raw];
    const quotes = {};

    arr.forEach(q => {
      if (!q || !q.symbol) return;
      const code = q.symbol.replace('.HK', '').padStart(4, '0');
      quotes[code] = {
        price: q.regularMarketPrice ?? 0,
        prevClose: q.regularMarketPreviousClose ?? 0,
        open: q.regularMarketOpen ?? 0,
        high: q.regularMarketDayHigh ?? 0,
        low: q.regularMarketDayLow ?? 0,
        volume: q.regularMarketVolume ?? 0,
        change: q.regularMarketChange ?? 0,
        changePercent: q.regularMarketChangePercent ?? 0,
        pe: q.trailingPE ?? q.forwardPE ?? -1,
        pb: q.priceToBook ?? 0,
        divYield: q.trailingAnnualDividendYield
          ? +(q.trailingAnnualDividendYield * 100).toFixed(2)
          : 0,
        marketCap: q.marketCap ?? 0
      };
    });

    quoteCache = { data: quotes, time: now };
    console.log(`[報價] 成功取得 ${Object.keys(quotes).length} 隻股票`);
    res.json({ data: quotes, cached: false, source: 'yahoo' });
  } catch (err) {
    console.error('[報價錯誤]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ====== API：批量歷史數據 ======
app.get('/api/all-histories', async (req, res) => {
  try {
    const now = Date.now();
    const results = {};
    const toFetch = [];

    STOCKS.forEach(s => {
      if (historyCache[s.code] && now - historyCache[s.code].time < HISTORY_TTL) {
        results[s.code] = historyCache[s.code].data;
      } else {
        toFetch.push(s.code);
      }
    });

    // 分批取 — 每批 5 隻，避免速率限制
    for (let i = 0; i < toFetch.length; i += 5) {
      const batch = toFetch.slice(i, i + 5);
      const batchResults = await Promise.allSettled(
        batch.map(async code => {
          const chart = await yahooFinance.chart(sym(code), {
            period1: new Date(now - 120 * 86400000), // 120天
            interval: '1d'
          });
          const prices = [];
          const volumes = [];
          if (chart && chart.quotes) {
            chart.quotes.forEach(q => {
              if (q.close != null) {
                prices.push(+q.close.toFixed(3));
                volumes.push(q.volume || 0);
              }
            });
          }
          return { code, prices, volumes };
        })
      );

      batchResults.forEach(r => {
        if (r.status === 'fulfilled') {
          const d = r.value;
          results[d.code] = { prices: d.prices, volumes: d.volumes };
          historyCache[d.code] = { data: results[d.code], time: now };
        }
      });

      // 批次間間隔 500ms
      if (i + 5 < toFetch.length) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    console.log(`[歷史] 返回 ${Object.keys(results).length} 隻, 新取 ${toFetch.length} 隻`);
    res.json({ data: results });
  } catch (err) {
    console.error('[歷史錯誤]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ====== API：單隻歷史 ======
app.get('/api/history/:code', async (req, res) => {
  try {
    const code = req.params.code;
    const now = Date.now();

    if (historyCache[code] && now - historyCache[code].time < HISTORY_TTL) {
      return res.json({ data: historyCache[code].data, cached: true });
    }

    const chart = await yahooFinance.chart(sym(code), {
      period1: new Date(now - 120 * 86400000),
      interval: '1d'
    });

    const prices = [];
    const volumes = [];
    if (chart && chart.quotes) {
      chart.quotes.forEach(q => {
        if (q.close != null) {
          prices.push(+q.close.toFixed(3));
          volumes.push(q.volume || 0);
        }
      });
    }

    const data = { prices, volumes };
    historyCache[code] = { data, time: now };
    res.json({ data, cached: false });
  } catch (err) {
    console.error(`[歷史錯誤] ${req.params.code}:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// ====== API：股票清單 ======
app.get('/api/config', (req, res) => {
  res.json(STOCKS);
});

// ====== API：健康檢查 ======
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    stocks: STOCKS.length,
    cacheAge: quoteCache.time ? Date.now() - quoteCache.time : null,
    time: new Date().toISOString()
  });
});

// ====== Fallback ======
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ====== 啟動 ======
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   🚀 港股買賣信號系統 — 後端已啟動       ║');
  console.log(`║   📡 http://localhost:${PORT}               ║`);
  console.log(`║   📊 監控 ${STOCKS.length} 隻港股                    ║`);
  console.log('║   ⏱  報價快取 30s / 歷史快取 5min        ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');
});

const express = require('express');
const path = require('path');
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ============================================================
//  📋 股票清單 — 要增加/刪除股票，只需修改這個陣列
//  修改後 commit 到 GitHub，Render 會自動重新部署
//  格式: {code:'股票代碼', name:'名稱', sector:'板塊'}
// ============================================================
const STOCKS = [
  {code:'0700',name:'騰訊控股',sector:'科技'},
  {code:'9988',name:'阿里巴巴',sector:'科技'},
  {code:'9618',name:'京東集團',sector:'科技'},
  {code:'3690',name:'美團',sector:'科技'},
  {code:'9888',name:'百度集團',sector:'科技'},
  {code:'1810',name:'小米集團',sector:'科技'},
  {code:'0005',name:'滙豐控股',sector:'金融'},
  {code:'1398',name:'工商銀行',sector:'金融'},
  {code:'0941',name:'中國移動',sector:'電訊'},
  {code:'2318',name:'中國平安',sector:'金融'},
  {code:'0388',name:'香港交易所',sector:'金融'},
  {code:'2020',name:'安踏體育',sector:'消費'},
  {code:'1211',name:'比亞迪',sector:'汽車'},
  {code:'0981',name:'中芯國際',sector:'半導體'},
  {code:'2269',name:'藥明生物',sector:'醫藥'},
  {code:'0027',name:'銀河娛樂',sector:'博彩'},
  {code:'1928',name:'金沙中國',sector:'博彩'},
  {code:'0669',name:'創科實業',sector:'工業'},
  {code:'0066',name:'港鐵公司',sector:'公用'},
  {code:'0002',name:'中電控股',sector:'公用'},
  {code:'1024',name:'快手',sector:'科技'},
  {code:'9961',name:'攜程集團',sector:'旅遊'},
  {code:'6060',name:'眾安在線',sector:'保險科技'},
  {code:'2382',name:'舜宇光學',sector:'科技'},
  {code:'0175',name:'吉利汽車',sector:'汽車'},
  {code:'6862',name:'海底撈',sector:'餐飲'},
  {code:'2015',name:'理想汽車',sector:'汽車'},
  {code:'9866',name:'蔚來',sector:'汽車'},
  {code:'0883',name:'中國海油',sector:'能源'},
  {code:'3968',name:'招商銀行',sector:'金融'}
];

const FUND = {
  '0700':{pe:22,pb:4.8,dy:0.8},'9988':{pe:11,pb:1.6,dy:1.2},'9618':{pe:12,pb:1.8,dy:2.1},
  '3690':{pe:32,pb:5.2,dy:0},'9888':{pe:10,pb:0.9,dy:0},'1810':{pe:28,pb:5.5,dy:0},
  '0005':{pe:8,pb:1.0,dy:6.5},'1398':{pe:5,pb:0.5,dy:7.2},'0941':{pe:11,pb:1.3,dy:6.0},
  '2318':{pe:9,pb:1.1,dy:5.8},'0388':{pe:35,pb:9.5,dy:2.5},'2020':{pe:24,pb:6.2,dy:2.0},
  '1211':{pe:22,pb:4.8,dy:0.5},'0981':{pe:50,pb:1.8,dy:0},'2269':{pe:18,pb:2.0,dy:0},
  '0027':{pe:20,pb:2.8,dy:1.5},'1928':{pe:24,pb:10,dy:3.0},'0669':{pe:20,pb:5.5,dy:1.8},
  '0066':{pe:15,pb:0.9,dy:3.8},'0002':{pe:14,pb:1.4,dy:4.2},'1024':{pe:30,pb:3.5,dy:0},
  '9961':{pe:18,pb:3.0,dy:1.0},'6060':{pe:15,pb:1.2,dy:0},'2382':{pe:25,pb:3.8,dy:1.5},
  '0175':{pe:10,pb:2.0,dy:1.5},'6862':{pe:22,pb:8.0,dy:1.0},'2015':{pe:35,pb:4.2,dy:0},
  '9866':{pe:-1,pb:3.5,dy:0},'0883':{pe:7,pb:1.5,dy:7.0},'3968':{pe:6,pb:0.8,dy:5.0}
};

// 代碼對照表：'00700' -> '0700'
const padToOrig = {};
STOCKS.forEach(function(s) { padToOrig[s.code.padStart(5,'0')] = s.code; });

// =============================================
//  即時報價 API（騰訊財經）
// =============================================
async function fetchRealTimeQuotes(codes) {
  var padded = codes.map(function(c) { return 'r_hk' + c.padStart(5,'0'); });
  var qs = padded.join(',');
  var text = '';

  // 嘗試多個端點
  var urls = [
    'https://qt.gtimg.cn/q=' + qs,
    'https://web.sqt.gtimg.cn/q=' + qs
  ];

  for (var u = 0; u < urls.length; u++) {
    try {
      var resp = await fetch(urls[u], {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });
      if (resp.ok) {
        text = await resp.text();
        if (text && text.indexOf('~') > -1) {
          console.log('[RT] Success from endpoint ' + (u+1));
          break;
        }
      }
    } catch(e) {
      console.log('[RT] Endpoint ' + (u+1) + ' failed:', e.message);
    }
  }

  var results = {};
  if (!text) { console.log('[RT] No real-time data'); return results; }

  var re = /v_r_hk(\d+)="([^"]+)"/g;
  var m;
  while ((m = re.exec(text)) !== null) {
    var paddedCode = m[1];
    var origCode = padToOrig[paddedCode] || paddedCode;
    var f = m[2].split('~');
    if (f.length < 8) continue;

    var price = parseFloat(f[3]) || 0;
    var prev = parseFloat(f[4]) || 0;
    if (price <= 0) continue;

    var fund = FUND[origCode] || {pe:0,pb:0,dy:0};
    results[origCode] = {
      name: f[1],
      price: price,
      prevClose: prev,
      open: parseFloat(f[5]) || 0,
      high: parseFloat(f[6]) || 0,
      low: parseFloat(f[7]) || 0,
      volume: 0,
      change: prev > 0 ? +(price - prev).toFixed(3) : 0,
      changePercent: prev > 0 ? +((price - prev) / prev * 100).toFixed(2) : 0,
      pe: fund.pe, pb: fund.pb, divYield: fund.dy, marketCap: 0
    };
  }

  console.log('[RT] Parsed ' + Object.keys(results).length + ' real-time quotes');
  return results;
}

// =============================================
//  K 線數據（歷史 + 備用報價）
// =============================================
async function fetchKlineData(code) {
  var pc = code.padStart(5, '0');
  var url = 'https://web.ifzq.gtimg.cn/appstock/app/hkfqkline/get?param=hk' + pc + ',day,,,120,qfq';
  var resp = await fetch(url);
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  var json = await resp.json();
  var key = 'hk' + pc;
  var d = json.data && json.data[key];
  if (!d) throw new Error('No data for ' + code);

  var days = d.qfqday || d.day || [];
  var prices = [], volumes = [];
  for (var i = 0; i < days.length; i++) {
    prices.push(parseFloat(days[i][2]) || 0);
    volumes.push(parseInt(days[i][5]) || 0);
  }

  var curPrice = prices.length > 0 ? prices[prices.length-1] : 0;
  var prevClose = prices.length > 1 ? prices[prices.length-2] : 0;

  // 嘗試從 qt 取得即時價
  try {
    var qt = d.qt && d.qt[key];
    if (qt && Array.isArray(qt) && qt.length > 4) {
      var p = parseFloat(qt[3]);
      if (p > 0) curPrice = p;
      var pc2 = parseFloat(qt[4]);
      if (pc2 > 0) prevClose = pc2;
    }
  } catch(e) {}

  if (d.prec) {
    var pr = parseFloat(d.prec);
    if (pr > 0) prevClose = pr;
  }

  return { prices: prices, volumes: volumes, curPrice: curPrice, prevClose: prevClose };
}

// 備用：從 K 線取得報價
async function fetchKlineQuotes(codes) {
  var results = {};
  for (var i = 0; i < codes.length; i += 5) {
    var batch = codes.slice(i, i + 5);
    var rs = await Promise.allSettled(batch.map(function(c) { return fetchKlineData(c); }));
    rs.forEach(function(r, idx) {
      if (r.status === 'fulfilled') {
        var d = r.value;
        var code = batch[idx];
        var fund = FUND[code] || {pe:0,pb:0,dy:0};
        var prev = d.prevClose;
        results[code] = {
          price: d.curPrice, prevClose: prev,
          open: 0, high: 0, low: 0,
          volume: d.volumes.length > 0 ? d.volumes[d.volumes.length-1] : 0,
          change: prev > 0 ? +(d.curPrice - prev).toFixed(3) : 0,
          changePercent: prev > 0 ? +((d.curPrice - prev) / prev * 100).toFixed(2) : 0,
          pe: fund.pe, pb: fund.pb, divYield: fund.dy, marketCap: 0
        };
      }
    });
    if (i + 5 < codes.length) await new Promise(function(r) { setTimeout(r, 200); });
  }
  return results;
}

// 綜合取價：先即時，不夠再用 K 線補
async function getQuotes(codes) {
  var quotes = await fetchRealTimeQuotes(codes);
  var missing = codes.filter(function(c) { return !quotes[c]; });
  if (missing.length > 0) {
    console.log('[Fallback] ' + missing.length + ' stocks need K-line fallback');
    var fallback = await fetchKlineQuotes(missing);
    for (var code in fallback) {
      quotes[code] = fallback[code];
    }
  }
  return quotes;
}

// 快取
var quoteCache = { data: null, time: 0 };
var CACHE_TTL = 30000;

// =============================================
//  API 路由
// =============================================

app.get('/api/quotes', async function(req, res) {
  try {
    var now = Date.now();
    if (quoteCache.data && now - quoteCache.time < CACHE_TTL) {
      return res.json({ data: quoteCache.data, cached: true });
    }
    var codes = STOCKS.map(function(s) { return s.code; });
    var quotes = await getQuotes(codes);
    quoteCache = { data: quotes, time: now };
    console.log('[Quotes] ' + Object.keys(quotes).length + '/' + codes.length);
    res.json({ data: quotes, cached: false });
  } catch (err) {
    console.error('[Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/all-histories', async function(req, res) {
  try {
    var hist = {};
    var codes = STOCKS.map(function(s) { return s.code; });
    for (var i = 0; i < codes.length; i += 5) {
      var batch = codes.slice(i, i + 5);
      var rs = await Promise.allSettled(batch.map(function(c) { return fetchKlineData(c); }));
      rs.forEach(function(r, idx) {
        if (r.status === 'fulfilled') {
          hist[batch[idx]] = { prices: r.value.prices, volumes: r.value.volumes };
        }
      });
      if (i + 5 < codes.length) await new Promise(function(r) { setTimeout(r, 200); });
    }
    res.json({ data: hist });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/history/:code', async function(req, res) {
  try {
    var d = await fetchKlineData(req.params.code);
    res.json({ data: { prices: d.prices, volumes: d.volumes } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/config', function(req, res) { res.json(STOCKS); });
app.get('/api/health', function(req, res) { res.json({ status: 'ok', stocks: STOCKS.length, time: new Date().toISOString() }); });
app.get('*', function(req, res) { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() {
  console.log('港股信號系統已啟動 port ' + PORT);
  console.log('監察 ' + STOCKS.length + ' 隻股票');
});

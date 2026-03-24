const express = require('express');
const path = require('path');
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const STOCKS = [
  {code:'0700',name:'騰訊控股',sector:'科技'},{code:'9988',name:'阿里巴巴',sector:'科技'},
  {code:'9618',name:'京東集團',sector:'科技'},{code:'3690',name:'美團',sector:'科技'},
  {code:'9888',name:'百度集團',sector:'科技'},{code:'1810',name:'小米集團',sector:'科技'},
  {code:'0005',name:'滙豐控股',sector:'金融'},{code:'1398',name:'工商銀行',sector:'金融'},
  {code:'0941',name:'中國移動',sector:'電訊'},{code:'2318',name:'中國平安',sector:'金融'},
  {code:'0388',name:'香港交易所',sector:'金融'},{code:'2020',name:'安踏體育',sector:'消費'},
  {code:'1211',name:'比亞迪',sector:'汽車'},{code:'0981',name:'中芯國際',sector:'半導體'},
  {code:'2269',name:'藥明生物',sector:'醫藥'},{code:'0027',name:'銀河娛樂',sector:'博彩'},
  {code:'1928',name:'金沙中國',sector:'博彩'},{code:'0669',name:'創科實業',sector:'工業'},
  {code:'0066',name:'港鐵公司',sector:'公用'},{code:'0002',name:'中電控股',sector:'公用'},
  {code:'1024',name:'快手',sector:'科技'},{code:'9961',name:'攜程集團',sector:'旅遊'},
  {code:'6060',name:'眾安在線',sector:'保險科技'},{code:'2382',name:'舜宇光學',sector:'科技'},
  {code:'0175',name:'吉利汽車',sector:'汽車'},{code:'6862',name:'海底撈',sector:'餐飲'},
  {code:'2015',name:'理想汽車',sector:'汽車'},{code:'9866',name:'蔚來',sector:'汽車'},
  {code:'0883',name:'中國海油',sector:'能源'},{code:'3968',name:'招商銀行',sector:'金融'}
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

let stockCache = {};
const CACHE_TTL = 60000;

function pad5(code) { return code.padStart(5, '0'); }

async function fetchStock(code) {
  const pc = pad5(code);
  const url = 'https://web.ifzq.gtimg.cn/appstock/app/hkfqkline/get?param=hk' + pc + ',day,,,120,qfq';
  const resp = await fetch(url);
  if (!resp.ok) throw new Error('HTTP ' + resp.status);
  const json = await resp.json();
  const key = 'hk' + pc;
  const d = json.data && json.data[key];
  if (!d) throw new Error('No data for ' + code);

  const days = d.qfqday || d.day || [];
  const prices = [], volumes = [], highs = [], lows = [], opens = [];
  for (let i = 0; i < days.length; i++) {
    const row = days[i];
    opens.push(parseFloat(row[1]) || 0);
    prices.push(parseFloat(row[2]) || 0);
    highs.push(parseFloat(row[3]) || 0);
    lows.push(parseFloat(row[4]) || 0);
    volumes.push(parseInt(row[5]) || 0);
  }

  const last = prices.length - 1;
  let curPrice = last >= 0 ? prices[last] : 0;
  let prevClose = last >= 1 ? prices[last - 1] : 0;

  try {
    const qt = d.qt && d.qt[key];
    if (qt && Array.isArray(qt) && qt.length > 4) {
      const p = parseFloat(qt[3]);
      if (p > 0) curPrice = p;
      const pc2 = parseFloat(qt[4]);
      if (pc2 > 0) prevClose = pc2;
    }
  } catch (e) {}

  if (d.prec) {
    const p = parseFloat(d.prec);
    if (p > 0) prevClose = p;
  }

  const fund = FUND[code] || { pe: -1, pb: 0, dy: 0 };
  return {
    prices: prices, volumes: volumes, currentPrice: curPrice, prevClose: prevClose,
    open: last >= 0 ? opens[last] : 0, high: last >= 0 ? highs[last] : 0,
    low: last >= 0 ? lows[last] : 0,
    pe: fund.pe, pb: fund.pb, divYield: fund.dy, marketCap: 0,
    changePercent: prevClose > 0 ? +((curPrice - prevClose) / prevClose * 100).toFixed(2) : 0
  };
}

async function getStock(code) {
  var now = Date.now();
  if (stockCache[code] && now - stockCache[code].time < CACHE_TTL) {
    return stockCache[code].data;
  }
  var data = await fetchStock(code);
  stockCache[code] = { data: data, time: now };
  return data;
}

async function getAllStocks() {
  var results = {};
  for (var i = 0; i < STOCKS.length; i += 5) {
    var batch = STOCKS.slice(i, i + 5);
    var rs = await Promise.allSettled(batch.map(function(s) { return getStock(s.code); }));
    rs.forEach(function(r, idx) {
      if (r.status === 'fulfilled') results[batch[idx].code] = r.value;
    });
    if (i + 5 < STOCKS.length) await new Promise(function(r) { setTimeout(r, 300); });
  }
  return results;
}

app.get('/api/quotes', async function(req, res) {
  try {
    var all = await getAllStocks();
    var quotes = {};
    for (var code in all) {
      var d = all[code];
      quotes[code] = {
        price: d.currentPrice, prevClose: d.prevClose, open: d.open,
        high: d.high, low: d.low, volume: d.volumes[d.volumes.length - 1] || 0,
        change: +(d.currentPrice - d.prevClose).toFixed(3), changePercent: d.changePercent,
        pe: d.pe, pb: d.pb, divYield: d.divYield, marketCap: 0
      };
    }
    console.log('[Quotes] ' + Object.keys(quotes).length + ' stocks');
    res.json({ data: quotes, cached: false, source: 'yahoo' });
  } catch (err) {
    console.error('[Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/all-histories', async function(req, res) {
  try {
    var all = await getAllStocks();
    var hist = {};
    for (var code in all) {
      hist[code] = { prices: all[code].prices, volumes: all[code].volumes };
    }
    res.json({ data: hist });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/history/:code', async function(req, res) {
  try {
    var d = await getStock(req.params.code);
    res.json({ data: { prices: d.prices, volumes: d.volumes } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/config', function(req, res) { res.json(STOCKS); });
app.get('/api/health', function(req, res) { res.json({ status: 'ok', stocks: STOCKS.length, time: new Date().toISOString() }); });
app.get('*', function(req, res) { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

var PORT = process.env.PORT || 3000;
app.listen(PORT, function() { console.log('港股信號系統已啟動 port ' + PORT); });

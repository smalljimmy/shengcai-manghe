// 服务端渲染 HTML 模板：移动端优先，全简体中文
const { WEEK_DAYS, weekDate, fmtMD } = require('./db');

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}
function money(cents) { return '$' + (cents / 100).toFixed(2); }
const isWeekly = (b) => b.box_type === 'weekly';
// 一周套餐的 5 天日期
function weekDates(b) { return WEEK_DAYS.map((_, i) => weekDate(b.pickup_date, i)); }
function pickupText(b) {
  if (isWeekly(b)) {
    const ds = weekDates(b);
    return `${fmtMD(ds[0])}（周一）–${fmtMD(ds[4])}（周五），每天 ${b.pickup_start}–${b.pickup_end}`;
  }
  return `${b.pickup_date} ${b.pickup_start}–${b.pickup_end}`;
}

function layout(title, body, active) {
  const nav = (href, label, key) =>
    `<a href="${href}" class="${active === key ? 'on' : ''}">${label}</a>`;
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)} · 余味 YUWEI</title>
<link rel="icon" type="image/png" href="/img/logo.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+SC:wght@600;700;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/style.css"></head>
<body>
<header class="topbar"><div class="wrap">
  <a class="logo" href="/"><img src="/img/logo.png" alt="余味" class="logo-img">余味<i>·</i><small>YUWEI</small></a>
  <nav>${nav('/', '首页', 'home')}${nav('/my', '我的预订', 'my')}${nav('/join', '商家入驻', 'join')}</nav>
</div></header>
<main class="wrap">${body}</main>
<footer class="foot"><div class="wrap">余味 YUWEI · 打烊前的美味，值得被带走 · 西雅图周边中餐馆</div></footer>
</body></html>`;
}

// 菜品配图：按盲盒标题关键词匹配
function boxImg(b) {
  const t = String(b.title || '');
  if (b.box_type === 'weekly') return '/img/box-weekly.jpg';
  if (/港式|茶餐厅|蛋挞|菠萝/.test(t)) return '/img/box-hktea.jpg';
  if (/便当|盒饭|午市/.test(t)) return '/img/box-lunch.jpg';
  if (/川|麻婆|回锅|干煸/.test(t)) return '/img/box-sichuan.jpg';
  return '/img/box-sichuan.jpg';
}

function boxCard(b) {
  const weekly = isWeekly(b);
  return `<a class="card" href="/box/${b.id}">
    <img class="card-img" src="${boxImg(b)}" alt="${esc(b.title)}" loading="lazy">
    <div class="card-top"><span class="shop">${esc(b.restaurant_name)}</span>
    <span class="left ${b.quantity_left <= 2 ? 'low' : ''}">${weekly ? `剩 ${b.quantity_left} 套` : `剩 ${b.quantity_left} 份`}</span></div>
    <h3>${weekly ? '<span class="badge">📅 一周5天</span> ' : ''}${esc(b.title)}</h3>
    <p class="desc">${esc(b.description || '').slice(0, 60)}</p>
    <div class="price-row"><span class="now">${money(b.box_price_cents)}</span>
      <s class="was">${money(b.original_price_cents)}</s>
      <span class="save">${weekly ? '一周总价' : ''}省 ${money(b.original_price_cents - b.box_price_cents)}</span></div>
    <div class="meta">🕗 取餐 ${esc(pickupText(b))}<br>📍 ${esc(b.address || '')} ${esc(b.city || '')}</div>
    <span class="btn">去预订 →</span>
  </a>`;
}

function home(boxes) {
  const list = boxes.length
    ? `<div class="grid">${boxes.map(boxCard).join('')}</div>`
    : `<div class="empty">今天暂时没有可订的盲盒，<br>明天再来看看吧 👀</div>`;
  return layout('首页', `
    <section class="hero">
      <div class="hero-inner">
        <div class="hero-kicker">余味 YUWEI · 打烊集市</div>
        <h1>打烊前的美味，<br>值得被带走</h1>
        <p>西雅图周边中餐馆的每日剩菜盲盒——低价尝鲜，减少浪费。在线预订，到店自取。</p>
        <a class="btn" href="#today">看看今日盲盒</a>
      </div>
    </section>
    <h2 class="sec" id="today">今日可订盲盒<small>共 ${boxes.length} 款</small></h2>
    ${list}
    <section class="join-cta">
      <h2>餐馆老板，把剩菜变成收入</h2>
      <p>免费入驻，每日卖不完的菜打包成盲盒卖出，好过倒掉。</p>
      <a class="btn big" href="/join">了解商家入驻 →</a>
    </section>
  `, 'home');
}

function boxDetail(b, err) {
  const weekly = isWeekly(b);
  const daysList = weekly
    ? `<ul class="days">${weekDates(b).map((d, i) => `<li>${WEEK_DAYS[i]} ${fmtMD(d)}</li>`).join('')}</ul>` : '';
  return layout(b.title, `
    <a class="back" href="/">← 返回首页</a>
    <div class="detail">
      <img class="detail-img" src="${boxImg(b)}" alt="${esc(b.title)}">
      <span class="shop">${esc(b.restaurant_name)}</span>
      <h1>${weekly ? '<span class="badge">📅 一周5天套餐</span><br>' : ''}${esc(b.title)}</h1>
      <p class="desc">${esc(b.description || '')}</p>
      ${daysList}
      <div class="price-row big"><span class="now">${money(b.box_price_cents)}</span>
        <s class="was">${money(b.original_price_cents)}</s>
        ${weekly ? '<span class="save">一周 5 天总价</span>' : ''}</div>
      <ul class="info">
        <li>🕗 取餐时间：${esc(pickupText(b))}</li>
        <li>📍 ${esc(b.address || '')} ${esc(b.city || '')}</li>
        <li>📞 ${esc(b.phone || '')}</li>
        <li>📦 剩余 <b>${b.quantity_left}</b> / ${b.quantity_total} ${weekly ? '套' : '份'}</li>
      </ul>
      ${weekly ? '<p class="hint">⚠️ 一周套餐一次预订 5 天，每天各 1 个取餐码，分别到店取餐。</p>' : ''}
      ${err ? `<p class="alert">${esc(err)}</p>` : ''}
      <form class="form" method="post" action="/reserve">
        <input type="hidden" name="box_id" value="${b.id}">
        <label>姓名<input name="buyer_name" required maxlength="30" placeholder="取餐人姓名"></label>
        <label>手机号<input name="buyer_phone" required inputmode="tel" maxlength="15" placeholder="用于查询和核销"></label>
        <button class="btn big" type="submit">${weekly ? '预订一周 5 天（到店付款）' : '确认预订（到店付款）'}</button>
        <p class="hint">v1 不做在线支付，到店出示取餐码后付款自取。</p>
      </form>
    </div>
  `, 'home');
}

function soldOut(b, reason) {
  const msg = reason === 'soldout' ? '这个盲盒已经抢光了 😭' : '这个盲盒已过取餐时间 ⌛';
  return layout('已结束', `<a class="back" href="/">← 返回首页</a>
    <div class="empty">${msg}<br><a class="btn" href="/">看看别的盲盒</a></div>`, 'home');
}

// 预订成功：rows = [{day_label, day_date, pickup_code, ...}]
function reserveOk(rows, b) {
  const weekly = isWeekly(b);
  const codesHtml = weekly
    ? `<div class="codes">${rows.map((r) => `
        <div class="coderow"><span>${esc(r.day_label)} ${esc(fmtMD(r.day_date))}</span>
        <b class="code-sm big">${esc(r.pickup_code)}</b></div>`).join('')}</div>`
    : `<div class="code">${esc(rows[0].pickup_code)}</div>`;
  const r0 = rows[0];
  return layout('预订成功', `
    <div class="ok">
      <div class="ok-icon">✅</div>
      <h1>预订成功！</h1>
      <p>请记下你的取餐码，到店出示付款自取${weekly ? '（每天 1 个码）' : ''}：</p>
      ${codesHtml}
      <ul class="info">
        <li>🍱 ${weekly ? '<span class="badge">📅 一周5天</span> ' : ''}${esc(b.title)}（${esc(b.restaurant_name)}）</li>
        <li>💰 到店付款：${money(b.box_price_cents)}${weekly ? '（一周总价）' : ''}</li>
        <li>🕗 取餐：${esc(pickupText(b))}</li>
        <li>📍 ${esc(b.address || '')} ${esc(b.city || '')}</li>
        <li>👤 ${esc(r0.buyer_name)} · ${esc(r0.buyer_phone)}</li>
      </ul>
      <p class="hint">截图保存此页，或用手机号在「我的预订」随时查询。</p>
      <a class="btn big" href="/my">查看我的预订 →</a>
    </div>
  `, 'my');
}

function statusLabel(s) {
  return s === 'reserved' ? '待取餐' : s === 'picked_up' ? '已取餐' : '已取消';
}

// groups: [{bundle_id, box, rows:[...]}]
function myForm(phone, groups, msg) {
  const cards = groups.map((g) => {
    const b = g.box, weekly = isWeekly(b);
    const act = g.rows.some((r) => r.status === 'reserved');
    const codesHtml = g.rows.map((r) => `
      <div class="coderow sm"><span>${r.day_label ? `${esc(r.day_label)} ${esc(fmtMD(r.day_date))}` : '单次'}
        · <span class="st ${r.status}">${statusLabel(r.status)}</span></span>
        <b class="code-sm">${esc(r.pickup_code)}</b></div>`).join('');
    return `<div class="card">
      <div class="card-top"><span class="shop">${esc(b.restaurant_name)}</span>
        ${weekly ? '<span class="badge">📅 一周5天</span>' : ''}</div>
      <h3>${esc(b.title)}</h3>
      <div class="meta">🕗 ${esc(pickupText(b))}<br>📍 ${esc(b.address || '')}</div>
      ${codesHtml}
      ${act ? `
      <form method="post" action="/my/cancel" onsubmit="return confirm('${weekly ? '整周 5 天一起取消' : '确定取消这单'}吗？');">
        <input type="hidden" name="bundle_id" value="${esc(g.bundle_id || '')}">
        <input type="hidden" name="id" value="${g.rows[0].id}">
        <input type="hidden" name="phone" value="${esc(phone)}">
        <button class="btn ghost sm" type="submit">${weekly ? '取消整周' : '取消预订'}</button>
      </form>` : ''}
    </div>`;
  }).join('');
  return layout('我的预订', `
    <h1 class="page-title">🔍 我的预订</h1>
    ${msg ? `<p class="alert">${esc(msg)}</p>` : ''}
    <form class="form inline" method="get" action="/my">
      <input name="phone" value="${esc(phone || '')}" inputmode="tel" placeholder="输入预订时的手机号" required>
      <button class="btn" type="submit">查询</button>
    </form>
    ${phone ? (cards ? `<div class="grid">${cards}</div>` : `<div class="empty">这个手机号没有预订记录</div>`) : ''}
  `, 'my');
}

function join() {
  return layout('商家入驻', `
    <h1 class="page-title">🍜 商家入驻</h1>
    <div class="detail">
      <h2>玩法很简单，三步搞定：</h2>
      <ol class="steps">
        <li><b>注册</b>：填写店名、联系人、电话、地址，免费入驻。</li>
        <li><b>发布盲盒</b>：打烊前把剩菜打包，设个低价和取餐时间段，一键上架。还可以发布<b>一周 5 天套餐</b>，上班族一次订走一周。</li>
        <li><b>客人自取</b>：客人在线预订、到店出示取餐码，你核销收款。</li>
      </ol>
      <h2>费用</h2>
      <p>入驻免费。平台按单抽取少量佣金，<b>具体抽成比例与平台方商议</b>（试点期间优惠）。</p>
      <h2>适合谁</h2>
      <p>西雅图周边中餐馆：每天打烊有剩菜剩饭、想多一份收入、减少浪费的老板。</p>
      <a class="btn big" href="/merchant/register">免费注册开店 →</a>
      <p class="hint">已有账号？<a href="/merchant/login">商家登录</a></p>
    </div>
  `, 'join');
}

function merchantAuth(mode, err) {
  const isReg = mode === 'register';
  return layout(isReg ? '商家注册' : '商家登录', `
    <h1 class="page-title">${isReg ? '📝 商家注册' : '🔑 商家登录'}</h1>
    ${err ? `<p class="alert">${esc(err)}</p>` : ''}
    <form class="form" method="post" action="/merchant/${mode}">
      ${isReg ? `
      <label>店名*<input name="name" required maxlength="60"></label>
      <label>联系人*<input name="contact_name" required maxlength="30"></label>
      <label>微信<input name="wechat" maxlength="40"></label>
      <label>地址<input name="address" maxlength="120" placeholder="街道地址"></label>
      <label>城市<input name="city" maxlength="40" placeholder="如 Bellevue"></label>
      <label>营业时间<input name="hours" maxlength="40" placeholder="如 11:00–21:30"></label>` : ''}
      <label>手机号*<input name="phone" required inputmode="tel" maxlength="15"></label>
      <label>密码*（至少 6 位）<input name="password" type="password" required minlength="6"></label>
      <button class="btn big" type="submit">${isReg ? '注册开店' : '登录'}</button>
    </form>
    <p class="hint">${isReg ? '已有账号？<a href="/merchant/login">去登录</a>' : '还没账号？<a href="/merchant/register">免费注册</a>'}</p>
  `, 'join');
}

function merchantDash(m, boxes, reservations, msg, err) {
  const boxRows = boxes.map((b) => {
    const weekly = isWeekly(b);
    const n = reservations.filter((r) => r.box_id === b.id && r.status === 'reserved').length;
    const noRes = reservations.filter((r) => r.box_id === b.id).length === 0;
    return `<div class="card">
      <div class="card-top"><span class="st ${b.live}">${b.live === 'active' ? '上架中' : b.live === 'soldout' ? '已抢光' : '已过期'}</span>
        <span>${weekly ? `剩 ${b.quantity_left}/${b.quantity_total} 套` : `剩 ${b.quantity_left}/${b.quantity_total} 份`}</span></div>
      <h3>${weekly ? '<span class="badge">📅 一周5天</span> ' : ''}${esc(b.title)}</h3>
      <div class="meta">${money(b.box_price_cents)}${weekly ? '（一周总价）' : ''}（原价 ${money(b.original_price_cents)}）·
        取餐 ${esc(pickupText(b))}<br>待取餐预订：<b>${n}</b></div>
      ${noRes ? `
      <form method="post" action="/merchant/boxes/${b.id}/delete" onsubmit="return confirm('删除这个盲盒？');">
        <button class="btn ghost sm" type="submit">删除</button>
      </form>` : ''}
    </div>`;
  }).join('');

  const resRows = reservations.map((r) => {
    const day = r.day_label ? `${esc(r.day_label)} ${esc(fmtMD(r.day_date))}` : '—';
    return `<tr><td class="code-sm">${esc(r.pickup_code)}</td><td>${esc(r.box_title)}<br><span class="dim">${day}</span></td>
    <td>${esc(r.buyer_name)}<br><span class="dim">${esc(r.buyer_phone)}</span></td>
    <td><span class="st ${r.status}">${statusLabel(r.status)}</span></td></tr>`;
  }).join('');

  return layout('商家后台', `
    <h1 class="page-title">🏪 ${esc(m.name)} <a class="btn ghost sm" href="/merchant/logout">退出</a></h1>
    ${msg ? `<p class="okmsg">${esc(msg)}</p>` : ''}${err ? `<p class="alert">${esc(err)}</p>` : ''}

    <h2 class="sec">✅ 到店核销</h2>
    <form class="form inline" method="post" action="/merchant/redeem">
      <input name="code" inputmode="numeric" maxlength="6" placeholder="输入客人 6 位取餐码" required>
      <button class="btn" type="submit">核销</button>
    </form>
    <p class="hint">一周套餐的 5 个码各自独立核销，客人每天出示当天的码。</p>

    <h2 class="sec">➕ 发布盲盒</h2>
    <form class="form" method="post" action="/merchant/boxes">
      <label>类型*
        <select name="box_type">
          <option value="single">单次盲盒</option>
          <option value="weekly">📅 一周 5 天套餐（周一–周五，价格为一周总价）</option>
        </select></label>
      <label>标题*<input name="title" required maxlength="60" placeholder="如：今晚川菜盲盒"></label>
      <label>描述<textarea name="description" rows="3" maxlength="300" placeholder="大概有哪些菜、几份量"></textarea></label>
      <div class="row2">
        <label>原价 ($)*<input name="original_price" required inputmode="decimal" placeholder="25.00"></label>
        <label>盲盒价 ($)*<input name="box_price" required inputmode="decimal" placeholder="7.99"></label>
      </div>
      <div class="row2">
        <label>份数*（一周套餐=套数）<input name="quantity" required inputmode="numeric" type="number" min="1" max="999" value="5"></label>
        <label>取餐日期*（一周套餐填周一）<input name="pickup_date" required type="date"></label>
      </div>
      <div class="row2">
        <label>开始时间*<input name="pickup_start" required type="time" value="20:00"></label>
        <label>结束时间*<input name="pickup_end" required type="time" value="21:30"></label>
      </div>
      <button class="btn big" type="submit">发布上架</button>
    </form>

    <h2 class="sec">📦 我的盲盒（${boxes.length}）</h2>
    ${boxRows ? `<div class="grid">${boxRows}</div>` : '<div class="empty">还没有盲盒，先发布一个吧</div>'}

    <h2 class="sec">🧾 预订记录（${reservations.length}）</h2>
    ${resRows ? `<table class="tbl"><tr><th>取餐码</th><th>盲盒 / 日期</th><th>客人</th><th>状态</th></tr>${resRows}</table>` : '<div class="empty">暂无预订</div>'}
  `, 'join');
}

function adminLogin(err) {
  return layout('管理员', `
    <h1 class="page-title">🔐 管理员登录</h1>
    ${err ? `<p class="alert">${esc(err)}</p>` : ''}
    <form class="form" method="post" action="/admin/login">
      <label>管理密码<input name="password" type="password" required></label>
      <button class="btn big" type="submit">进入</button>
    </form>`);
}

function adminDash(stats, perShop, restaurants, boxes, reservations) {
  const shopRows = perShop.map((s) => `
    <tr><td>${esc(s.name)}</td><td>${s.total}</td><td>${s.picked}</td>
    <td>${money(s.gmv_cents)}</td></tr>`).join('');
  const rRows = restaurants.map((r) => `
    <tr><td>${esc(r.name)}<br><span class="dim">${esc(r.phone)}</span></td>
    <td><span class="st ${r.status}">${r.status === 'active' ? '正常' : '停用'}</span></td>
    <td><form method="post" action="/admin/restaurants/${r.id}/toggle" style="display:inline">
      <button class="btn ghost sm" type="submit">${r.status === 'active' ? '停用' : '启用'}</button></form></td></tr>`).join('');
  const bRows = boxes.map((b) => `
    <tr><td>${isWeekly(b) ? '📅 ' : ''}${esc(b.title)}<br><span class="dim">${esc(b.restaurant_name)}</span></td>
    <td>${b.quantity_left}/${b.quantity_total}</td>
    <td><span class="st ${b.live}">${b.live === 'active' ? '上架中' : b.live === 'soldout' ? '抢光' : '过期'}</span></td></tr>`).join('');
  const vRows = reservations.slice(0, 30).map((r) => `
    <tr><td class="code-sm">${esc(r.pickup_code)}</td><td>${esc(r.box_title)}${r.day_label ? `<br><span class="dim">${esc(r.day_label)}</span>` : ''}</td>
    <td>${esc(r.buyer_name)}</td>
    <td><span class="st ${r.status}">${statusLabel(r.status)}</span></td></tr>`).join('');

  return layout('管理后台', `
    <h1 class="page-title">📊 管理后台 <a class="btn ghost sm" href="/admin/logout">退出</a></h1>
    <div class="stats">
      <div class="stat"><b>${stats.total_res}</b><span>总预订</span></div>
      <div class="stat"><b>${stats.picked}</b><span>已取餐</span></div>
      <div class="stat"><b>${money(stats.gmv_cents)}</b><span>成交额</span></div>
      <div class="stat"><b>${stats.shops}</b><span>餐馆数</span></div>
    </div>
    <h2 class="sec">💰 分餐馆统计（抽成对账）</h2>
    <table class="tbl"><tr><th>餐馆</th><th>预订</th><th>已取</th><th>成交额</th></tr>${shopRows}</table>
    <h2 class="sec">🏪 餐馆</h2>
    <table class="tbl"><tr><th>餐馆</th><th>状态</th><th>操作</th></tr>${rRows}</table>
    <h2 class="sec">📦 盲盒</h2>
    <table class="tbl"><tr><th>盲盒</th><th>剩余/总数</th><th>状态</th></tr>${bRows}</table>
    <h2 class="sec">🧾 最近预订</h2>
    <table class="tbl"><tr><th>取餐码</th><th>盲盒</th><th>客人</th><th>状态</th></tr>${vRows}</table>
  `);
}

function errorPage(msg) {
  return layout('出错了', `<div class="empty">⚠️ ${esc(msg)}<br><br><a class="btn" href="/">回首页</a></div>`);
}

module.exports = {
  esc, money, layout, home, boxDetail, soldOut, reserveOk, myForm,
  join, merchantAuth, merchantDash, adminLogin, adminDash, errorPage,
  weekDates, pickupText, isWeekly,
};

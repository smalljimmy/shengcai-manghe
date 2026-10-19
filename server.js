// 剩菜盲盒 v1 验证版 — Node + Express + better-sqlite3，服务端渲染，无构建步骤
process.env.TZ = process.env.TZ || 'America/Los_Angeles';

const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const { initDb, todayStr, weekDate, WEEK_DAYS } = require('./lib/db');
const v = require('./lib/views');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const db = initDb();

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'shengcai-dev-secret-CHANGE-ME',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 3600 * 1000 },
}));

// ---------- 小工具 ----------
function cleanPhone(s) { return String(s || '').replace(/\D/g, ''); }
function validPhone(s) { const p = cleanPhone(s); return p.length >= 7 && p.length <= 15 ? p : null; }
const isWeekly = (b) => b && b.box_type === 'weekly';
// 盲盒实时状态：份数 / 取餐结束时间 决定（一周套餐按周五结束时间算过期）
function live(box) {
  if (box.quantity_left <= 0) return 'soldout';
  const endDate = isWeekly(box) ? weekDate(box.pickup_date, 4) : box.pickup_date;
  const end = new Date(`${endDate}T${box.pickup_end}:00`);
  if (!isNaN(end.getTime()) && Date.now() > end.getTime()) return 'expired';
  return 'active';
}
// 每日唯一的随机 6 位取餐码
function genPickupCode() {
  const today = todayStr();
  for (let i = 0; i < 30; i++) {
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const hit = db.prepare(
      "SELECT 1 FROM reservations WHERE pickup_code = ? AND substr(created_at, 1, 10) = ?"
    ).get(code, today);
    if (!hit) return code;
  }
  throw new Error('取餐码生成冲突，请重试');
}
function getBox(id) {
  return db.prepare(`SELECT b.*, r.name AS restaurant_name, r.address, r.city, r.phone, r.status AS rstatus
    FROM boxes b JOIN restaurants r ON r.id = b.restaurant_id WHERE b.id = ?`).get(id);
}
// 给预订行补上 day_date（一周套餐用；缺 pickup_date 时跳过）
function withDayDate(rows) {
  return rows.map((r) => (r.day_label && r.pickup_date)
    ? { ...r, day_date: weekDate(r.pickup_date, WEEK_DAYS.indexOf(r.day_label)) } : r);
}
function merchantBoxes(mid) {
  return db.prepare('SELECT * FROM boxes WHERE restaurant_id = ? ORDER BY pickup_date DESC, id DESC').all(mid)
    .map((b) => ({ ...b, live: live(b) }));
}
function requireMerchant(req, res, next) {
  const m = req.session.merchantId
    ? db.prepare("SELECT * FROM restaurants WHERE id = ? AND status = 'active'").get(req.session.merchantId)
    : null;
  if (!m) return res.redirect('/merchant/login');
  req.merchant = m; next();
}
function requireAdmin(req, res, next) {
  if (!req.session.admin) return res.redirect('/admin');
  next();
}

// ---------- 买家端 ----------
// 首页：今日可订盲盒（一周套餐在周一至周五都展示）
app.get('/', (req, res) => {
  const rows = db.prepare(`SELECT b.*, r.name AS restaurant_name, r.address, r.city
    FROM boxes b JOIN restaurants r ON r.id = b.restaurant_id
    WHERE r.status = 'active'
      AND (b.pickup_date = ? OR (b.box_type = 'weekly' AND ? BETWEEN b.pickup_date AND date(b.pickup_date, '+4 days')))
    ORDER BY b.pickup_start`).all(todayStr(), todayStr());
  res.send(v.home(rows.filter((b) => live(b) === 'active')));
});

// 盲盒详情 + 预订表单
app.get('/box/:id', (req, res) => {
  const b = getBox(req.params.id);
  if (!b || b.rstatus !== 'active') return res.status(404).send(v.errorPage('盲盒不存在'));
  const st = live(b);
  if (st !== 'active') return res.send(v.soldOut(b, st));
  res.send(v.boxDetail(b, req.query.err));
});

// 提交预订 → 取餐码（单次 1 个码；一周套餐一次生成 5 个码）
app.post('/reserve', (req, res) => {
  const name = String(req.body.buyer_name || '').trim().slice(0, 30);
  const phone = validPhone(req.body.buyer_phone);
  const b = getBox(req.body.box_id);
  if (!name || !phone) return res.status(400).send(v.errorPage('请填写姓名和有效手机号'));
  if (!b || b.rstatus !== 'active') return res.status(404).send(v.errorPage('盲盒不存在'));
  const st0 = live(b);
  if (st0 !== 'active') return res.send(v.soldOut(b, st0));

  const weekly = isWeekly(b);
  let rows;
  try {
    rows = db.transaction(() => {
      // 一周套餐按"套"扣库存；单次按"份"
      const upd = db.prepare('UPDATE boxes SET quantity_left = quantity_left - 1 WHERE id = ? AND quantity_left > 0').run(b.id);
      if (upd.changes === 0) throw new Error('soldout');
      const ins = db.prepare(`INSERT INTO reservations
        (box_id, bundle_id, day_label, buyer_name, buyer_phone, pickup_code)
        VALUES (?,?,?,?,?,?)`);
      if (weekly) {
        const bundle = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        return WEEK_DAYS.map((day) => {
          const code = genPickupCode();
          const id = ins.run(b.id, bundle, day, name, phone, code).lastInsertRowid;
          return db.prepare('SELECT * FROM reservations WHERE id = ?').get(id);
        });
      }
      const code = genPickupCode();
      const id = ins.run(b.id, null, null, name, phone, code).lastInsertRowid;
      return [db.prepare('SELECT * FROM reservations WHERE id = ?').get(id)];
    })();
  } catch (e) { return res.send(v.soldOut(b, 'soldout')); }
  const dated = rows.map((r) => ({ ...r, pickup_date: b.pickup_date }));
  res.send(v.reserveOk(withDayDate(dated), getBox(b.id)));
});

// 我的预订：手机号查询（同 bundle 的 5 个码归为一组）
app.get('/my', (req, res) => {
  const phone = req.query.phone ? validPhone(req.query.phone) : null;
  let groups = [];
  if (phone) {
    const rows = withDayDate(db.prepare(`SELECT r.*, b.title, b.box_type, b.pickup_date, b.pickup_start, b.pickup_end,
        rt.name AS restaurant_name, rt.address
      FROM reservations r JOIN boxes b ON b.id = r.box_id
      JOIN restaurants rt ON rt.id = b.restaurant_id
      WHERE r.buyer_phone = ? ORDER BY r.id DESC`).all(phone));
    const map = new Map();
    for (const r of rows) {
      const key = r.bundle_id || ('s' + r.id);
      if (!map.has(key)) map.set(key, { bundle_id: r.bundle_id, box: r, rows: [] });
      map.get(key).rows.push(r);
    }
    groups = [...map.values()];
    // 组内按周一→周五排序
    for (const g of groups) g.rows.sort((a, b) =>
      WEEK_DAYS.indexOf(a.day_label || '') - WEEK_DAYS.indexOf(b.day_label || ''));
  }
  res.send(v.myForm(req.query.phone || '', groups, req.query.msg));
});

// 取消预订（一周套餐整周一起取消，库存 +1 套）
app.post('/my/cancel', (req, res) => {
  const phone = validPhone(req.body.phone);
  const back = '/my?phone=' + encodeURIComponent(req.body.phone || '');
  if (!phone) return res.redirect(back);
  const r = db.prepare('SELECT * FROM reservations WHERE id = ?').get(req.body.id);
  if (!r || r.buyer_phone !== phone) return res.redirect(back);
  const ids = r.bundle_id
    ? db.prepare("SELECT id FROM reservations WHERE bundle_id = ? AND buyer_phone = ? AND status = 'reserved'")
      .all(r.bundle_id, phone).map((x) => x.id)
    : (r.status === 'reserved' ? [r.id] : []);
  if (!ids.length) return res.redirect(back);
  db.transaction(() => {
    db.prepare(`UPDATE reservations SET status = 'cancelled' WHERE id IN (${ids.map(() => '?').join(',')})`).run(...ids);
    db.prepare('UPDATE boxes SET quantity_left = quantity_left + 1 WHERE id = ?').run(r.box_id);
  })();
  res.redirect(back + '&msg=' + encodeURIComponent('已取消预订'));
});

// ---------- 商家入驻说明 ----------
app.get('/join', (req, res) => res.send(v.join()));

// ---------- 商家门户 ----------
app.get('/merchant', (req, res) => res.redirect(req.session.merchantId ? '/merchant/dashboard' : '/merchant/login'));
app.get('/merchant/register', (req, res) => res.send(v.merchantAuth('register')));
app.post('/merchant/register', (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 60);
  const contact = String(req.body.contact_name || '').trim().slice(0, 30);
  const phone = validPhone(req.body.phone);
  const pw = String(req.body.password || '');
  if (!name || !contact || !phone || pw.length < 6)
    return res.status(400).send(v.merchantAuth('register', '请填写店名、联系人、有效手机号，密码至少 6 位'));
  if (db.prepare('SELECT 1 FROM restaurants WHERE phone = ?').get(phone))
    return res.status(400).send(v.merchantAuth('register', '这个手机号已经注册过，请直接登录'));
  const id = db.prepare(`INSERT INTO restaurants
    (name, contact_name, phone, wechat, address, city, hours, password_hash)
    VALUES (?,?,?,?,?,?,?,?)`).run(name, contact,
    phone, String(req.body.wechat || '').trim().slice(0, 40) || null,
    String(req.body.address || '').trim().slice(0, 120) || null,
    String(req.body.city || '').trim().slice(0, 40) || null,
    String(req.body.hours || '').trim().slice(0, 40) || null,
    bcrypt.hashSync(pw, 10)).lastInsertRowid;
  req.session.merchantId = id;
  res.redirect('/merchant/dashboard');
});
app.get('/merchant/login', (req, res) => res.send(v.merchantAuth('login', req.query.err)));
app.post('/merchant/login', (req, res) => {
  const phone = validPhone(req.body.phone);
  const m = phone ? db.prepare('SELECT * FROM restaurants WHERE phone = ?').get(phone) : null;
  if (!m || !bcrypt.compareSync(String(req.body.password || ''), m.password_hash) || m.status !== 'active')
    return res.status(401).send(v.merchantAuth('login', '手机号或密码不对，或账号已被停用'));
  req.session.merchantId = m.id;
  res.redirect('/merchant/dashboard');
});
app.get('/merchant/logout', (req, res) => { req.session.merchantId = null; res.redirect('/'); });

app.get('/merchant/dashboard', requireMerchant, (req, res) => {
  const boxes = merchantBoxes(req.merchant.id);
  const reservations = withDayDate(db.prepare(`SELECT r.*, b.title AS box_title, b.pickup_date
    FROM reservations r JOIN boxes b ON b.id = r.box_id
    WHERE b.restaurant_id = ? ORDER BY r.id DESC`).all(req.merchant.id));
  res.send(v.merchantDash(req.merchant, boxes, reservations, req.query.msg, req.query.err));
});

// 发布盲盒（含一周套餐类型）
app.post('/merchant/boxes', requireMerchant, (req, res) => {
  const boxType = req.body.box_type === 'weekly' ? 'weekly' : 'single';
  const title = String(req.body.title || '').trim().slice(0, 60);
  const op = Math.round(parseFloat(req.body.original_price) * 100);
  const bp = Math.round(parseFloat(req.body.box_price) * 100);
  const qty = parseInt(req.body.quantity, 10);
  const date = String(req.body.pickup_date || '');
  const start = String(req.body.pickup_start || ''), end = String(req.body.pickup_end || '');
  const err = !title ? '请填写标题'
    : !(op > 0 && bp > 0) ? '价格必须是大于 0 的数字'
    : bp > op ? '盲盒价不能高于原价'
    : !(qty >= 1 && qty <= 999) ? (boxType === 'weekly' ? '套数填 1–999' : '份数填 1–999')
    : !/^\d{4}-\d{2}-\d{2}$/.test(date) ? '取餐日期格式不对'
    : !(start < end) ? '结束时间必须晚于开始时间' : null;
  if (err) return res.redirect('/merchant/dashboard?err=' + encodeURIComponent(err));
  db.prepare(`INSERT INTO boxes (restaurant_id, box_type, title, description, original_price_cents,
    box_price_cents, quantity_total, quantity_left, pickup_date, pickup_start, pickup_end)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(req.merchant.id, boxType, title,
    String(req.body.description || '').trim().slice(0, 300) || null,
    op, bp, qty, qty, date, start, end);
  res.redirect('/merchant/dashboard?msg=' + encodeURIComponent(boxType === 'weekly' ? '一周套餐发布成功，已上架' : '盲盒发布成功，已上架'));
});

// 删除盲盒（仅无预订记录时）
app.post('/merchant/boxes/:id/delete', requireMerchant, (req, res) => {
  const b = db.prepare('SELECT * FROM boxes WHERE id = ? AND restaurant_id = ?').get(req.params.id, req.merchant.id);
  const n = b ? db.prepare('SELECT COUNT(*) c FROM reservations WHERE box_id = ?').get(b.id).c : 1;
  if (!b || n > 0) return res.redirect('/merchant/dashboard?err=' + encodeURIComponent('已有预订记录的盲盒不能删除'));
  db.prepare('DELETE FROM boxes WHERE id = ?').run(b.id);
  res.redirect('/merchant/dashboard?msg=' + encodeURIComponent('已删除'));
});

// 核销：输入取餐码 → 标记已取（一周套餐的 5 个码各自独立核销）
app.post('/merchant/redeem', requireMerchant, (req, res) => {
  const code = String(req.body.code || '').trim();
  const r = db.prepare(`SELECT r.*, b.restaurant_id, b.title AS box_title, b.pickup_date FROM reservations r
    JOIN boxes b ON b.id = r.box_id
    WHERE r.pickup_code = ? AND substr(r.created_at, 1, 10) = ?`)
    .get(code, todayStr());
  const done = (ok, m) => res.redirect('/merchant/dashboard?' + (ok ? 'msg=' : 'err=') + encodeURIComponent(m));
  if (!/^\d{6}$/.test(code)) return done(false, '取餐码是 6 位数字');
  if (!r || r.restaurant_id !== req.merchant.id) return done(false, '取餐码无效（不是今天本店的单）');
  if (r.status !== 'reserved') return done(false, '这单已经' + (r.status === 'picked_up' ? '核销过' : '取消') + '了');
  db.prepare("UPDATE reservations SET status = 'picked_up' WHERE id = ?").run(r.id);
  const day = r.day_label ? `（${r.day_label} ${r.pickup_date && weekDate(r.pickup_date, WEEK_DAYS.indexOf(r.day_label))}）` : '';
  return done(true, `核销成功 ✅ ${r.box_title}${day} ${r.buyer_name}`);
});

// ---------- 管理后台 ----------
// 成交额口径：已取餐订单的实付金额（一周套餐按天折算：总价/5，四舍五入到分）
const GMV_SQL = `COALESCE(SUM(CASE WHEN r.status = 'picked_up'
  THEN CASE WHEN b.box_type = 'weekly' AND r.bundle_id IS NOT NULL
    THEN ROUND(b.box_price_cents / 5.0) ELSE b.box_price_cents END
  ELSE 0 END), 0)`;
app.get('/admin', (req, res) => {
  if (req.session.admin) return res.redirect('/admin/dashboard');
  res.send(v.adminLogin(req.query.err));
});
app.post('/admin/login', (req, res) => {
  if (String(req.body.password || '') === ADMIN_PASSWORD) {
    req.session.admin = true;
    return res.redirect('/admin/dashboard');
  }
  res.status(401).send(v.adminLogin('密码不对'));
});
app.get('/admin/logout', (req, res) => { req.session.admin = null; res.redirect('/admin'); });
app.get('/admin/dashboard', requireAdmin, (req, res) => {
  const stats = {
    total_res: db.prepare('SELECT COUNT(*) c FROM reservations').get().c,
    picked: db.prepare("SELECT COUNT(*) c FROM reservations WHERE status = 'picked_up'").get().c,
    gmv_cents: Math.round(db.prepare(`SELECT ${GMV_SQL} s FROM reservations r
      JOIN boxes b ON b.id = r.box_id`).get().s),
    shops: db.prepare('SELECT COUNT(*) c FROM restaurants').get().c,
  };
  const perShop = db.prepare(`SELECT rt.id, rt.name,
      COUNT(r.id) AS total,
      COALESCE(SUM(r.status = 'picked_up'), 0) AS picked,
      ${GMV_SQL} AS gmv_cents
    FROM restaurants rt
    LEFT JOIN boxes b ON b.restaurant_id = rt.id
    LEFT JOIN reservations r ON r.box_id = b.id
    GROUP BY rt.id ORDER BY total DESC`).all()
    .map((s) => ({ ...s, gmv_cents: Math.round(s.gmv_cents) }));
  const restaurants = db.prepare('SELECT * FROM restaurants ORDER BY id').all();
  const boxes = db.prepare(`SELECT b.*, r.name AS restaurant_name FROM boxes b
    JOIN restaurants r ON r.id = b.restaurant_id ORDER BY b.id DESC`).all()
    .map((b) => ({ ...b, live: live(b) }));
  const reservations = withDayDate(db.prepare(`SELECT r.*, b.title AS box_title, b.pickup_date FROM reservations r
    JOIN boxes b ON b.id = r.box_id ORDER BY r.id DESC LIMIT 100`).all());
  res.send(v.adminDash(stats, perShop, restaurants, boxes, reservations));
});
app.post('/admin/restaurants/:id/toggle', requireAdmin, (req, res) => {
  const r = db.prepare('SELECT * FROM restaurants WHERE id = ?').get(req.params.id);
  if (r) db.prepare('UPDATE restaurants SET status = ? WHERE id = ?')
    .run(r.status === 'active' ? 'disabled' : 'active', r.id);
  res.redirect('/admin/dashboard');
});

app.use((req, res) => res.status(404).send(v.errorPage('页面不存在')));

app.listen(PORT, () => {
  console.log(`[剩菜盲盒] 启动成功 → http://localhost:${PORT}`);
  console.log(`[剩菜盲盒] 管理后台默认密码: ${ADMIN_PASSWORD === 'admin123' ? 'admin123（上线前务必改掉！）' : '(已通过环境变量设置)'}`);
});

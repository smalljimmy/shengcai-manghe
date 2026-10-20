const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'shengcai.db');
const WEEK_DAYS = ['周一', '周二', '周三', '周四', '周五'];

function todayStr(d = new Date()) {
const p = (n) => String(n).padStart(2, '0');
return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
// 本周一（用于一周套餐示例数据）
function mondayStr() {
const d = new Date();
d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
return todayStr(d);
}
// pickup_date（周一）+ 第 i 天 → YYYY-MM-DD
function weekDate(monday, i) {
const [y, m, d] = monday.split('-').map(Number);
const dt = new Date(y, m - 1, d + i);
return todayStr(dt);
}
function fmtMD(ymd) {
const [, m, d] = ymd.split('-');
return `${Number(m)}/${Number(d)}`;
}

function initDb() {
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true});
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS restaurants (
id INTEGER PRIMARY KEY AUTOINCREMENT,
name TEXT NOT NULL,
contact_name TEXT NOT NULL,
phone TEXT NOT NULL,
wechat TEXT,
address TEXT,
city TEXT,
hours TEXT,
password_hash TEXT NOT NULL,
status TEXT NOT NULL DEFAULT 'active',
created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS boxes (
id INTEGER PRIMARY KEY AUTOINCREMENT,
restaurant_id INTEGER NOT NULL REFERENCES restaurants(id),
box_type TEXT NOT NULL DEFAULT 'single',
title TEXT NOT NULL,
description TEXT,
original_price_cents INTEGER NOT NULL,
box_price_cents INTEGER NOT NULL,
quantity_total INTEGER NOT NULL,
quantity_left INTEGER NOT NULL,
pickup_date TEXT NOT NULL,
pickup_start TEXT NOT NULL,
pickup_end TEXT NOT NULL,
status TEXT NOT NULL DEFAULT 'active',
created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS reservations (
id INTEGER PRIMARY KEY AUTOINCREMENT,
box_id INTEGER NOT NULL REFERENCES boxes(id),
bundle_id TEXT,
day_label TEXT,
buyer_name TEXT NOT NULL,
buyer_phone TEXT NOT NULL,
pickup_code TEXT NOT NULL,
status TEXT NOT NULL DEFAULT 'reserved',
created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS pv_daily (
day TEXT NOT NULL,
path TEXT NOT NULL,
views INTEGER NOT NULL DEFAULT 0,
PRIMARY KEY (day, path)
);
CREATE TABLE IF NOT EXISTS uv_daily (
day TEXT NOT NULL,
ip_hash TEXT NOT NULL,
PRIMARY KEY (day, ip_hash)
);
CREATE INDEX IF NOT EXISTS idx_res_code ON reservations(pickup_code);
CREATE INDEX IF NOT EXISTS idx_res_bundle ON reservations(bundle_id);
CREATE INDEX IF NOT EXISTS idx_boxes_rest ON boxes(restaurant_id);
`);

const n = db.prepare('SELECT COUNT(*) AS c FROM restaurants').get().c;
if (n === 0) seed(db);
demoRefreshV2(db);
return db;
}

// 一次性：把旧演示数据换成更真实的版本（只动演示账号名下的行）
function demoRefreshV2(db) {
db.exec(`CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)`);
if (db.prepare("SELECT v FROM meta WHERE k='demo_refresh_v2'").get()) return;
const updR = db.prepare('UPDATE restaurants SET name=?, contact_name=?, wechat=?, hours=? WHERE phone=?');
updR.run('杨记川菜', '老杨', 'yangjichuancai', '11:00–21:00', '4255550101');
updR.run('肥姐茶餐厅', '肥姐', 'feijie88', '10:00–21:30', '4255550202');
const updB = db.prepare(`UPDATE boxes SET title=?, description=?, original_price_cents=?, box_price_cents=?,
quantity_total=?, quantity_left=?, pickup_start=?, pickup_end=?
WHERE title=? AND restaurant_id IN (SELECT id FROM restaurants WHERE phone IN ('4255550101','4255550202'))`);
updB.run('川菜剩菜盲盒', '今天回锅肉和麻婆豆腐都剩了不少，还有干煸四季豆。随机装 2–3 样，配一盒米饭，够一个人吃饱。卖完就没了。',
2400, 799, 7, 7, '20:00', '21:00', '今晚川菜盲盒');
updB.run('午市盒饭', '中午卖剩的盒饭，一荤两素一饭。今天大概率是回锅肉或者辣子鸡，看剩什么装什么。',
1500, 499, 3, 3, '13:15', '14:00', '午市便当盲盒');
updB.run('茶餐厅打烊盲盒', '西多士、菠萝包、蛋挞，剩什么装什么，一般 3–4 样。再送一杯港式奶茶（凉的，回家自己加热）。',
2100, 699, 5, 5, '20:30', '21:30', '港式茶餐厅盲盒');
updB.run('一周川菜盲盒（周一到周五）', '周一到周五每天一份，一周 5 天 $34.99，算下来一天 7 块。下班路过拿了就走，菜式天天不重样：回锅肉、麻婆豆腐、宫保鸡丁、水煮肉片轮着来。',
12000, 3499, 6, 6, '19:30', '21:00', '上班族一周盲盒');
db.prepare("INSERT INTO meta (k, v) VALUES ('demo_refresh_v2', '1')").run();
console.log('[demo] 演示数据已刷新为真实版');
}

function seed(db) {
const hash = bcrypt.hashSync('demo1234', 10);
const today = todayStr();

const insR = db.prepare(`INSERT INTO restaurants
(name, contact_name, phone, wechat, address, city, hours, password_hash)
VALUES (?,?,?,?,?,?,?,?)`);

const r1 = insR.run('杨记川菜', '老杨', '4255550101', 'yangjichuancai',
'15600 NE 8th St, Suite 200', 'Bellevue', '11:00–21:00', hash).lastInsertRowid;
const r2 = insR.run('肥姐茶餐厅', '肥姐', '4255550202', 'feijie88',
'3320 132nd St SE, Suite B', 'Mill Creek', '10:00–21:30', hash).lastInsertRowid;

const insB = db.prepare(`INSERT INTO boxes
(restaurant_id, box_type, title, description, original_price_cents, box_price_cents,
quantity_total, quantity_left, pickup_date, pickup_start, pickup_end)
VALUES (?,?,?,?,?,?,?,?,?,?,?)`);

insB.run(r1, 'single', '川菜剩菜盲盒', '今天回锅肉和麻婆豆腐都剩了不少，还有干煸四季豆。随机装 2–3 样，配一盒米饭，够一个人吃饱。卖完就没了。',
2400, 799, 7, 7, today, '20:00', '21:00');
insB.run(r1, 'single', '午市盒饭', '中午卖剩的盒饭，一荤两素一饭。今天大概率是回锅肉或者辣子鸡，看剩什么装什么。',
1500, 499, 3, 3, today, '13:15', '14:00');
insB.run(r2, 'single', '茶餐厅打烊盲盒', '西多士、菠萝包、蛋挞，剩什么装什么，一般 3–4 样。再送一杯港式奶茶（凉的，回家自己加热）。',
2100, 699, 5, 5, today, '20:30', '21:30');
insB.run(r1, 'weekly', '一周川菜盲盒（周一到周五）', '周一到周五每天一份，一周 5 天 $34.99，算下来一天 7 块。下班路过拿了就走，菜式天天不重样：回锅肉、麻婆豆腐、宫保鸡丁、水煮肉片轮着来。',
12000, 3499, 6, 6, mondayStr(), '19:30', '21:00');

console.log('[seed] 示例数据已生成：2 家餐馆 + 4 个盲盒（含 1 个一周套餐），演示密码 demo1234');
}

module.exports = { initDb, todayStr, mondayStr, weekDate, fmtMD, WEEK_DAYS};

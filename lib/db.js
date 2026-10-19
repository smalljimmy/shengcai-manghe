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
CREATE INDEX IF NOT EXISTS idx_res_code ON reservations(pickup_code);
CREATE INDEX IF NOT EXISTS idx_res_bundle ON reservations(bundle_id);
CREATE INDEX IF NOT EXISTS idx_boxes_rest ON boxes(restaurant_id);
`);

const n = db.prepare('SELECT COUNT(*) AS c FROM restaurants').get().c;
if (n === 0) seed(db);
return db;
}

function seed(db) {
const hash = bcrypt.hashSync('demo1234', 10);
const today = todayStr();

const insR = db.prepare(`INSERT INTO restaurants
(name, contact_name, phone, wechat, address, city, hours, password_hash)
VALUES (?,?,?,?,?,?,?,?)`);

const r1 = insR.run('川味小馆', '王师傅', '4255550101', 'chuanweixiaoguan',
'15600 NE 8th St, Suite 200', 'Bellevue', '11:00–21:30', hash).lastInsertRowid;
const r2 = insR.run('粤香茶餐厅', '陈老板', '4255550202', 'yuexiang88',
'3320 132nd St SE, Suite B', 'Mill Creek', '10:30–22:00', hash).lastInsertRowid;

const insB = db.prepare(`INSERT INTO boxes
(restaurant_id, box_type, title, description, original_price_cents, box_price_cents,
quantity_total, quantity_left, pickup_date, pickup_start, pickup_end)
VALUES (?,?,?,?,?,?,?,?,?,?,?)`);

insB.run(r1, 'single', '今晚川菜盲盒', '打烊前未售出的川菜随机搭配 2–3 份，可能是回锅肉、麻婆豆腐、干煸四季豆等，视当天余量而定。',
2500, 799, 8, 8, today, '20:00', '21:30');
insB.run(r1, 'single', '午市便当盲盒', '中午剩下的盒饭随机装盒，一荤两素加米饭，干净卫生。',
1500, 499, 5, 5, today, '13:30', '14:30');
insB.run(r2, 'single', '港式茶餐厅盲盒', '菠萝包、蛋挞、炒河粉等随机搭配 3–4 样，茶餐厅打烊前打包。',
2200, 699, 6, 6, today, '20:30', '22:00');
insB.run(r1, 'weekly', '上班族一周盲盒', '周一到周五，每天一份川菜盲盒（2–3 个菜随机搭配），适合上班族一次订一周。价格为一周 5 天总价。',
12500, 3499, 10, 10, mondayStr(), '20:00', '21:30');

console.log('[seed] 示例数据已生成：2 家餐馆 + 4 个盲盒（含 1 个一周套餐），演示密码 demo1234');
}

module.exports = { initDb, todayStr, mondayStr, weekDate, fmtMD, WEEK_DAYS};

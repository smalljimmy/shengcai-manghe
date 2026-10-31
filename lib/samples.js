// 演示样品盲盒：只用于展示下单流程，不对应任何真实餐馆。
// 关键安全属性：
// - 不进数据库（生产库状态如何都不影响展示），因此不可能产生预订记录；
// - 不带任何商家电话和真实地址，详情页不显示电话行；
// - 服务端硬拦截：POST /reserve 遇到样品 id 直接返回已售罄页，绝不写 reservations 表。
// 标题含关键词是为了复用现有 boxImg() 配图（川→川菜图，港式→港式图，便当→便当图，一周套餐→一周套餐图）。
const SAMPLES = [
  { id: 'sample-sichuan', box_type: 'single', title: '川菜剩菜盲盒（演示）',
    description: '回锅肉、麻婆豆腐、干煸四季豆随机装 2–3 样，配一盒米饭，够一个人吃饱。（演示样品）',
    original_price_cents: 2400, box_price_cents: 799,
    pickup_display: '每天打烊前 20:00–21:00（演示）' },
  { id: 'sample-hktea', box_type: 'single', title: '港式茶餐厅盲盒（演示）',
    description: '西多士、菠萝包、蛋挞，剩什么装什么，一般 3–4 样，配一杯港式奶茶。（演示样品）',
    original_price_cents: 2100, box_price_cents: 699,
    pickup_display: '每天打烊前 20:30–21:30（演示）' },
  { id: 'sample-bento', box_type: 'single', title: '午市便当盲盒（演示）',
    description: '一荤两素一饭，中午卖剩的盒饭，看剩什么装什么。（演示样品）',
    original_price_cents: 1500, box_price_cents: 499,
    pickup_display: '每天午市后 13:15–14:00（演示）' },
  { id: 'sample-weekly', box_type: 'weekly', title: '一周川菜盲盒（演示）',
    description: '周一到周五每天一份，菜式天天不重样：回锅肉、麻婆豆腐、宫保鸡丁、水煮肉片轮着来。（演示样品）',
    original_price_cents: 12000, box_price_cents: 3499,
    pickup_display: '周一–周五，每天 19:30–21:00（演示）' },
];

function findSample(id) {
  return SAMPLES.find((s) => s.id === id) || null;
}

module.exports = { SAMPLES, findSample };

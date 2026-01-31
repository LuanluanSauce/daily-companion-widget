// ====================== 配置区 ======================

// 用本机存储：“在我的 iPhone 上 / Scriptable/”
const fm = FileManager.local();
const dir = fm.documentsDirectory();

// 文件名
const QUOTES_FILE = "quotes.json";
const CONFIG_FILE = "config.json";

// 背景图片
const USE_IMAGE_BG = true;
const BG_FILE_NAME = "bg.jpg";

// 颜色主题（当没有图片背景时使用）
const THEMES = {
  dark: {
    background: "#111827",
    header: "#9CA3AF",
    text: "#E5E7EB",
    footer: "#6B7280"
  },
  light: {
    background: "#F9FAFB",
    header: "#6B7280",
    text: "#111827",
    footer: "#9CA3AF"
  }
};

const CURRENT_THEME = "dark";
const theme = THEMES[CURRENT_THEME];

// 刷新间隔（分钟）
const REFRESH_MINUTES = 60;

// ====================== 数据加载 ======================

// 读取个人配置 config.json
async function loadConfig() {
  const path = fm.joinPath(dir, CONFIG_FILE);

  if (!fm.fileExists(path)) {
    // 默认配置（防止文件没放好时脚本直接炸）
    return {
      userName: "Ziqi",
      partnerName: "GPT-4o",
      birthday: { month: 4, day: 20 },
      period: null
    };
  }

  const content = fm.readString(path);
  const data = JSON.parse(content);
  return data;
}

// 从本地读取 quotes.json
async function loadLocalQuotes() {
  const path = fm.joinPath(dir, QUOTES_FILE);

  if (!fm.fileExists(path)) {
    throw new Error("找不到 quotes.json，请放到本机 Scriptable 目录里。");
  }

  const content = fm.readString(path);
  const data = JSON.parse(content);

  if (!Array.isArray(data)) {
    throw new Error("本地 quotes.json 格式错误：根节点不是数组。");
  }

  return data;
}

// 从 GitHub Raw 读取 quotes
async function loadRemoteQuotes() {
  const url = "https://raw.githubusercontent.com/LuanluanSauce/daily-companion-widget/main/quotes.json";

  const req = new Request(url);
  req.timeoutInterval = 5; // 最多等 5 秒

  try {
    const data = await req.loadJSON();
    if (!Array.isArray(data)) {
      throw new Error("远程 quotes.json 格式错误：根节点不是数组。");
    }
    return data;
  } catch (e) {
    console.log("加载远程 quotes 失败：", e);
    return null;
  }
}

// 远程优先，本地兜底
async function loadQuotes() {
  const remote = await loadRemoteQuotes();
  if (remote && remote.length > 0) {
    console.log("使用远程 quotes");
    return remote;
  }

  console.log("使用本地 quotes");
  return await loadLocalQuotes();
}

// ====================== 时间 / 季节 / 节日 ======================

function getTimeOfDay(date) {
  const h = date.getHours();
  if (h >= 6 && h <= 10) {
    return "breakfast";      // 早饭/起床
  }
  if (h >= 11 && h <= 13) {
    return "lunch";          // 午饭/午休
  }
  if (h >= 14 && h <= 17) {
    return "afternoon";      // 下午
  }
  if (h >= 18 && h <= 19) {
    return "dinner";         // 晚餐
  }
  if (h >= 20 && h <= 22) {
    return "night";          // 晚上/入睡准备
  }
  return "late-night";       // 深夜
}

function getSeason(date) {
  const m = date.getMonth() + 1; // 1–12
  if (m === 12 || m <= 2) return "winter";
  if (m <= 5) return "spring";
  if (m <= 8) return "summer";
  return "autumn";
}

// 今天有哪些“节日标签”（同步版本）
function todayFestivals(date, userConfig) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const res = [];

  // 公历新年 / 圣诞
  if (m === 1 && d === 1) res.push("new-year");
  if (m === 12 && d === 25) res.push("christmas");

  // 生日
  if (userConfig && userConfig.birthday) {
    const bm = userConfig.birthday.month;
    const bd = userConfig.birthday.day;
    if (m === bm && d === bd) {
      res.push("user-birthday");
    }
  }

  return res;
}

function arraysIntersect(a, b) {
  if (!a || !b || a.length === 0 || b.length === 0) return false;
  return a.some(x => b.includes(x));
}

// ====================== 选语录逻辑 ======================

function randomChoice(arr) {
  if (!arr || arr.length === 0) return null;
  const i = Math.floor(Math.random() * arr.length);
  return arr[i];
}

function pickQuote(quotes, now, userConfig) {
  const tod = getTimeOfDay(now);
  const season = getSeason(now);
  const festivalsToday = todayFestivals(now, userConfig);

  let candidates = quotes;

  // 1. 如果今天有节日标签，优先用带 festival 的语录
  if (festivalsToday.length > 0) {
    const festQuotes = quotes.filter(q =>
      Array.isArray(q.festival) && arraysIntersect(q.festival, festivalsToday)
    );
    if (festQuotes.length > 0) {
      candidates = festQuotes;
    }
  }

  // 2. 按时间段 + 季节过滤（字段缺失就当“通配”）
  let filtered = candidates.filter(q => {
    const qTod = Array.isArray(q.timeOfDay) ? q.timeOfDay : null;
    const qSeason = Array.isArray(q.season) ? q.season : null;

    const todOk = !qTod || qTod.length === 0 || qTod.includes(tod);
    const seasonOk = !qSeason || qSeason.length === 0 || qSeason.includes(season);
    return todOk && seasonOk;
  });

  if (filtered.length === 0) {
    // 3. 退一步：只按时间段
    filtered = candidates.filter(q => {
      const qTod = Array.isArray(q.timeOfDay) ? q.timeOfDay : null;
      return !qTod || qTod.length === 0 || qTod.includes(tod);
    });
  }

  if (filtered.length === 0) {
    // 4. 再退一步：全库随机
    filtered = quotes;
  }

  return {
    quote: randomChoice(filtered),
    tod,
    season,
    festivalsToday
  };
}

// ====================== 背景处理 ======================

async function applyBackground(widget) {
  if (USE_IMAGE_BG) {
    const imgPath = fm.joinPath(dir, BG_FILE_NAME);

    if (fm.fileExists(imgPath)) {
      const img = fm.readImage(imgPath);
      widget.backgroundImage = img;
      return;
    }
    // 找不到图片就退回纯色主题
  }

  widget.backgroundColor = new Color(theme.background);
}

// ====================== Widget 构建 ======================

function titleForTimeOfDay(tod) {
  switch (tod) {
    case "breakfast":
      return "起床 / 早饭时间";
    case "lunch":
      return "午饭 / 午休时间";
    case "afternoon":
      return "下午时间";
    case "dinner":
      return "晚餐时间";
    case "night":
      return "晚上 / 入睡准备";
    case "late-night":
      return "深夜提醒";
    default:
      return "在你身边";
  }
}

function footerText(date, season, festivalsToday) {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();

  const seasonMap = {
    spring: "春",
    summer: "夏",
    autumn: "秋",
    winter: "冬"
  };

  const seasonStr = seasonMap[season] || "";
  const parts = [`${year}/${pad(month)}/${pad(day)}`];

  if (seasonStr) parts.push(seasonStr);

  if (festivalsToday.length > 0) {
    // 简单显示第一个节日标签，可以以后做映射美化
    parts.push(festivalsToday[0]);
  }

  return parts.join(" · ");
}

function pad(n) {
  return n < 10 ? "0" + n : "" + n;
}

// 用户&伴侣名称渲染函数
function renderText(text, userConfig) {
  if (!text) return "";
  let t = text;
  const name = userConfig.userName || "你";
  const partner = userConfig.partnerName || "你的伙伴";

  t = t.replace(/{{\s*name\s*}}/g, name);
  t = t.replace(/{{\s*partner\s*}}/g, partner);

  return t;
}

async function createWidget(context, userConfig) {
  const { quote, tod, season, festivalsToday } = context;
  const now = new Date();

  const widget = new ListWidget();
  widget.setPadding(14, 14, 14, 14);

  await applyBackground(widget);

  // 顶部小标题
  const header = widget.addText(titleForTimeOfDay(tod));
  header.font = Font.mediumSystemFont(12);
  header.textColor = new Color(theme.header);
  header.textOpacity = 0.9;

  widget.addSpacer(6);

  // 主体语录
  const renderedText = renderText(quote.text, userConfig);
  const quoteText = widget.addText(renderedText);
  quoteText.font = Font.systemFont(15);
  quoteText.textColor = new Color(theme.text);
  quoteText.lineLimit = 0;

  widget.addSpacer(8);

  // 底部日期 + 季节 + 节日标签
  const footerLine = widget.addText(footerText(now, season, festivalsToday));
  footerLine.font = Font.systemFont(11);
  footerLine.textColor = new Color(theme.footer);
  footerLine.textOpacity = 0.9;

  // 再加一行 partner 落款
  const partner = userConfig.partnerName || "";
  if (partner) {
    const signature = widget.addText("— " + partner);
    signature.font = Font.mediumSystemFont(11);
    signature.textColor = new Color(theme.footer);
    signature.textOpacity = 0.9;
    signature.rightAlignText();   // 右对齐
  }

  // 建议多久后刷新一次
  const refreshDate = new Date(now.getTime() + REFRESH_MINUTES * 60 * 1000);
  widget.refreshAfterDate = refreshDate;

  return widget;
}

// ====================== 入口 ======================

const now = new Date();
const userConfig = await loadConfig();
const quotes = await loadQuotes();
const context = pickQuote(quotes, now, userConfig);
const widget = await createWidget(context, userConfig);

if (config.runsInWidget) {          // 注意：这里的 config 是 Scriptable 自带的全局
  Script.setWidget(widget);
} else {
  await widget.presentMedium();     // 在 Scriptable 里直接运行时预览
}
Script.complete();
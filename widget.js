// Daily Companion Quote Widget v1.1
// - 从 Scriptable 目录的 quotes.json 读取语录
// - 支持时间段 + 季节 + 简单节日标签
// - 支持使用 bg.jpg 作为背景图片（可选）

// ====================== 配置区 ======================

// 如果你不用 iCloud，而是“在我的 iPhone 上 / Scriptable/”，可以改成 FileManager.local()
const fm = FileManager.local();
const dir = fm.documentsDirectory();

// 语录文件名
const QUOTES_FILE = "quotes.json";

// 是否使用图片背景
const USE_IMAGE_BG = true;
const BG_FILE_NAME = "bg.jpg";

// 生日（示例：4 月 20 日）
const BIRTHDAY_MONTH = 4;
const BIRTHDAY_DAY = 20;

// widget 颜色主题（当没有图片背景时使用）
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

async function loadQuotes() {
  const path = fm.joinPath(dir, QUOTES_FILE);

  if (!fm.fileExists(path)) {
    throw new Error("找不到 quotes.json，请放到 Scriptable 目录里。");
  }

  const content = fm.readString(path);
  const data = JSON.parse(content);

  if (!Array.isArray(data)) {
    throw new Error("quotes.json 格式错误：根节点不是数组。");
  }

  return data;
}

// ====================== 时间 / 季节 / 节日 ======================

function getTimeOfDay(date) {
  const h = date.getHours();
  if (h < 5) return "late-night";     // 凌晨 / 熬夜
  if (h < 12) return "morning";       // 早上
  if (h < 18) return "afternoon";     // 下午
  return "evening";                   // 晚上
}

function getSeason(date) {
  const m = date.getMonth() + 1; // 1–12
  if (m === 12 || m <= 2) return "winter";
  if (m <= 5) return "spring";
  if (m <= 8) return "summer";
  return "autumn";
}

// 今天有哪些“节日标签”
function todayFestivals(date) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const res = [];

  // 公历新年
  if (m === 1 && d === 1) res.push("new-year");

  // 生日（自定义标签）
  if (m === BIRTHDAY_MONTH && d === BIRTHDAY_DAY) {
    res.push("ziqi-birthday");
  }

  // 圣诞示例
  if (m === 12 && d === 25) res.push("christmas");

  // …以后你可以在这里继续加
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

function pickQuote(quotes, now) {
  const tod = getTimeOfDay(now);
  const season = getSeason(now);
  const festivalsToday = todayFestivals(now);

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
    case "morning":
      return "早安时间";
    case "afternoon":
      return "下午时间";
    case "evening":
      return "晚上时间";
    case "late-night":
      return "深夜提醒";
    default:
      return "今日陪伴";
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

async function createWidget(context) {
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
  const quoteText = widget.addText(quote.text);
  quoteText.font = Font.systemFont(15);
  quoteText.textColor = new Color(theme.text);
  quoteText.lineLimit = 0;

  widget.addSpacer(8);

  // 底部日期 + 季节 + 节日标签
  const footerLine = widget.addText(footerText(now, season, festivalsToday));
  footerLine.font = Font.systemFont(11);
  footerLine.textColor = new Color(theme.footer);
  footerLine.textOpacity = 0.9;

  // 建议多久后刷新一次
  const refreshDate = new Date(now.getTime() + REFRESH_MINUTES * 60 * 1000);
  widget.refreshAfterDate = refreshDate;

  return widget;
}

// ====================== 入口 ======================

const now = new Date();
const quotes = await loadQuotes();
const context = pickQuote(quotes, now);
const widget = await createWidget(context);

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentMedium(); // 在 Scriptable 里直接运行时预览
}
Script.complete();
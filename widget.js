// ====================== 配置区 ======================

// 用 iCloud 存储：“iCloud Drive / Scriptable/”
const fm = FileManager.iCloud();
const dir = fm.documentsDirectory();

// 文件名
const QUOTES_FILE = "quotes.json";           // 主语录
const TIPS_FILE = "weather_tips.json";       // 天气 / 贴心小提示
const CONFIG_FILE = "config.json";

// 背景图片
const USE_IMAGE_BG = true;
const BG_FILE_NAME = "bg.jpg";

// 刷新间隔（分钟）
const REFRESH_MINUTES = 60;

// 颜色（动态适配浅色/深色）
const COLOR_HEADER = Color.dynamic(new Color("#6B7280"), new Color("#9CA3AF"));
const COLOR_TEXT   = Color.dynamic(new Color("#111827"), new Color("#F9FAFB"));
const COLOR_FOOTER = Color.dynamic(new Color("#6B7280"), new Color("#9CA3AF"));
// “磨砂”效果：半透明黑
const COLOR_FROSTED_BG = new Color("#000000", 0.25);

// ====================== 通用工具函数 ======================

function randomChoice(arr) {
  if (!arr || arr.length === 0) return null;
  const i = Math.floor(Math.random() * arr.length);
  return arr[i];
}

function arraysIntersect(a, b) {
  if (!a || !b || a.length === 0 || b.length === 0) return false;
  return a.some(x => b.includes(x));
}

function startOfDay(d) {
  const nd = new Date(d);
  nd.setHours(0, 0, 0, 0);
  return nd;
}

function parseISODate(str) {
  if (!str || typeof str !== "string") return new Date(NaN);
  const parts = str.split("-");
  if (parts.length !== 3) return new Date(NaN);
  const [y, m, d] = parts.map(n => parseInt(n, 10));
  return new Date(y, m - 1, d);
}

function pad(n) {
  return n < 10 ? "0" + n : "" + n;
}

function ensureDownloaded(path) {
  try {
    if (fm.isFileDownloaded && !fm.isFileDownloaded(path)) {
      fm.downloadFileFromiCloud(path);
    }
  } catch (e) {
    // 老版本没有这俩 API 就当没事
  }
}

// ====================== 配置加载 ======================

// 读取个人配置 config.json（只读本地）
async function loadConfig() {
  const path = fm.joinPath(dir, CONFIG_FILE);

  if (!fm.fileExists(path)) {
    throw new Error("找不到 config.json，请在 Scriptable 目录里创建配置文件（可以参考 config.example.json）。");
  }

  ensureDownloaded(path);

  const content = fm.readString(path);
  try {
    const data = JSON.parse(content);
    if (!data || typeof data !== "object") {
      throw new Error("config.json 根节点必须是对象。");
    }
    return data;
  } catch (e) {
    throw new Error("config.json 解析失败：" + e);
  }
}

// ====================== JSON 加载（本地） ======================

function loadLocalJSON(fileName, expectArray, friendlyName) {
  const path = fm.joinPath(dir, fileName);

  if (!fm.fileExists(path)) {
    throw new Error("找不到 " + fileName + "，请放到本机 Scriptable 目录里。" + (friendlyName || ""));
  }

  const content = fm.readString(path);
  const data = JSON.parse(content);

  if (expectArray && !Array.isArray(data)) {
    throw new Error(fileName + " 本地格式错误：根节点不是数组。");
  }

  return data;
}

// 主语录：只读本地
async function loadQuotes() {
  console.log("使用本地 quotes");
  return loadLocalJSON(QUOTES_FILE, true, "（主语录）");
}

// 天气 / 贴心小提示：只读本地
async function loadWeatherTips() {
  console.log("使用本地 weather_tips");
  return loadLocalJSON(TIPS_FILE, true, "（天气 / 贴心小提示）");
}

// ====================== 天气加载（今天 + 明天） ======================

function classifyWeather(temp, code) {
  const tempTags = [];
  const conditionTags = [];

  // 温度分类（体感标签）
  if (temp <= 0) tempTags.push("very-cold");
  else if (temp <= 10) tempTags.push("cold");
  else if (temp >= 30) tempTags.push("hot");
  else if (temp >= 20) tempTags.push("warm");

  // 天气现象标签（WMO code）
  const rainyCodes   = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82];
  const snowyCodes   = [71, 73, 75, 77, 85, 86];
  const thunderCodes = [95, 96, 99];
  const fogCodes     = [45, 48];

  if (code === 0) conditionTags.push("sunny");
  if ([1, 2, 3].includes(code)) conditionTags.push("cloudy");
  if (fogCodes.includes(code))     conditionTags.push("fog");
  if (rainyCodes.includes(code))   conditionTags.push("rain");
  if (snowyCodes.includes(code))   conditionTags.push("snow");
  if (thunderCodes.includes(code)) conditionTags.push("thunder");

  return { tempTags, conditionTags };
}

function weatherCodeToText(code) {
  if (code === 0) return "晴";
  if (code === 1 || code === 2) return "多云";
  if (code === 3) return "阴天";

  if (code === 45 || code === 48) return "有雾";

  const lightRainCodes = [51, 53, 55, 56, 57, 61, 63, 80, 81];
  const heavyRainCodes = [65, 66, 67, 82];
  const snowCodes      = [71, 73, 75, 77, 85, 86];
  const thunderCodes   = [95, 96, 99];

  if (lightRainCodes.includes(code)) return "小雨";
  if (heavyRainCodes.includes(code)) return "大雨";
  if (snowCodes.includes(code))      return "下雪";
  if (thunderCodes.includes(code))   return "雷雨";

  return "多变天气";
}

// 拉一次 open-meteo，同步拿到：当前天气 + 未来 1 天的日预测
async function loadWeatherBundle() {
  try {
    Location.setAccuracyToTenMeters();
    const loc = await Location.current();
    const lat = loc.latitude;
    const lon = loc.longitude;

    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&current_weather=true` +
      `&daily=weathercode,temperature_2m_max,temperature_2m_min` +
      `&forecast_days=2&timezone=auto`;

    const req = new Request(url);
    req.timeoutInterval = 5;

    const data = await req.loadJSON();
    const cw = data.current_weather;
    const daily = data.daily;

    if (!cw) throw new Error("响应中没有 current_weather 字段");

    // 当前天气（用于主语录 / footer / 早上的提示）
    const nowBase = {
      temp: cw.temperature,
      code: cw.weathercode
    };
    const nowTags = classifyWeather(nowBase.temp, nowBase.code);
    const nowWeather = { ...nowBase, ...nowTags };

    // 明天天气（用于晚上的提示）
    let tomorrowWeather = null;
    if (
      daily &&
      Array.isArray(daily.time) &&
      Array.isArray(daily.temperature_2m_min) &&
      Array.isArray(daily.temperature_2m_max) &&
      Array.isArray(daily.weathercode) &&
      daily.time.length >= 2 &&
      daily.temperature_2m_min.length >= 2 &&
      daily.temperature_2m_max.length >= 2 &&
      daily.weathercode.length >= 2
    ) {
      const tempMin = daily.temperature_2m_min[1];
      const tempMax = daily.temperature_2m_max[1];
      const codeTomorrow = daily.weathercode[1];
      const avgTemp = (tempMin + tempMax) / 2;

      const tTags = classifyWeather(avgTemp, codeTomorrow);
      tomorrowWeather = {
        temp: avgTemp,
        tempMin,
        tempMax,
        code: codeTomorrow,
        ...tTags
      };
    }

    return { now: nowWeather, tomorrow: tomorrowWeather };
  } catch (e) {
    console.log("加载天气失败:", e);
    return null;
  }
}

// ====================== 时间 / 季节 / 节日 ======================

function getTimeOfDay(date) {
  const h = date.getHours();
  if (h >= 6 && h <= 10)  return "breakfast";  // 早饭/起床
  if (h >= 11 && h <= 13) return "lunch";      // 午饭/午休
  if (h >= 14 && h <= 17) return "afternoon";  // 下午
  if (h >= 18 && h <= 19) return "dinner";     // 晚餐
  if (h >= 20 && h <= 22) return "night";      // 晚上/入睡准备
  return "late-night";                         // 深夜
}

// tip 专用时间段模式：早上 / 活动时间 / 晚上
function getTipMode(date) {
  const h = date.getHours();
  if (h >= 6 && h <= 10) return "morning";       // 早上 6-10
  if (h >= 20 || h < 6) return "night";          // 晚上 20-次日 6
  return "daytime";                              // 其他时间：活动时间
}

function getSeason(date) {
  const m = date.getMonth() + 1; // 1–12
  if (m === 12 || m <= 2) return "winter";
  if (m <= 5) return "spring";
  if (m <= 8) return "summer";
  return "autumn";
}

// 今天有哪些“节日标签”
function todayFestivals(date, userConfig) {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const res = [];

  // ===== 1. 固定规则部分：新年 / 圣诞 =====
  if (m === 1 && d === 1) res.push("new-year");
  if (m === 12 && d === 25) res.push("christmas");

  const cfg = userConfig || {};

  // 小工具：给一个 {year,month,day} + tag，看今天是不是那一天，是就 push
  function addFixedDateFestival(dateObj, tag) {
    if (!dateObj || typeof dateObj !== "object") return;
    const bm = dateObj.month;
    const bd = dateObj.day;
    if (!bm || !bd) return;
    if (bm === m && bd === d && !res.includes(tag)) {
      res.push(tag);
    }
  }

  // 2.1 用户生日（兼容旧字段 birthday）
  const userBirthday = cfg.userBirthday || cfg.birthday || null;
  addFixedDateFestival(userBirthday, "user-birthday");

  // 2.2 伙伴生日
  addFixedDateFestival(cfg.partnerBirthday, "partner-birthday");

  // 2.3 纪念日（Anniversary）
  addFixedDateFestival(cfg.Anniversary, "anniversary");

  // ===== 3. 苹果日历里的节日 / 节气 =====
  const calFestivals = festivalsFromAppleCalendar(date, cfg);
  for (const f of calFestivals) {
    if (!res.includes(f)) {
      res.push(f);
    }
  }

  return res;
}

// ====================== 从苹果日历里拿节日事件 ======================

function slugifyFestivalTitle(title) {
  if (!title) return null;
  return title.trim();  // 原样返回（中文/英文都可）
}

// 从配置指定的日历里，拿“今天”的所有事件标题 → festival 标签数组
function festivalsFromAppleCalendar(today, userConfig) {
  const result = [];
  const cfg = userConfig || {};
  const wantedNames = Array.isArray(cfg.holidayCalendars)
    ? cfg.holidayCalendars
    : [];

  if (wantedNames.length === 0) return result;

  // 1. 拿到所有日历
  const allCals = Calendar.forEvents();
  const targetCals = allCals.filter(c => wantedNames.includes(c.title));

  if (targetCals.length === 0) return result;

  // 2. 计算今天的起止时间
  const start = startOfDay(today);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);

  // 3. 拿事件
  const events = CalendarEvent.between(start, end, targetCals);

  for (const ev of events) {
    const id = slugifyFestivalTitle(ev.title);
    if (id && !result.includes(id)) {
      result.push(id);
    }
  }

  return result;
}

// ====================== 生理期（目前只参与“活动时间”的小贴士选择） ======================

// 从 period.starts 估算平均周期（天数）
function estimateCycleDaysFromHistory(periodConfig) {
  if (!periodConfig || !Array.isArray(periodConfig.starts)) {
    return null;
  }

  const starts = periodConfig.starts
    .map(parseISODate)
    .filter(d => !isNaN(d.getTime()));

  if (starts.length < 2) {
    return null;
  }

  // 按时间从旧到新排序
  starts.sort((a, b) => a - b);

  const msPerDay = 24 * 60 * 60 * 1000;
  const diffs = [];

  for (let i = 1; i < starts.length; i++) {
    const prev = startOfDay(starts[i - 1]);
    const curr = startOfDay(starts[i]);
    const diffDays = Math.round((curr - prev) / msPerDay);

    if (diffDays >= 15 && diffDays <= 60) {
      diffs.push(diffDays);
    }
  }

  if (diffs.length === 0) {
    return null;
  }

  const sum = diffs.reduce((a, b) => a + b, 0);
  const avg = sum / diffs.length;

  return Math.round(avg);
}

function computePeriodPhase(today, periodConfig) {
  if (!periodConfig || !Array.isArray(periodConfig.starts) || periodConfig.starts.length === 0) {
    return { phase: "none", daysToNext: null, cycleDays: null };
  }

  let cycleDays = periodConfig.cycleDays;

  if (!cycleDays || cycleDays <= 0) {
    const estimated = estimateCycleDaysFromHistory(periodConfig);
    if (estimated) {
      cycleDays = estimated;
    }
  }

  if (!cycleDays || cycleDays <= 0) {
    cycleDays = 28;
  }

  const startsSorted = periodConfig.starts
    .map(parseISODate)
    .filter(d => !isNaN(d.getTime()))
    .sort((a, b) => b - a); // 最新在前

  if (startsSorted.length === 0) {
    return { phase: "none", daysToNext: null, cycleDays };
  }

  const lastStart = startsSorted[0];

  const msPerDay = 24 * 60 * 60 * 1000;
  const todayDay = startOfDay(today);
  const lastStartDay = startOfDay(lastStart);

  const daysSinceLast = Math.floor((todayDay - lastStartDay) / msPerDay);

  const nextStart = new Date(lastStartDay.getTime() + cycleDays * msPerDay);
  const daysToNext = Math.floor((startOfDay(nextStart) - todayDay) / msPerDay);

  let phase = "none";

  if (daysSinceLast >= 0 && daysSinceLast <= 3) {
    phase = "period-now";
  } else if (daysToNext > 0 && daysToNext <= 3) {
    phase = "period-soon";
  }

  return { phase, daysToNext, cycleDays };
}

// ====================== 年龄计算 ======================

// ====================== 年龄计算 ======================

function computeAge(birthday, today) {
  if (!birthday || typeof birthday !== "object") return null;

  const y = birthday.year;
  const m = birthday.month;
  const d = birthday.day;

  if (!y || !m || !d) return null;
  if (y < 1900 || y > today.getFullYear()) return null;
  if (m < 1 || m > 12) return null;
  if (d < 1 || d > 31) return null;

  const birthDate = new Date(y, m - 1, d);
  if (isNaN(birthDate.getTime())) return null;

  let age = today.getFullYear() - y;

  const thisYearBirthday = new Date(today.getFullYear(), m - 1, d);
  if (today < thisYearBirthday) {
    age -= 1;
  }

  if (age < 0 || age > 150) return null;
  return age;
}

// 1) 在一起几年（整数年数），用 computeAge 直接算就好：
function computeAnnivYears(anniv, today) {
  return computeAge(anniv, today);
}

// 2) 第几个某节日 / 第几个年份氛围：= 年数 + 1
function computeAnnivTimes(anniv, today) {
  const years = computeAnnivYears(anniv, today);
  if (years === null) return null;

  // 如果今天还没在一起（today < anniv），上面 years 本身就会是 null；
  // 这里再保险一下也无妨：
  const startDate = new Date(anniv.year, anniv.month - 1, anniv.day);
  if (isNaN(startDate.getTime()) || today < startDate) return null;

  return years + 1;
}

// ====================== 选语录：主语录管线 ======================

function pickMainQuote(quotes, now, userConfig) {
  const tod = getTimeOfDay(now);          // breakfast / lunch / afternoon / ...
  const season = getSeason(now);          // spring / summer / autumn / winter
  const festivalsToday = todayFestivals(now, userConfig);

  if (!Array.isArray(quotes) || quotes.length === 0) {
    return {
      quote: null,
      tod,
      season,
      festivalsToday
    };
  }

  // 1. 先做“季节硬约束”：写了 season 但不含当前季节的语录，今天不考虑
  const seasonEligible = quotes.filter(q => {
    const qSeason = Array.isArray(q.season) ? q.season : null;
    if (!qSeason || qSeason.length === 0) return true;    // 四季通用
    return qSeason.includes(season);                      // 必须包含当前季节
  });

  if (seasonEligible.length === 0) {
    // 极端情况：没有任何当季语录，就退回全库兜底
    return {
      quote: randomChoice(quotes),
      tod,
      season,
      festivalsToday
    };
  }

  // 2. 按“今天是不是它的节日”拆成两类：
  //    - festivalActive：有 festival 且与今天 festivalsToday 有交集 → 只有今天会生效
  //    - normal：完全没写 festival → 永远当普通语录
  const festivalActive = [];
  const normal = [];

  for (const q of seasonEligible) {
    const hasFest = Array.isArray(q.festival) && q.festival.length > 0;
    const matchFest = hasFest && arraysIntersect(q.festival, festivalsToday);

    if (matchFest) {
      festivalActive.push(q);
    } else if (!hasFest) {
      normal.push(q);
    } else {
      // hasFest && !matchFest → 今天不是它的节日，忽略
    }
  }

  // 3. timeOfDay 过滤：不填 timeOfDay = 全天通用
  function filterByTod(list) {
    if (!list || list.length === 0) return [];
    return list.filter(q => {
      const qTod = Array.isArray(q.timeOfDay) ? q.timeOfDay : null;
      const todOk = !qTod || qTod.length === 0 || qTod.includes(tod);
      return todOk;
    });
  }

  const festTod    = filterByTod(festivalActive); // 节日 + tod 匹配
  const normalTod  = filterByTod(normal);         // 非节日 + tod 匹配
  const seasonTod  = filterByTod(seasonEligible); // 整个当季 + tod 匹配（兜底用）

  let pool = [];

  if (festTod.length > 0) {
    // ⬇️ 今天有“节日+tod 匹配”的语录 → 节日+普通混合
    if (normalTod.length > 0) {
      const weighted = [];
      // 节日语录各放两份，普通语录各放一份 → 节日大约 2/3 概率、普通 1/3
      for (const q of festTod) {
        weighted.push(q, q);
      }
      for (const q of normalTod) {
        weighted.push(q);
      }
      pool = weighted;
    } else {
      // 只有节日语录匹配 tod → 只能全用节日语录
      pool = festTod;
    }
  } else {
    // ⬇️ 今天虽然可能是节日，但：
    //    - 你没写对应 festival，或者
    //    - 写了但是 timeOfDay 不匹配
    // 那就当成普通日子：按 season + tod 正常选
    if (seasonTod.length > 0) {
      pool = seasonTod;
    } else {
      // 极端兜底：连 tod 也匹配不到，就在当季全库里随便选一条
      pool = seasonEligible;
    }
  }

  const chosenQuote = randomChoice(pool);

  return {
    quote: chosenQuote,
    tod,
    season,
    festivalsToday
  };
}

// ====================== 选语录：天气 / 贴心小提示管线 ======================
//
// weather_tips.json 建议字段：
//   "tipMode": ["morning" | "daytime" | "night"]         // 可为空表示通用
//   "periodPhase": ["period-now", "period-soon", "none"] // 仅活动时间用，可为空表示通用
//   "weatherCondition": ["rain", "snow"...]              // 早上 / 晚上按天气筛
//   "tempFeeling": ["very-cold", "cold", "warm", "hot"]  // 早上 / 晚上按冷暖筛
//
// 逻辑：
//   - 早上：用“今天当前天气”挑一条，用 {{temp}} / {{weather}} 嵌入今天
//   - 晚上：用“明天天气”挑一条，用 {{temp}} / {{weather}} 嵌入明天
//           如果拿不到明天气象，就不按天气筛选，也不给 temp/weather（避免误导）
//   - 活动时间：不看天气，用 periodPhase + 小贴士；生理期相关只在这里出现，不放主语录

function pickWeatherTip(tips, now, tipMode, currentWeather, tomorrowWeather, periodInfo) {
  if (!Array.isArray(tips) || tips.length === 0) {
    return { tip: null, weatherForTip: null };
  }

  let candidates = tips;

  // 先按 tipMode 粗分：morning / daytime / night
  candidates = candidates.filter(t => {
    const modes = Array.isArray(t.tipMode) ? t.tipMode : null;
    return !modes || modes.length === 0 || modes.includes(tipMode);
  });

  if (candidates.length === 0) {
    candidates = tips; // 兜底：忽略 tipMode
  }

  let weatherForTip = null;

  if (tipMode === "morning") {
    weatherForTip = currentWeather || null;
    if (weatherForTip) {
      const tempTags = Array.isArray(weatherForTip.tempTags) ? weatherForTip.tempTags : [];
      const conditionTags = Array.isArray(weatherForTip.conditionTags) ? weatherForTip.conditionTags : [];

      // 分别找“按天气现象命中的”和“按体感温度命中的”
      const condMatches = conditionTags.length > 0
        ? candidates.filter(t => {
            const tc = Array.isArray(t.weatherCondition) ? t.weatherCondition : null;
            return tc && arraysIntersect(tc, conditionTags);
          })
        : [];

      const tempMatches = tempTags.length > 0
        ? candidates.filter(t => {
            const tf = Array.isArray(t.tempFeeling) ? t.tempFeeling : null;
            return tf && arraysIntersect(tf, tempTags);
          })
        : [];

      let merged = [];
      if (condMatches.length > 0) merged = merged.concat(condMatches);
      if (tempMatches.length > 0) merged = merged.concat(tempMatches);

      if (merged.length > 0) {
        // 去重，避免某条同时满足两种标签时权重翻倍
        const unique = [...new Set(merged)];
        candidates = unique;
      }
      // 否则就保持原 candidates 不动，当成“天气条件没命中任何带标签的 tip”
    }
  } else if (tipMode === "night") {
    if (tomorrowWeather) {
      weatherForTip = tomorrowWeather;
      const tempTags = Array.isArray(tomorrowWeather.tempTags) ? tomorrowWeather.tempTags : [];
      const conditionTags = Array.isArray(tomorrowWeather.conditionTags) ? tomorrowWeather.conditionTags : [];

      const condMatches = conditionTags.length > 0
        ? candidates.filter(t => {
            const tc = Array.isArray(t.weatherCondition) ? t.weatherCondition : null;
            return tc && arraysIntersect(tc, conditionTags);
          })
        : [];

      const tempMatches = tempTags.length > 0
        ? candidates.filter(t => {
            const tf = Array.isArray(t.tempFeeling) ? t.tempFeeling : null;
            return tf && arraysIntersect(tf, tempTags);
          })
        : [];

      let merged = [];
      if (condMatches.length > 0) merged = merged.concat(condMatches);
      if (tempMatches.length > 0) merged = merged.concat(tempMatches);

      if (merged.length > 0) {
        const unique = [...new Set(merged)];
        candidates = unique;
      }
    } else {
      weatherForTip = null; // 拿不到明天气象时，不注入 temp / weather
    }
  }else {
    // 活动时间：完全不看天气，用生理期状态挑“贴心小贴士”
    weatherForTip = currentWeather || null;
    const phase = periodInfo && periodInfo.phase ? periodInfo.phase : "none";

    const phaseFiltered = candidates.filter(t => {
      const pp = Array.isArray(t.periodPhase) ? t.periodPhase : null;
      return !pp || pp.length === 0 || pp.includes(phase);
    });

    if (phaseFiltered.length > 0) {
      candidates = phaseFiltered;
    }
  }

  const tip = randomChoice(candidates) || null;
  return { tip, weatherForTip };
}

// ====================== 文本渲染 ======================

function renderText(text, userConfig, weather) {
  if (!text) return "";
  let t = text;

  // 名称池
  const userNames = Array.isArray(userConfig.userNames)
    ? userConfig.userNames
    : (userConfig.userName ? [userConfig.userName] : []);
  const partnerNames = Array.isArray(userConfig.partnerNames)
    ? userConfig.partnerNames
    : (userConfig.partnerName ? [userConfig.partnerName] : []);

  const name = randomChoice(userNames) || "你";
  const partner = randomChoice(partnerNames) || "你的伙伴";

  t = t.replace(/{{\s*name\s*}}/g, name);
  t = t.replace(/{{\s*partner\s*}}/g, partner);

  const today = new Date();

  // 用户年龄：{{age}} / {{userAge}}
  const userBirthday = userConfig.userBirthday || userConfig.birthday || null;
  const userAge = computeAge(userBirthday, today);
  if (userAge !== null) {
    t = t.replace(/{{\s*(age|userAge)\s*}}/g, userAge.toString());
  } else {
    t = t.replace(/{{\s*(age|userAge)\s*}}/g, "");
  }

  // 伙伴年龄：{{partnerAge}}
  const partnerAge = computeAge(userConfig.partnerBirthday, today);
  if (partnerAge !== null) {
    t = t.replace(/{{\s*partnerAge\s*}}/g, partnerAge.toString());
  } else {
    t = t.replace(/{{\s*partnerAge\s*}}/g, "");
  }

  // 在一起几年：{{annivYears}}
  const annivYears = computeAnnivYears(userConfig.Anniversary, today);
  if (annivYears !== null) {
    t = t.replace(/{{\s*annivYears\s*}}/g, annivYears.toString());
  } else {
    t = t.replace(/{{\s*annivYears\s*}}/g, "");
  }

  // 第几次：{{annivTimes}} / {{annivAge}}（兼容两个名字）
  const annivTimes = computeAnnivTimes(userConfig.Anniversary, today);
  if (annivTimes !== null) {
    t = t.replace(/{{\s*(annivTimes|annivAge)\s*}}/g, annivTimes.toString());
  } else {
    t = t.replace(/{{\s*(annivTimes|annivAge)\s*}}/g, "");
  }

  // {{temp}}
  if (weather && typeof weather.temp === "number") {
    const tempStr = Math.round(weather.temp).toString();
    t = t.replace(/{{\s*temp\s*}}/g, tempStr);
  } else {
    t = t.replace(/{{\s*temp\s*}}/g, "");
  }

  // {{weather}}
  if (weather && typeof weather.code === "number") {
    const wStr = weatherCodeToText(weather.code);
    t = t.replace(/{{\s*weather\s*}}/g, wStr);
  } else {
    t = t.replace(/{{\s*weather\s*}}/g, "");
  }

  return t;
}

// ====================== 背景处理 ======================

async function applyBackground(widget) {
  if (USE_IMAGE_BG) {
    const imgPath = fm.joinPath(dir, BG_FILE_NAME);
    ensureDownloaded(imgPath);
    if (fm.fileExists(imgPath)) {
      const img = fm.readImage(imgPath);
      widget.backgroundImage = img;
      return;
    }
  }
  // 默认磨砂效果：半透明黑
  widget.backgroundColor = COLOR_FROSTED_BG;
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

function footerText(date, season, festivalsToday, weather) {
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
    parts.push(festivalsToday[0]);
  }

  if (weather && typeof weather.temp === "number") {
    parts.push(`${Math.round(weather.temp)}°C`);
  }

  return parts.join(" · ");
}

async function createWidget(mainContext, userConfig, tipResult) {
  const { quote, tod, season, festivalsToday, weather: currentWeather } = mainContext;
  const { tip: weatherTip, weatherForTip } = tipResult || {};
  const now = new Date();

  const widget = new ListWidget();
  widget.setPadding(14, 14, 14, 14);

  await applyBackground(widget);

  // 顶部小标题
  const header = widget.addText(titleForTimeOfDay(tod));
  header.font = Font.mediumSystemFont(12);
  header.textColor = COLOR_HEADER;
  header.textOpacity = 0.9;

  widget.addSpacer(6);

  // 主体语录（不涉及生理期）
  let mainText = "请检查 quotes.json 是否有内容。";
  if (quote && quote.text) {
    mainText = renderText(quote.text, userConfig, currentWeather);
  }
  const quoteText = widget.addText(mainText);
  quoteText.font = Font.boldSystemFont(15);
  quoteText.textColor = COLOR_TEXT;
  quoteText.lineLimit = 0;

  // 可选天气 / 贴心小提示（独立管线）
  if (weatherTip && weatherTip.text) {
    widget.addSpacer(4);
    const tipRendered = renderText(
      weatherTip.text,
      userConfig,
      weatherForTip
    );
    const tipText = widget.addText(tipRendered);
    tipText.font = Font.systemFont(11);
    tipText.textColor = COLOR_FOOTER;
    tipText.textOpacity = 0.9;
  }

  widget.addSpacer(8);

  // 底部日期 + 季节 + 节日 + 当前温度（始终用当前天气）
  const footerLine = widget.addText(
    footerText(now, season, festivalsToday, currentWeather)
  );
  footerLine.font = Font.systemFont(11);
  footerLine.textColor = COLOR_FOOTER;
  footerLine.textOpacity = 0.9;

  // 伙伴落款：固定用 partnerNames[0]
  const partnerNames = Array.isArray(userConfig.partnerNames)
    ? userConfig.partnerNames
    : (userConfig.partnerName ? [userConfig.partnerName] : []);
  const partnerForSign = partnerNames.length > 0 ? partnerNames[0] : "";

  if (partnerForSign) {
    const signature = widget.addText("— " + partnerForSign);
    signature.font = Font.mediumSystemFont(11);
    signature.textColor = COLOR_FOOTER;
    signature.textOpacity = 0.9;
    signature.rightAlignText();
  }

  const refreshDate = new Date(now.getTime() + REFRESH_MINUTES * 60 * 1000);
  widget.refreshAfterDate = refreshDate;

  return widget;
}

// ====================== error widget 构建函数 ======================

async function createErrorWidget(message) {
  const widget = new ListWidget();
  widget.setPadding(14, 14, 14, 14);

  await applyBackground(widget);

  const title = widget.addText("小纸条出错了");
  title.font = Font.boldSystemFont(14);
  title.textColor = COLOR_TEXT;
  title.textOpacity = 0.95;

  widget.addSpacer(6);

  const msg = widget.addText(String(message || "未知错误"));
  msg.font = Font.systemFont(11);
  msg.textColor = COLOR_FOOTER;
  msg.textOpacity = 0.9;
  msg.lineLimit = 0;

  widget.addSpacer(8);

  const hint = widget.addText("请打开 Scriptable 检查配置文件。");
  hint.font = Font.systemFont(10);
  hint.textColor = COLOR_FOOTER;
  hint.textOpacity = 0.9;

  return widget;
}

// ====================== 入口 ======================

async function main() {
  try {
    const now = new Date();

    const userConfig = await loadConfig();

    const weatherBundle = await loadWeatherBundle();
    const currentWeather = weatherBundle && weatherBundle.now ? weatherBundle.now : null;
    const tomorrowWeather = weatherBundle && weatherBundle.tomorrow ? weatherBundle.tomorrow : null;

    const periodInfo = computePeriodPhase(now, userConfig.period);

    const quotes = await loadQuotes();
    const tips = await loadWeatherTips();

    const mainContext = pickMainQuote(quotes, now, userConfig);
    mainContext.weather = currentWeather;
    mainContext.periodInfo = periodInfo;

    const tipMode = getTipMode(now);
    const tipResult = pickWeatherTip(tips, now, tipMode, currentWeather, tomorrowWeather, periodInfo);

    const widget = await createWidget(mainContext, userConfig, tipResult);

    if (config.runsInWidget) {
      Script.setWidget(widget);
    } else {
      await widget.presentMedium();
    }
  } catch (e) {
    console.log("Widget 运行出错:", e);

    const widget = await createErrorWidget(e.message || e);

    if (config.runsInWidget) {
      Script.setWidget(widget);
    } else {
      await widget.presentMedium();
    }
  }
  Script.complete();
}

await main();
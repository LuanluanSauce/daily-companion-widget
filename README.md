# Daily Companion Widget (桌面陪伴语录小组件模板)

> 一个基于 Scriptable 的 iOS 桌面小组件。语录需由你and/or你的AI设置！

## 功能特性

* **天气预报**：集成 Open-Meteo API，无需 Key，自动根据当前天气（晴/雨/雪/冷/热）推荐穿衣或出行建议。
* **节日与节气彩蛋**：支持中国农历节气（如立春、清明）及各类节日，以及大众化的英国节日。(请确保日历已订阅)
* **时段问候**：根据早晨、午饭、下午茶、深夜等不同时段，自动切换合适的问候语。
* **纪念日与生日**：再也不会忘记重要的日子，自动计算纪念日天数、生日倒数。
* **贴心生理期助手**：在特殊的日子里，自动切换为温暖的呵护模式。
* **高度自定义**：名字、语录、背景图。

---

## 配置指南

### 1. 准备工作
* iPhone 上安装 [Scriptable](https://apps.apple.com/us/app/scriptable/id1405459188) App。
* 确保 Scriptable 拥有 **定位**（用于天气）和 **日历**（用于节日）的权限。

### 2. 安装文件
将本项目中的以下文件放入 iCloud Drive 的 `Scriptable` 文件夹中：
* `widget.js`: 核心脚本代码
* `config.json`: 个人配置文件
* `quotes.json`: 主语录库
* `weather_tips.json`: 天气/贴心小提示库
* `bg.jpg`: 背景图片（可替换、删除）

### 3. 运行
1. 打开 Scriptable，点击 `widget` 脚本运行测试。
2. 回到桌面，添加一个小号或中号的 Scriptable 组件。
3. 在组件设置中，`Script` 选择 `widget`。

---

## 配置文件说明 (`config.json`)

请在手机上下载一个IDE App，我用的是Koder。
这是小组件的“大脑”，请务必准确填写你的信息。

```json
{
  "userNames": ["你的昵称"],
  "partnerNames": ["对方的昵称"],
  "userBirthday": { "year": 2000, "month": 1, "day": 1 },
  "partnerBirthday": { "year": 2000, "month": 1, "day": 1 },
  "Anniversary": { "year": 2020, "month": 5, "day": 20 },
  
  "period": {
    "starts": [
      "2026-02-01", // 需要每个月手动更新，否则下个月不会预测
      "2026-01-01"
    ],
    "cycleDays": null // 可替换为整数，如果不填则自动根据历史记录推算
  },
  
  "holidayCalendars": [
    "中国大陆节假日", 
    "UK Holidays"
  ]
}
```

## 主语录 (quotes.json) & 天气生理期预测小贴士（weather_tips.json）

* 请把每一个模板当作prompt复制给你的AI批量生产，或是自己写语录，严格遵循模板格式和占位符。
* 写得越多语料越丰富，体验感越高。


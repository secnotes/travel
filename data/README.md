# 本地数据集格式说明

数据文件按地域拆分：`src/data/regions/east.ts`（华北华东）、`south.ts`（华南华中西南部分）、`westnorth.ts`（西南川渝西北东北）。
每个文件导出一个 `RegionData` 对象，在 `src/data/index.ts` 中聚合为全量索引。

扩充数据时直接在对应文件内追加条目，或新建文件后加入 `src/data/index.ts` 的 `REGIONS` 数组即可。

## Attraction（景点）

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| id | string | 全局唯一，拼音 kebab-case（如 `hz-west-lake`）。LLM 引用景点的唯一凭证 |
| name | string | 景点显示名 |
| city / province | string | 所属城市 / 省份（不带"省/市"后缀） |
| coords | [lng, lat] | **GCJ-02** 坐标（高德 / 腾讯系），与地图瓦片对齐；填近似值即可（4 位小数） |
| rating | 1-5 | 推荐度 |
| ticket | number | 门票（元），0 = 免费 |
| duration | number | 建议游玩时长（小时，0.5 的倍数） |
| themes | Theme[] | 主题标签，≤3 个：nature / culture / food / family / photography / hiking / beach / museum / religion / nightlife |
| bestSeasons | Season[] | 最宜季节：spring / summer / autumn / winter |
| desc | string | 一句话介绍（30 字内，会拼进提示词） |
| tips | string? | 可选贴士（如"需提前预约"） |

## CityCost（城市消费锚点）

| 字段 | 说明 |
| --- | --- |
| meal / hotel / localTransport | 三档单价 `[穷游, 舒适, 奢华]`，单位：元（每人每天餐饮 / 每晚住宿 / 每天市内交通） |
| costTier | 1-3 消费水平 |
| region | 大区：华东 / 华南 / 华中 / 华北 / 西南 / 西北 / 东北 |
| blurb | 一句话城市特色（用于表单自动补全） |

## CityClimate（月度气候）

每月一条：`tAvg / tMin / tMax`（℃）、`rainDays`（雨日数）、可选 `note`（如"梅雨季"、"台风季"）。
近似值即可，主要用于目的地发现时的季节推理与行程生成时的着装建议。

## Holidays（法定节假日）

`src/data/holidays.ts`，`start / end` 为调休后的实际休息区间。
新年度安排公布后在此追加。

## 坐标为什么是 GCJ-02？

中国法规要求互联网地图使用 GCJ-02 加密坐标系。本应用地图瓦片使用高德（GCJ-02），
因此数据集统一存 GCJ-02，二者天然对齐；若未来换成 WGS-84 底图（如 OSM）需要做坐标转换，
否则标记会偏移 300-600 米。

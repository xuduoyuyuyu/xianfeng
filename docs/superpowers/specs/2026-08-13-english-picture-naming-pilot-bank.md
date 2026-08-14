# 英语看图说词首版 50 词内容基线

日期：2026-08-13
状态：content-baseline
题库版本：`en-picture-naming-prea1-50@1.0.0-draft`
关联产品设计：[结构化语言盘点工具箱](2026-08-13-structured-language-assessment-toolkit-design.md)

## 本版结论

首轮固定使用 50 个可以由单张图片明确指向的生活名词。全部目标词来自 Cambridge English 2025 `Pre A1 Starters` 词表 `[R-CAM-YLE-WORDLIST-2025]`，但这是本产品自行选出的试验子集，不是 Cambridge 官方 50 词测试，也不代表完整 Pre A1 词汇量。

本轮只回答：孩子能否在无文字、无标准音提示时，从图片独立提取并说出这 50 个目标概念的英文，以及匹配词的发音证据是否稳定。结果不得外推完整英语词汇量、CEFR 等级、学校成绩或学习障碍。

本文件冻结目标词、已知允许答案、照片消歧要求和素材验收规则。照片、标准音和评分阈值仍是待制作、待校准资产，因此题库状态不是 `released`。

## 2026-08-13 手测实现检查点

- `闪测` 的“英文单词”入口保持为一个见词识读任务，不再拆成看图与看词两种测试模式。家长逐词记录孩子是否能独立读出，不录音、不调用 ASR，也不评价发音。
- 2026-08-14 起，本文冻结的 50 词全部进入运行题库，并按动物、食物与饮品、家居与学习、身体与穿着、交通与自然分成 5 个独立 10 词包。各词包独立恢复、保存和重新测试，实拍图补全版本为 `2026-08-14-prea1-packs-r2`。
- 单词字母形态是题目主体；同一词允许点击卡片切换到对应实拍照片，切换不产生第二题或第二份结果。五个词包 50 词均具备本地实拍照片候选。
- 每个结果只能表述为“本词包 10 个词中的见词识读表现”，不能把五包简单合并为完整英语词汇量、主动词汇量、CEFR 等级或发音评分。
- 50 张题图均为有来源记录的真实世界摄影照片压缩件，未使用生成图片或生成式修改；它们仍属于本地手测资产，正式发布前必须补齐本文件规定的许可快照、署名落点和命名预试。

## 真实照片硬约束

题图必须是相机拍摄的真实世界照片。“照片级”“写实风格”或看起来像照片不算真实照片。

禁止进入题库的内容包括：

- 文生图、图生图、AI 重绘、AI 扩图和任何完整或局部生成内容。
- 插画、矢量图、3D 渲染、游戏截图、影视截图和手工合成主体。
- 使用生成式填充增加、删除、移动或替换物体、人物、背景和身体部位。
- 没有原始来源页、摄影者或权利记录的二次转载图、搜索缩略图和社交媒体截图。
- 素材站标记为 `Generative AI`、`AI generated`、`illustration` 或来源状态无法确认的资产。

允许的后期仅限不改变画面事实的裁切、旋转、缩放、压缩、曝光、对比度、白平衡和轻度锐化。不得通过后期制造不存在的纯色背景；需要干净背景时重新拍摄或换用另一张真实照片。

## 任务与框架标记

| 字段 | 固定值 | 引用与边界 |
| --- | --- | --- |
| `inputModality` | `image` | 图片不显示字母、英文文字或可读品牌 |
| `responseModality` | `spoken-word` | 首次作答必须是无提示口语 |
| `constructs` | `productive-vocabulary-recall`, `word-pronunciation` | 不测拼写、句法或完整口语互动 |
| `activityModes.independent` | `production` | 看图命名是口语产出 `[R-CEFR-2020]` |
| `activityModes.prompted` | `reception`, `production` | 听标准音后跟读只作为提示后证据 |
| `activityModes.notCovered` | `interaction`, `mediation` | 本工具不因为使用 CEFR 标记就宣称覆盖四种活动 |
| `reportingUnit` | `this-fixed-50-item-bank` | 只报告“本组 50 个词中……” |

## 固定作答规则

1. 首次呈现只显示图片，最长录音窗口和重试次数由 `TaskProtocolVersion` 固定。
2. ASR 只产生候选；候选必须命中该题 `autoAccepted` 才能进入发音评测。
3. 自动规范化只做小写化、首尾空白和标点清理，并允许去掉一个开头冠词 `a`、`an` 或 `the`。
4. 不做全局单复数还原、拼写模糊匹配或大模型语义放行。单复数和同义词必须逐题列出。
5. 意义正确但未列入允许答案的回答进入 `needs-review`，不能自动判错；复核后只能修订后续题库版本，不能改写旧版规则。
6. 每个允许答案拥有自己的期望文本和参考音。不得用 `bike` 的参考音去评 `bicycle`，也不得用 `plane` 的参考音去评 `aeroplane`。
7. 照片引发两个以上同等自然答案时，优先重拍、换片或移除题项，而不是无限扩充允许答案。

## 50 词题目清单

所有行的目标词来源均为 `[R-CAM-YLE-WORDLIST-2025]`。`autoAccepted` 不含可由全局规则去除的冠词；`reviewCandidates` 是人工复核入口，不自动算会。

### 动物 10 词

| ID | 目标词 | `autoAccepted` | 照片构图约束 | `reviewCandidates` / 必须避免 | 来源 |
| --- | --- | --- | --- | --- | --- |
| EPN-001 | cat | `cat` | 单只成年家猫，全身，普通家居背景 | `kitten`；避免幼猫、狮虎花纹 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-002 | dog | `dog` | 单只成年家犬，全身，无工作犬装备 | `puppy`；避免明显幼犬 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-003 | bird | `bird` | 单只无明显物种特征的小型鸟，停在树枝上 | 具体鸟名；避免鸭、鸡、鹦鹉特征 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-004 | fish | `fish` | 单条普通鱼在水中，侧面全身 | `goldfish`；避免明显鲨鱼或热带鱼特征 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-005 | duck | `duck` | 单只成年鸭在水面，体型与喙清楚 | `duckling`；避免幼鸭和鹅 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-006 | horse | `horse` | 单匹成年马站立，全身，无骑手 | `pony`；避免驴、斑马和幼马 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-007 | cow | `cow` | 单头成年母牛，奶牛体态清楚 | `cattle`；避免公牛、牛犊 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-008 | sheep | `sheep` | 单只成年绵羊，羊毛明显 | `lamb`；避免山羊、幼羊 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-009 | elephant | `elephant` | 单只成年象，全身，长鼻和大耳清楚 | 无；避免只画局部或卡通猛犸象 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-010 | monkey | `monkey` | 单只带尾猴，全身，树枝背景 | `ape`；避免猩猩、无尾猿 | `[R-CAM-YLE-WORDLIST-2025]` |

### 食物与饮品 10 词

| ID | 目标词 | `autoAccepted` | 照片构图约束 | `reviewCandidates` / 必须避免 | 来源 |
| --- | --- | --- | --- | --- | --- |
| EPN-011 | apple | `apple` | 单个完整红苹果，带叶，不切开 | 无；避免同时出现多种水果 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-012 | banana | `banana` | 单根黄色香蕉，完整未剥皮 | 无；避免一串香蕉引发复数 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-013 | orange | `orange` | 单个橙子，带叶并显示果皮纹理 | 无；避免纯色块导致回答颜色 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-014 | egg | `egg` | 单个完整鸡蛋，置于小蛋托 | 无；避免煎蛋、复数鸡蛋 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-015 | bread | `bread` | 一条未切开的面包，非烤吐司形态 | `loaf of bread`；避免蛋糕、吐司片 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-016 | cake | `cake` | 一整个普通圆蛋糕，不放生日文字或数字 | `birthday cake`；避免纸杯蛋糕、派 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-017 | carrot | `carrot` | 单根完整胡萝卜，叶柄可见 | 无；避免多根造成复数 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-018 | tomato | `tomato` | 单个完整红番茄，绿色果蒂可见 | 无；避免切片和番茄酱 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-019 | potato | `potato` | 单个完整未削皮土豆，形态自然 | 无；避免薯条、红薯 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-020 | rice | `rice` | 一小碗白米饭，米粒清楚，无配菜 | 无；避免粥、炒饭、面条 | `[R-CAM-YLE-WORDLIST-2025]` |

### 家居与学习用品 10 词

| ID | 目标词 | `autoAccepted` | 照片构图约束 | `reviewCandidates` / 必须避免 | 来源 |
| --- | --- | --- | --- | --- | --- |
| EPN-021 | book | `book` | 单本合上的无字封面书，厚度清楚 | `notebook`；避免练习本、电子书 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-022 | pencil | `pencil` | 单支削好的木铅笔，无文字品牌 | 无；避免自动铅笔、蜡笔、钢笔 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-023 | ruler | `ruler` | 单把直尺，刻度可见但无可读文字 | 无；避免卷尺、三角尺 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-024 | chair | `chair` | 单把普通四脚餐椅，无扶手、无轮 | 无；避免扶手椅、沙发、凳子 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-025 | table | `table` | 单张普通餐桌，无抽屉、无学习用品 | `desk`；避免书桌和茶几 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-026 | bed | `bed` | 单张铺好床品的床，全貌清楚 | 无；避免沙发床、上下铺 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-027 | door | `door` | 单扇房门，门框和把手清楚 | 无；避免柜门、车门 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-028 | window | `window` | 单扇住宅窗，窗框清楚，正面视角 | 无；避免橱窗和车窗 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-029 | clock | `clock` | 单个圆形挂钟，有指针，无数字文字提示 | `watch`；避免手表、数字计时器 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-030 | bag | `bag` | 单个简洁手提袋，无肩带、校徽或品牌 | `handbag`, `schoolbag`, `backpack`；避免强类型特征 | `[R-CAM-YLE-WORDLIST-2025]` |

### 身体与穿着 10 词

| ID | 目标词 | `autoAccepted` | 照片构图约束 | `reviewCandidates` / 必须避免 | 来源 |
| --- | --- | --- | --- | --- | --- |
| EPN-031 | hand | `hand` | 一只张开的手，腕部以上不入镜 | 无；避免手臂占主画面 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-032 | foot | `foot` | 一只赤脚，脚踝以上不入镜 | `feet`；避免鞋袜和双脚 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-033 | eye | `eye` | 一只眼睛的干净局部图，眉毛弱化 | `eyes`；避免整张脸和双眼 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-034 | ear | `ear` | 一只耳朵的干净局部图，无耳饰 | `ears`；避免整张侧脸 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-035 | nose | `nose` | 鼻子的正面局部图，其他五官弱化 | 无；避免完整人脸 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-036 | mouth | `mouth` | 嘴巴的正面局部图，嘴唇自然闭合 | `lips`；避免牙齿、舌头成为主体 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-037 | hair | `hair` | 人物后脑及清楚发型，脸部不成为主体 | 无；避免假发、单根头发 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-038 | hat | `hat` | 单顶有帽檐的普通帽子，独立陈列 | `cap`；避免棒球帽、头盔 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-039 | shoe | `shoe` | 单只普通低帮鞋，侧面，无品牌 | `shoes`；避免靴子、拖鞋、运动鞋强特征 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-040 | shirt | `shirt` | 单件有领长袖衬衫，正面平铺 | `T-shirt`；避免短袖圆领和外套 | `[R-CAM-YLE-WORDLIST-2025]` |

### 交通与自然物 10 词

| ID | 目标词 | `autoAccepted` | 照片构图约束 | `reviewCandidates` / 必须避免 | 来源 |
| --- | --- | --- | --- | --- | --- |
| EPN-041 | car | `car` | 单辆普通轿车，侧前方全车 | `automobile`；避免出租车、赛车、SUV 强特征 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-042 | bus | `bus` | 单辆普通城市公交车，无可读线路文字 | `coach`；避免校车和长途客车特征 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-043 | train | `train` | 单列客运火车在轨道上，车头和多节车厢可见 | 无；避免地铁、玩具火车 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-044 | bike | `bike`, `bicycle` | 单辆无电机、无篮筐的普通自行车 | 无；避免摩托车、电动车 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-045 | boat | `boat` | 单只小型无帆划艇在水面 | `rowboat`；避免轮船、帆船、独木舟 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-046 | plane | `plane`, `airplane`, `aeroplane` | 单架民航客机在空中，全机可见 | `aircraft`；避免直升机、玩具飞机 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-047 | truck | `truck`, `lorry` | 单辆普通厢式货车，无品牌文字 | 无；避免皮卡、工程车、面包车 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-048 | sun | `sun` | 白天蓝天中的单个太阳，有少量云作语境 | 无；避免星形图标和日落场景 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-049 | tree | `tree` | 单棵成熟阔叶树，全树和树干可见 | 无；避免森林、圣诞树、棕榈树 | `[R-CAM-YLE-WORDLIST-2025]` |
| EPN-050 | flower | `flower` | 单朵无明确品种特征的花，茎叶可见 | 具体花名；避免花束、玫瑰、向日葵强特征 | `[R-CAM-YLE-WORDLIST-2025]` |

## 发音覆盖检查

这 50 词首先是图片命名内容，不是按音素均衡抽样的诊断量表；仍应在首轮供应商校准中覆盖以下容易暴露系统差异的组合：

| 检查点 | 代表词 | 用途 |
| --- | --- | --- |
| 长短元音 | `sheep` / `fish`, `shoe` / `book` | 检查系统能否保留词级和音素级差异，而非设置儿童达标线 |
| `/æ/` | `cat`, `bag`, `hand` | 检查常见元音偏差是否稳定返回 |
| `/ɜːr/` 或卷舌变体 | `bird` | 检查所选英美口音和评分模型是否一致 |
| `/ʃ/`、`/tʃ/`、`/θ/` | `sheep`, `shoe`, `fish`, `chair`, `mouth` | 检查辅音证据粒度 |
| 辅音连缀 | `bread`, `train`, `plane`, `flower` | 检查短词中连缀丢失和 ASR/MDD 分工 |
| 词尾辅音 | `book`, `foot`, `egg`, `bed`, `clock` | 检查录音截断是否被误判为发音问题 |
| 英美词形变体 | `truck` / `lorry`, `plane` / `airplane` / `aeroplane` | 确认每个允许答案独立匹配、独立评测 |

这些检查点属于 `[R-VOLC-MDD-EN]` 能力验证，不构成 CEFR 评分描述，也不预设供应商返回字段一定满足需求。

## 真实照片采购与验收

### 推荐获取顺序

1. 自主实拍：优先用于食物、学习用品、家居物品、服装和可控交通工具，最容易控制构图和权利链。
2. 有明确“摄影照片”分类、摄影者、授权范围和下载凭证的商业图库：优先用于动物、飞机、火车等难以实拍的对象。
3. 原文件页清楚标明作者和逐文件许可的开放图库：只作为补充，并逐张保存许可快照和署名要求。

不得把某个平台的通用许可当成单张素材已经合规。Unsplash 的许可允许广泛使用，但其官方说明也提示人物、场所、商标和其他第三方权利仍可能需要额外授权 `[R-UNSPLASH-LICENSE] [R-UNSPLASH-RELEASES]`；Wikimedia Commons 则要求按每个文件页的具体许可履行署名、许可链接或相同方式共享等条件 `[R-WIKIMEDIA-REUSE]`。

Adobe Stock 等平台会接收并标记生成式 AI 内容，因此采购时必须明确排除 AI 标签，不能因为来自商业图库就默认是真实照片 `[R-ADOBE-AI-LABEL]`。

### 分组采购路径

| 分组 | 首选路径 | 特殊权利与真实性要求 |
| --- | --- | --- |
| 动物 10 词 | 商业摄影图库，必要时动物园或农场授权实拍 | 必须是实际动物；物种、成年/幼年和尾部等辨识特征需人工核对 |
| 食物 10 词 | 自主棚拍真实食物 | 保留原始相机文件；不使用包装、商标或合成蒸汽、光影 |
| 家居与学习用品 10 词 | 自主棚拍真实物品 | 使用自有或授权物品；品牌文字通过拍摄角度避开，不靠后期删除 |
| 身体与穿着 10 词 | 有模特授权的成人摄影或内部授权成人实拍 | 首版不使用儿童模特；保存 model release，不用 AI 修肤或生成身体部位 |
| 交通与自然物 10 词 | 自主户外拍摄与商业摄影图库混合 | 车牌、人脸、品牌和建筑权利通过取景规避；不靠生成式擦除 |

动物组首轮候选的逐张视觉结论见[真实照片候选审查](2026-08-13-english-picture-naming-real-photo-candidate-audit.md)。

### 统一照片约束

- 题目使用 1:1 展示框，但不要求把照片文件强制裁成正方形。默认按原比例完整显示；只有不切掉主体且不引入第二主体时才允许普通裁切。
- 1:1 框内因原始宽高比产生的留白是界面容器，不写进图片文件，不使用生成式扩图或伪造照片背景。
- 照片内保持单一主体，主体占照片有效画面约 65%–80%；横向长物体可以略低，但必须在目标设备上清楚可辨。
- 整批使用自然、清楚、不过度滤镜的摄影风格；允许不同摄影者，但亮度、主体比例和背景复杂度应落在同一验收范围。
- 不出现英文、拼音、数字答案、品牌、国旗、学校标识或能直接提示词形的字母。
- 不通过夸张表情、动作或场景让孩子回答另一个词，例如 `sleep`、`eat`、`ride`。
- 免费图库只在逐张完成真实性、许可和第三方权利审核后使用；不热链远程图片，审核通过后下载并锁定本地资产版本。
- 不使用自动 AI 检测结果作为“真实照片”的唯一证明；以来源页、摄影者、原始文件或图库元数据、编辑记录和人工审核共同构成证据链。

### 每张照片的来源链

每个 `imageAsset` 至少保存：

- `captureType: camera-photo`
- `sourceMode: original-shoot | licensed-stock | open-license`
- `sourcePageUrl` 和原始下载地址
- 摄影者、图库或拍摄负责人
- 逐文件许可、购买凭证或内部授权记录
- 人物 `modelRelease` 和必要的 `propertyRelease`
- 素材页的 AI/插画标签状态及审核截图
- 审核下载件 `candidateFileHash`；该值只绑定当前审核文件，不冒充原始文件哈希
- 原始文件 `originalHash`、原始 EXIF 保留状态和下载时间
- 从原图到成品的 `editLog`
- 成品 `contentHash`、审核人和审核日期

来源页失效不自动使已锁定结果失效，但新题库版本不得继续采用无法证明来源的素材。

### 图片命名预试

每张候选照片在正式儿童试验前，先由至少 12 名不参与出题的人独立看图说英文或写出第一反应：

- 至少 10/12 的第一反应命中 `autoAccepted`，才进入下一轮。
- 出现 2 次以上同一个未列明但合理答案时，必须增加允许答案或重画，不能直接忽略。
- 出现目标词以外的多个分散合理答案时，优先删除该题。
- 预试记录与最终照片哈希绑定；换图后必须重做预试。

这个阈值是首轮内容质检门槛，不是测量效度证明，后续仍需儿童样本和人工标注验证 `[R-ETS-AUTOSCORE-2022]`。

## 标准音策略

- 首版只选一个主要示范口音，暂定 `en-US-primary-v1`；口音和音色在全部 50 词中保持一致。
- 标准音离线预生成并人工听审，不在每次测试时临时合成。已开始的结果锁定 `audioAssetVersion` 和内容哈希。
- 火山引擎 TTS 支持英文合成和多种音频参数，可作为候选生产能力 `[R-VOLC-TTS]`；具体音色、接口版本、采样率和费用必须在技术试验后再锁定。
- `Tina老师` 等教育场景音色只能作为候选，不能因为名称带“英语教育”就跳过母语者听审。
- `bike` / `bicycle`、`plane` / `airplane` / `aeroplane`、`truck` / `lorry` 分别生成参考音和期望文本。
- 标准音只在首次独立作答结束后播放；跟读结果不得覆盖无提示作答。
- 不使用孩子或家长声音复刻制作首版标准音。

## 工程载荷最小字段

```json
{
  "itemBankVersion": "en-picture-naming-prea1-50@1.0.0",
  "itemId": "EPN-044",
  "targetLexeme": "bike",
  "autoAccepted": ["bike", "bicycle"],
  "reviewCandidates": [],
  "imageAsset": {
    "assetId": "pending",
    "captureType": "camera-photo",
    "sourceMode": "pending",
    "sourcePageUrl": "pending",
    "photographer": "pending",
    "licenseRef": "pending",
    "modelReleaseRef": null,
    "propertyReleaseRef": null,
    "aiContentStatus": "must-be-none",
    "displayMode": "contain",
    "candidateFileHash": "pending",
    "originalHash": "pending",
    "editLogRef": "pending",
    "contentHash": "pending",
    "ambiguityReviewRef": "pending"
  },
  "audioAssets": [
    {"lexeme": "bike", "assetId": "pending", "contentHash": "pending"},
    {"lexeme": "bicycle", "assetId": "pending", "contentHash": "pending"}
  ],
  "constructs": ["productive-vocabulary-recall", "word-pronunciation"],
  "activityModes": ["production"],
  "referenceLinks": ["R-CAM-YLE-WORDLIST-2025", "R-CEFR-2020"]
}
```

不得把 `pending` 载荷发布到正式题库。后续实现时，50 条数据应由同一份机器可读种子生成测试界面和后台审核视图，不能在前端、后端和文档各维护一份词表。

## 供应商与评分校准门

在写正式阈值前，使用同一组 50 词完成以下样本：

- 正确目标词：不同说话人、设备、语速和合理口音。
- 明确错误词：同类近邻词，例如 `goat` 对 `sheep`、`desk` 对 `table`。
- 发音偏差：由人工标注偏差位置，不能只制造文本错误。
- 无效音频：静音、截断、距离过远、背景人声和持续噪声。
- 允许变体：每个变体独立跑 ASR、期望文本和发音评测。

只有在真实调用证据确认后，才填写：

- ASR 候选字段、置信度和候选数量。
- MDD 的单词级、音素级、完整度和录音质量字段。
- 网络延迟、超时、重试、计费和并发。
- 儿童声音与成人声音的差异。
- `stable-pronunciation` 与 `needs-pronunciation-practice` 的首版规则。

若服务不能可靠返回单词或音素证据，产品仍可做结构化“是否独立说出”盘点，但必须取消“校准读音”的承诺，不能用聊天模型主观点评替代缺失的评测能力。

## 晋级为正式 1.0.0 的条件

- 50 张真实照片全部完成来源核验、命名预试、权利记录、编辑记录和原始/成品哈希。
- 任何标记或怀疑包含生成式内容的照片均已替换，没有使用 AI 检测分数单独放行的资产。
- 所有允许答案都有独立标准音和人工听审记录。
- 成人系统样本、经单独授权的儿童样本、错误词和无效音频均完成盲评对照。
- 阈值和状态规则形成独立 `ScoringRuleVersion`，且能解释误判和人工复核入口。
- 小程序实测证明首次作答、提示、跟读、退出续测和历史结果锁定同一题库版本。
- 结果页只报告固定 50 词内的事实，并能打开逐词证据和来源引用。

## 引用目录

| ID | 类型 | 支持的具体规则 | 限制 | 链接 |
| --- | --- | --- | --- | --- |
| `R-CAM-YLE-WORDLIST-2025` | `content-source` | 证明这 50 个目标词出现在 2025 Pre A1 Starters A–Z 词表 | 不证明本产品 50 词抽样完整、图片有效或评分有效 | <https://www.cambridgeenglish.org/images/506166-starters-movers-flyers-word-list-2025.pdf> |
| `R-CAM-YLE-PREA1` | `assessment-example` | 参考 6–12 岁儿童活动式、图片相关的任务组织 | 本产品不是 Cambridge 考试或官方模拟题 | <https://www.cambridgeenglish.org/exams-and-tests/qualifications/young-learners/paper/starters/preparation/> |
| `R-CEFR-2020` | `framework` | 标记本工具主要覆盖口语产出，提示阶段涉及接收 | 不授予 CEFR 等级，也不覆盖互动和中介 | <https://www.coe.int/en/web/common-european-framework-reference-languages/cefr-companion-volume-and-its-language-versions> |
| `R-ETS-AUTOSCORE-2022` | `measurement` | 自动开放作答需要人工复核、验证和持续监控 | 不提供本题库的现成阈值 | <https://www.ets.org/content/dam/ets-org/pdfs/about/cr_best_practices.pdf> |
| `R-VOLC-TTS` | `vendor-capability` | 火山 TTS 支持英文合成、音色和参数化音频输出 | 不证明任一候选音色适合儿童英语标准音 | <https://www.volcengine.com/docs/6561/1257543?lang=zh> |
| `R-VOLC-MDD-EN` | `vendor-capability` | 火山产品提供面向语言学习者的口语评测能力 | 实际英文接口、字段、儿童表现、成本和阈值仍需账号内调用验证 | <https://www.volcengine.com/products/Audio-editing-and-sound-processing> |
| `R-UNSPLASH-LICENSE` | `asset-license` | 说明 Unsplash 通用下载与使用许可 | 不证明具体照片没有第三方权利或一定是真实摄影 | <https://unsplash.com/license> |
| `R-UNSPLASH-RELEASES` | `asset-license` | 提醒人物、场所、商标等可能需要额外授权 | 平台无法保证每张上传图片的授权范围 | <https://help.unsplash.com/en/articles/2612329-releases-and-trademarks> |
| `R-WIKIMEDIA-REUSE` | `asset-license` | 要求按单个文件页履行许可、署名和衍生作品条件 | 开放许可不等于无需逐张审核 | <https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia/licenses/en> |
| `R-ADOBE-AI-LABEL` | `asset-provenance` | 证明商业图库可能同时包含并标记生成式 AI 内容 | 标签可用于排除，不能替代完整来源核验 | <https://helpx.adobe.com/stock/contributor/submit-your-content/submit-generative-ai-content/submit-generative-ai-content.html> |

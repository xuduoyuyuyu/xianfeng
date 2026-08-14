# 英语看图说词：真实照片候选审查

日期：2026-08-13
状态：manual-pilot-assets
关联题库：[英语看图说词首版 50 词内容基线](2026-08-13-english-picture-naming-pilot-bank.md)

## 审查结论

首轮从明确标注为摄影照片、带摄影者或相机信息的来源页下载了 10 张动物候选，并逐张查看候选画面。第二轮继续为被淘汰的 6 个词寻找替代照片，并复核来源页、逐文件许可与下载文件哈希。2026-08-13 已把这 10 张照片的非生成式压缩衍生件接入本地微信开发者工具，供产品全流程手测；这不等于它们已经通过正式发布的授权、署名、命名预试和效度门槛。

当前 10 个动物词都已有可继续验证的真实照片候选：8 张进入来源核验，2 张需要仅靠裁切形成单主体后重审。搜索标题、图库标签和“真实照片”身份都不能替代视觉审核；同样，来源可靠也不代表画面适合测评。

## 状态定义

- `provenance-review`：照片视觉上满足目标，继续核验逐文件许可、摄影者、下载凭证和第三方权利。
- `crop-review`：只允许裁切；裁切后重新检查主体比例、背景和命名歧义。
- `rejected`：当前照片不再使用，不通过生成式编辑补救。

## 首轮逐张结果

| 题目 | 来源页 | 实拍证据 | 视觉结论 | 状态 |
| --- | --- | --- | --- | --- |
| `EPN-001 cat` | [Kerin Gedge / Unsplash](https://unsplash.com/photos/a-cat-standing-in-front-of-a-wooden-fence-r_Jp9k2i01g) | 页面标注 Nikon D80、摄影者和拍摄地点 | 成年猫主体完整、足够大；木围栏不造成第二答案 | `provenance-review` |
| `EPN-002 dog` | [Guilherme Stecanella / Unsplash](https://unsplash.com/photos/tan-dog-standing-on-grass-AbYj2CuGmGY) | 页面标注 Canon EOS 60D、摄影者和真实宠物说明 | 年龄观感偏幼，可能回答 `puppy`；项圈也增加无关细节 | `rejected` |
| `EPN-003 bird` | [NPS / Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Chipping_Sparrow_bird_perched_on_a_branch._(81da5909-1dd8-b71b-0b66-b8098cc30617).jpg) | NPS 摄影来源、拍摄日期、公共领域说明和 EXIF | 鸟在复杂枝叶中占比过小，小屏识别成本高 | `rejected` |
| `EPN-004 fish` | [Adam Juman / Unsplash](https://unsplash.com/photos/a-single-fish-swims-in-clear-turquoise-water-y3KYDRZqu34) | 页面列摄影者、地点和真实水下照片 | 画面主体是鲨鱼且过小，会自然回答 `shark` | `rejected` |
| `EPN-005 duck` | [Rolf Schmidbauer / Unsplash](https://unsplash.com/photos/mallard-duck-on-water-during-daytime-duldpttwi2w) | 页面标注 Fujifilm X-T3、摄影者和拍摄日期 | 单只成年绿头鸭，主体清楚，水面背景简单 | `provenance-review` |
| `EPN-006 horse` | [Thomas Peham / Unsplash](https://unsplash.com/photos/white-horse-standing-on-white-sand-7UTgWorEKEI) | 页面标注 Fujifilm X-T10、摄影者和拍摄日期 | 只见马的后半身且带骑手，可能引出 `ride` | `rejected` |
| `EPN-007 cow` | [Alexandros Giannakakis / Unsplash](https://unsplash.com/photos/brown-cow-standing-in-a-grassy-field-rDS6l-8J2G8) | 页面标注 Canon EOS R5、摄影者和拍摄日期 | 长角、耳标和体态增加 `bull` / `cattle` 歧义 | `rejected` |
| `EPN-008 sheep` | [Jeremy Perkins / Unsplash](https://unsplash.com/photos/sheep-standing-on-ground-_bklhwAuOvw) | 页面标注 Canon EOS Rebel T7i、摄影者和羊群说明 | 中央成年羊清楚，但背景有多只羊；允许裁切后重审 | `crop-review` |
| `EPN-009 elephant` | [Udara Karunarathna / Unsplash](https://unsplash.com/photos/an-elephant-standing-in-a-field-of-tall-grass-XiOQhhXWX6Y) | 页面列摄影者、真实物种说明和拍摄日期 | 成年象主体大、长鼻和耳部清楚，背景不引出其他词 | `provenance-review` |
| `EPN-010 monkey` | [Alexey Demidov / Unsplash](https://unsplash.com/photos/a-monkey-standing-on-a-tree-stump-in-a-forest--k-f5WbktTs) | 页面标注 Canon EOS 6D、摄影者和拍摄日期 | 猴子过小，树干和森林占据大部分画面 | `rejected` |

## 淘汰后的新搜索条件

| 目标词 | 下一张候选必须满足 |
| --- | --- |
| dog | 明确成年、无项圈和装备、全身侧前方、主体至少占画面 65% |
| bird | 单只普通小鸟、枝叶稀少、鸟体至少占画面 60%、避免明显物种特征 |
| fish | 单条非鲨鱼、非热带观赏鱼，侧面全身，水下背景简单 |
| horse | 成年马全身、无骑手和马具、无其他马匹、四肢完整 |
| cow | 明确成年母牛、避免显著长角和耳标、全身、无牛犊 |
| monkey | 带尾猴全身、主体至少占画面 65%、背景简单、避免猩猩和幼猴 |

## 第二轮替代结果

| 题目 | 采用的候选来源页 | 来源证据 | 视觉结论 | 状态 |
| --- | --- | --- | --- | --- |
| `EPN-002 dog` | [Wj32 / Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Standing_dog.jpg) | 自主实拍，FinePix S9500 EXIF；文件页提供 CC BY-SA 3.0 等可选许可 | 成年犬全身、无项圈和工作装备；俯视角轻微，但不形成第二答案 | `provenance-review` |
| `EPN-003 bird` | [Önder Andinç / Unsplash](https://unsplash.com/photos/a-sparrow-perches-on-a-branch-in-nature-DA1DR90t_xI) | 页面列摄影者、Panasonic DC-FZ82、发布日期和 Unsplash License | 单只普通麻雀占画面主体，背景虚化，无文字与其他鸟 | `provenance-review` |
| `EPN-004 fish` | [Jiaqian AirplaneFan / Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Fish_swimming_in_freshwater_aquarium_-_panoramio_(1).jpg) | 真实水族馆摄影，来源归档、摄影者和 CC BY 3.0 明确 | 原图有 3 条鱼，1:1 裁切无法在保留目标鱼全身时排除其他鱼；另一个单鱼候选又容易回答 `goldfish` | `rejected` |
| `EPN-006 horse` | [Colt Parent / Unsplash](https://unsplash.com/photos/a-horse-standing-in-a-field-lL5kia_IhV0) | 页面列摄影者、Canon EOS Rebel T7、发布日期和 Unsplash License | 成年马全身、无骑手和其他马；简单笼头是轻微干扰，必须在命名预试中验证 | `provenance-review` |
| `EPN-007 cow` | [Aethonatic / Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Lone_cow_in_a_field_-_2_June_2025.jpg) | 自主实拍，拍摄日期、地点、摄影者和 CC0 明确 | 单头成年牛侧面完整；原图留白过多，耳标不可读，允许裁切放大后重审 | `crop-review` |
| `EPN-010 monkey` | [Al Kordesch / Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Long-tailed_Macaque_357899609.jpg) | iNaturalist 原始观察可追溯，Commons 已复核 CC0，文件页提供原文件 SHA-1 | 单只成年带尾猴全身，主体清楚，无其他动物和人造道具 | `provenance-review` |

第二轮同时明确淘汰了以下看似可用但会污染测量的照片：带醒目项圈的狗、正面俯冲角度的鱼、带可读 `1803` 耳牌的牛、背景有多只猴子的温泉猴。任何一张都不使用生成式消除、背景替换或局部重绘补救。

## 第三轮鱼类补位结果

`EPN-004 fish` 改用 [Retro Lenses / Wikimedia Commons 单鱼裁切文件](https://commons.wikimedia.org/wiki/File:A_photo_of_a_common_roach_with_a_lot_fishes_in_aquarium_(cropped).jpg)。该文件不是生成图，而是从同一摄影者的真实水族馆照片中做普通裁切得到的独立 Commons 文件。

- 文件页记录 `Own work`、摄影者 Retro Lenses、Sony NEX-6 相机、2016-06-28 拍摄日期和 CC BY 4.0。
- Commons API 返回原文件尺寸 2013×1476、SHA-1 `af4774ea36a252fa66c0f16b4452f517754d51a1`；本地下载后重新计算的 SHA-1 完全一致。
- 画面只有一条普通拟鲤，侧面全身，头、尾和各鳍完整；没有文字、饲养工具、其他鱼或明显 `shark` / `goldfish` 诱导特征。
- 缩放到 360×264 的小屏审核件后，鱼体轮廓、眼、尾和各鳍仍清楚，没有出现新歧义。
- 横向照片不强行裁成正方形。产品使用 1:1 展示框并按比例完整显示照片；框内留白属于界面，不写入图片文件，不生成或替换照片背景。

结论：`EPN-004 fish` 进入 `provenance-review`，仍需完成许可快照、署名落点和 12 人第一反应命名预试。

## 当前候选下载件清单

这里的 `candidateFileHash` 是 2026-08-13 下载用于人工审核的 JPEG 候选件 SHA-256。Unsplash 下载件和 Wikimedia 缩放预览都不等同于来源站“原始文件”，所以这些值不得写入 `originalHash`；正式采购时仍需下载原始文件并另算哈希。

| 题目 | 候选尺寸 | `candidateFileHash` | 当前状态 |
| --- | --- | --- | --- |
| `EPN-001 cat` | 1200×1043 | `004cc25588ed79999df7578f812070bff05f1a1478e0815e24d26c46ad93361e` | `provenance-review` |
| `EPN-002 dog` | 1920×1531 | `7aa8553e714c8f09843fdce0c5af0d15cd6db1b98e551cdd120bc629ab05abe9` | `provenance-review` |
| `EPN-003 bird` | 1600×1200 | `768f6bdd44317bf3e8e5d6ddd39d5af4292065aa03b1efedf3df675602a9c774` | `provenance-review` |
| `EPN-004 fish` | 2013×1476 | `e8372100f70039aa4b61b16aec36354d3f033bca3a357f04a15bb98bb426004e` | `provenance-review`；官方原文件 |
| `EPN-005 duck` | 1200×882 | `11476496265085a10891b9fc3ac9863f48f4283a048ff4af926716dd304d4538` | `provenance-review` |
| `EPN-006 horse` | 1600×2400 | `860df8b8142f24d8450c729da4167b6a8a6001c5a9c390bc918597251938c0e2` | `provenance-review` |
| `EPN-007 cow` | 1920×1281 | `4420475a0c7436075263a228b3417d8dbab1fda8fc28901a519f93c22c779acd` | `crop-review` |
| `EPN-008 sheep` | 1200×777 | `af30af133f5b415e23170a2165078d7954c570f365b3262423c6a929d9680716` | `crop-review` |
| `EPN-009 elephant` | 1200×800 | `27dddf068caded355645a217d1e08d8cc9485ec185373787fa8c25c2a38c6785` | `provenance-review` |
| `EPN-010 monkey` | 1536×2048 | `6fdad9c3772c65d21a101efaff15da81ce769a5c6797578b8ee6a3cb9fa17457` | `provenance-review` |

## 进入题库前仍缺少的证据

即使已有候选，当前 10 张也还不能入库。每张拟入库照片必须继续完成：

- 保存来源页和许可快照，而不是只保留下载链接。
- 确认页面没有 `Generative AI` 或 `illustration` 标记。
- 记录摄影者、下载日期、审核候选件哈希，以及正式取得的原始文件和独立哈希。
- 审查动物园、私人场地、商标或其他第三方权利。
- 在最终 1:1 展示框中重新做视觉审核和 12 人命名预试；只有完整主体仍被保留时才允许裁切。

Unsplash 许可允许广泛下载和使用，但官方同时提示人物、场所、商标及其他第三方权利可能需要额外许可，且平台无法保证每一张上传内容的授权范围：[Unsplash License](https://unsplash.com/license)、[Releases and Trademarks](https://help.unsplash.com/en/articles/2612329-releases-and-trademarks)。Wikimedia Commons 文件则必须遵守该文件描述页列出的具体许可与署名要求：[Commons reuse guidance](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia/licenses/en)。

## 当前边界

- 2026-08-14 已为其余四个词包补入 40 张逐文件可追溯的 Wikimedia Commons 摄影候选，并人工剔除检索中混入的门、人体头发和帽子插画，以及不适合儿童页面的口腔内部特写。50 张缩放压缩衍生件均位于小程序 `pages/flash-test` 分包，用于本地手动走通五组词包。
- 新增 40 张候选的逐文件来源、摄影者与页面许可记录见分包资产目录的 `README.md`。这些记录证明候选来源，不代表已完成许可快照、人物或场所 release、署名落点及命名预试。
- 没有对候选照片进行生成式修改、生成式扩图、内容删除或背景替换；界面使用 `aspectFit` 完整显示照片。
- 本地可运行、微信预览包通过和 ASR 可调用都不等同于照片许可通过、命名预试通过、量表校准完成或生产发布。

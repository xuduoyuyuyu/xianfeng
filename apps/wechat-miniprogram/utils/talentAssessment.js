const DIMENSIONS = [
  {
    code: "M",
    name: "记忆",
    fullName: "记忆能力",
    questions: [
      "背诵知识点、记住大量细节时，我的速度明显快于身边大多数人",
      "多年前发生的小事、他人随口说过的话，我依旧能清晰回忆起来",
      "我很愿意收集零散常识、案例、碎片化信息，并长久记住",
      "面对需要大量重复识记的任务，我不会感到吃力甚至擅长应对",
      "我总能记住别人早已遗忘的场景、对话、时间节点等细节信息"
    ]
  },
  {
    code: "Y",
    name: "推演",
    fullName: "推演能力",
    questions: [
      "面对杂乱无序的信息，我可以快速梳理出清晰的因果逻辑链",
      "旁人觉得绕、复杂混乱的事情，我总能快速抓取核心关键矛盾",
      "不用精确计算，我也大致能预判一件事后续的发展走向",
      "与人争辩、阅读文章时，我很容易察觉到对方逻辑里的漏洞与矛盾",
      "接触完全陌生的复杂领域，仅凭逻辑思考就能自主弄懂大部分规则"
    ]
  },
  {
    code: "B",
    name: "表达",
    fullName: "表达能力",
    questions: [
      "我可以把晦涩复杂的道理讲得通俗清晰，让普通人快速听懂",
      "口头说话或是文字写作时，思路连贯顺畅，很少卡顿、词不达意",
      "我容易带动群体氛围，也能用观点和情绪打动、说服其他人",
      "即兴发言、临时写作时，无需提前写稿也能稳定输出完整内容",
      "无论书面还是口头输出，我的表达水平整体稳定，极少发挥失常"
    ]
  },
  {
    code: "G",
    name: "感知",
    fullName: "感知能力",
    questions: [
      "他人细微的情绪变化、微表情与态度转变，我能第一时间捕捉到",
      "身处多人环境，我能敏锐感知现场氛围是放松、紧张还是尴尬",
      "我常常能读懂一句话背后隐藏的真实意图，而非只理解字面意思",
      "环境里细微的异常、微小改变，都会被我快速留意到",
      "我擅长换位思考，提前预判他人内心的需求、顾虑与潜在想法"
    ]
  },
  {
    code: "S",
    name: "数理",
    fullName: "数理能力",
    questions: [
      "习惯把现实中的各类问题提炼抽象规律、模型与量化逻辑",
      "相比于记住答案，我更热衷于理解公式、理论背后的底层原理",
      "面对不同问题，我能快速判断哪一套数理模型最适配当前场景",
      "我偏爱探究事物本质运行规则，不满足于表面的现成结论",
      "我可以把多个互不相关的数理知识点串联，搭建完整知识体系"
    ]
  },
  {
    code: "C",
    name: "操作",
    fullName: "操作能力",
    questions: [
      "拆装物品、软件设置、工具实操这类事情，我上手速度很快",
      "在脑海中想象物体结构、空间布局、操作流程对我来说毫不费力",
      "设备、软件出现小故障时，我倾向于自行摸索调试，而非直接求助他人",
      "实操类、动手类技能，我学习掌握的速度远快于纯理论类知识",
      "我执行力很强，很擅长把脑海里的想法落地、变成可实现的实际成果"
    ]
  },
  {
    code: "K",
    name: "狂热",
    fullName: "狂热能力",
    questions: [
      "存在某一个领域，我会自发主动钻研投入，完全不需要外界督促",
      "对待自己真正热爱的事，我会极度较真，拒绝敷衍、粗略完成",
      "在感兴趣的方向上，我可以长期坚持深耕，很难出现三分钟热度",
      "为深耕热爱领域，我愿意投入大量时间精力，即便没有即时回报也愿意",
      "当大部分人选择放弃一件有难度的事时，我更容易坚持死磕到底"
    ]
  },
  {
    code: "Z",
    name: "创造",
    fullName: "创造能力",
    questions: [
      "日常生活里，我经常冒出别人很难想到的全新思路与点子",
      "写方案、做设计、构思内容时，我更愿意原创，而非照搬现成模板",
      "我习惯改良、重构现有方案，不愿意完全沿用老旧固定模式",
      "我能把零散、无关的信息整合，诞生出新体系、新视角与新观点",
      "我的创作、策划、思考具备强烈个人特色，原创辨识度很高"
    ]
  }
];

const CHILD_DIMENSIONS = [
  {
    code: "M",
    name: "记忆",
    fullName: "记忆能力",
    questions: [
      "听完故事、上完课或读完一篇文章后，孩子能较快复述关键内容",
      "隔了较长时间，孩子仍能记得家庭活动、学校经历中的具体细节",
      "对感兴趣的知识、词句或人物资料，孩子会主动收集并长久记住",
      "背课文、单词或规则要点时，孩子上手较快，也不强烈排斥重复练习",
      "老师、家长或同伴以前交代和说过的细节，孩子通常都能记住"
    ]
  },
  {
    code: "Y",
    name: "推演",
    fullName: "推演能力",
    questions: [
      "作业或生活任务信息较多时，孩子能自己梳理先后顺序和因果关系",
      "碰到复杂题目或同伴冲突时，孩子常能抓住真正需要解决的关键问题",
      "阅读故事或观察事情发展时，孩子经常能猜到接下来可能发生什么",
      "听别人解释或看解题过程时，孩子容易发现前后矛盾和遗漏之处",
      "接触新游戏、新学科或新规则时，孩子能靠观察和思考自己弄懂不少内容"
    ]
  },
  {
    code: "B",
    name: "表达",
    fullName: "表达能力",
    questions: [
      "学到新知识后，孩子能用自己的话讲清楚，让家人或同伴听懂",
      "讲学校经历、回答问题或写作文时，孩子的思路通常连贯有条理",
      "参加小组或同伴活动时，孩子能清楚表达观点并带动大家继续讨论",
      "课堂临时发言或即兴讲故事时，孩子不需要准备很久也能完整表达",
      "在家庭、课堂和书面作业中，孩子的表达水平整体比较稳定"
    ]
  },
  {
    code: "G",
    name: "感知",
    fullName: "感知能力",
    questions: [
      "家长、老师或同伴情绪有细微变化时，孩子通常很快就能察觉",
      "在课堂、家庭聚会或同伴游戏中，孩子能感受到现场是轻松还是紧张",
      "别人没有把话说透时，孩子常能理解对方真正想表达的意思",
      "课程安排、物品位置或生活环境有小变化时，孩子往往很快注意到",
      "合作学习或共同生活时，孩子会提前想到别人可能需要什么、担心什么"
    ]
  },
  {
    code: "S",
    name: "数理",
    fullName: "数理能力",
    questions: [
      "学习和生活中遇到不同事物时，孩子喜欢寻找分类、数量或变化规律",
      "相比直接记住答案，孩子更想弄懂公式、规则或现象背后的原因",
      "面对数学、科学或逻辑任务时，孩子能较快判断该用哪种方法解决",
      "家长或老师给出现成结论后，孩子仍常追问为什么，并尝试验证规则",
      "孩子能把不同课程里的数理知识串起来，并联系到真实生活中的问题"
    ]
  },
  {
    code: "C",
    name: "操作",
    fullName: "操作能力",
    questions: [
      "做手工、搭积木、使用学习工具或软件时，孩子通常很快就能上手",
      "看到物体结构、路线或操作说明时，孩子能在脑中想象怎样一步步完成",
      "文具、玩具或设备出现小问题时，孩子倾向先自己尝试检查和调整",
      "实验、手工和实践任务中，孩子通过亲手去做往往比只听讲学得更快",
      "有了一个想法后，孩子善于把它做成作品、模型或可以展示的实际成果"
    ]
  },
  {
    code: "K",
    name: "狂热",
    fullName: "狂热能力",
    questions: [
      "对某个学科或兴趣真正着迷时，孩子会主动查资料、练习或继续探索",
      "面对自己热爱的作业、作品或活动，孩子会认真打磨，不愿草草完成",
      "在感兴趣的方向上，孩子能持续学习或练习，很少只有三分钟热度",
      "即使没有成绩、表扬或奖励，孩子仍愿意为喜欢的事情投入很多时间",
      "遇到有难度的题目、训练或项目时，孩子往往比同伴更愿意坚持到底"
    ]
  },
  {
    code: "Z",
    name: "创造",
    fullName: "创造能力",
    questions: [
      "做作业、玩游戏或解决生活问题时，孩子经常提出别人没想到的新办法",
      "写作、画画、搭建或策划活动时，孩子更愿意做自己的版本而不是照搬",
      "使用现有规则、工具或学习方法时，孩子常会主动改一改，让它更好用",
      "孩子能把不同故事、知识和材料组合起来，形成新的作品或看法",
      "孩子的作文、作品或解决问题方式常带有鲜明的个人特点"
    ]
  }
];

function dimensionsForMode(mode) {
  return mode === "child" ? CHILD_DIMENSIONS : DIMENSIONS;
}

const ANSWER_LABELS = {
  1: "完全不符合",
  2: "不太符合",
  3: "一般中立",
  4: "比较符合",
  5: "完全符合"
};

const DIMENSION_INSIGHTS = {
  M: "善于存储和调取细节，知识进入脑海之后不容易轻易散失",
  Y: "擅长从复杂现象中理清关联、判断真伪，并预演事情的后续",
  B: "能够把脑中的东西稳定地变成别人听得懂、接得住的表达",
  G: "对环境、人心和细微变化更敏锐，容易比别人更早察觉信号",
  S: "愿意从现实走向抽象模型，再用模型反过来解释现实",
  C: "不只停留在想法上，能够理解结构、使用工具并把事情做出来",
  K: "会被真正热爱的方向持续牵引，不太依赖外界督促和即时回报",
  Z: "不满足于照搬既有答案，更倾向于重组材料并产生新东西"
};

function levelForTotal(total) {
  if (total >= 20) return "顶级核心天赋";
  if (total >= 15) return "优势可发展能力";
  if (total >= 10) return "普通中等能力";
  return "弱势短板能力";
}

function scoreAssessment(answers) {
  if (!Array.isArray(answers) || answers.length !== 40) {
    throw new Error("需要完成全部 40 道题");
  }
  return DIMENSIONS.map((dimension, dimensionIndex) => {
    const values = answers.slice(dimensionIndex * 5, dimensionIndex * 5 + 5).map(Number);
    if (values.some((value) => !Number.isInteger(value) || value < 1 || value > 5)) {
      throw new Error("每道题都需要选择 1 到 5");
    }
    const total = values.reduce((sum, value) => sum + value, 0);
    return {
      code: dimension.code,
      name: dimension.name,
      fullName: dimension.fullName,
      total,
      radarValue: Math.round(total / 5),
      level: levelForTotal(total)
    };
  });
}

function strongestFirst(scores) {
  return scores
    .map((score, index) => ({ ...score, index }))
    .sort((left, right) => right.total - left.total || left.index - right.index);
}

function combinationInsight(scores, subject) {
  const byCode = Object.fromEntries(scores.map((score) => [score.code, score.total]));
  if (byCode.M >= 15 && byCode.Y >= 15 && byCode.B >= 15) {
    return `${subject}的记忆、推演、表达形成了相互支撑的“三件套”。记得住、想得通、说得明白，通常会让${subject === "你" ? "你" : "孩子"}在标准化学习与知识型任务中更容易获得正反馈。要留心的不是继续把长板刷得更长，而是别让熟悉的评价体系遮住其他能力。`;
  }
  if (byCode.S >= 15 && byCode.C >= 15) {
    return `${subject}同时具备较好的数理与操作倾向：既愿意追问规则，也愿意把规则放进真实世界里试一试。这种“从实到虚、再从虚到实”的闭环，比单纯会算或单纯手快更有价值。`;
  }
  if (byCode.K >= 15 && byCode.Z >= 15) {
    return `${subject}的狂热与创造倾向能够彼此供能。新点子并不稀奇，难的是愿意长期把一个想法磨成真正存在的东西；这组配置值得被保护，但也需要用记忆、推演或操作把热爱接到现实上。`;
  }
  if (byCode.G >= 15 && byCode.B >= 15) {
    return `${subject}既能捕捉人和环境里的细微信号，也有机会把这些感受转译成清晰表达。这样的组合适合需要理解他人、协调观点、讲述复杂经验的场景，但敏锐不等于必须承接所有人的情绪。`;
  }
  const ranked = strongestFirst(scores);
  return `${ranked[0].name}与${ranked[1].name}是这张图上更醒目的组合。单项能力从来不是孤岛：真正值得继续观察的，是它们在学习、工作或日常生活中如何互相补位，而不是急着给人贴一个“聪明”或“不聪明”的标签。`;
}

function buildAnalysis(scores, mode) {
  const subject = mode === "child" ? "孩子" : "你";
  const ranked = strongestFirst(scores);
  const top = ranked.slice(0, 2);
  const low = ranked[ranked.length - 1];
  const balanced = ranked[0].total - low.total <= 3;
  const title = balanced ? "这是一张相对均衡的能力图" : `${top[0].name}与${top[1].name}更值得优先使用`;
  const opening = `先说结论：这张图不是给${subject}定型，而是帮助你看见当前更容易调用的能力。${balanced ? "八个方向之间没有特别陡峭的落差，说明在不同任务里都有可用的抓手。" : `${top[0].fullName}和${top[1].fullName}更突出；${DIMENSION_INSIGHTS[top[0].code]}，同时${DIMENSION_INSIGHTS[top[1].code]}。`}`;
  const combination = combinationInsight(scores, subject);
  const growth = balanced
    ? "均衡不等于每一项都要平均发展。能力要放进具体任务和长期行为里看；先观察哪些能力组合能反复带来成果，再决定值得把时间投向哪里。"
    : `${low.fullName}目前相对不显眼，但“相对较弱”不是缺陷判决。能力要放进具体任务和长期行为里看；与其为了补齐图形而平均用力，不如先让优势进入合适的场景，再观察${low.name}是否真的构成限制。`;
  const note = mode === "child"
    ? "代孩子作答尤其要克制：请依据长期、重复出现的行为，而不是一次考试、一次争执或家长的期待。隔一段时间由孩子自己再测一次，两张图的差异往往比单次结论更有信息。"
    : "自测最容易高估愿望、低估习惯。把结果和过去一年里反复出现的真实行为对照；若两者不一致，行为证据应当优先于这次作答。";
  return { title, paragraphs: [opening, combination, growth, note] };
}

module.exports = {
  ANSWER_LABELS,
  CHILD_DIMENSIONS,
  DIMENSIONS,
  buildAnalysis,
  dimensionsForMode,
  levelForTotal,
  scoreAssessment
};

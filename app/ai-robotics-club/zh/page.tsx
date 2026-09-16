import type { Metadata, ResolvingMetadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ClubFaq,
  ClubHeroFacts,
  ClubMobileApply,
  ClubQuickApplication,
  ClubSectionNavigation,
} from "@/components/ai-robotics-club-experience";
import { resolvePublicPageMetadata } from "@/lib/public-page-metadata";

export function generateMetadata(_props: unknown, parent: ResolvingMetadata): Promise<Metadata> {
  return resolvePublicPageMetadata("/ai-robotics-club/zh", parent);
}

const clubImages = [
  "/assets/talents/club/club-1.png",
  "/assets/talents/club/club-2.png",
  "/assets/talents/club/club-3.png",
  "/assets/talents/club/club-4.png",
  "/assets/talents/club/club-5.png"
];

const coreAbilities = [
  {
    title: "系统思维",
    body: "学生将学会从完整系统角度理解机器人：输入、处理、输出，以及问题可能发生的位置。这训练他们把复杂问题拆解成可管理的模块。"
  },
  {
    title: "数据理解能力",
    body: "通过传感器采样、测试日志和误差分析，学生会理解机器人不是凭感觉行动，而是基于数据做出判断。"
  },
  {
    title: "算法与逻辑思维",
    body: "学生将理解规则如何驱动智能行为，从避障到路径规划、备用流程和自动化决策。"
  },
  {
    title: "工程调试能力",
    body: "机器人项目一定会遇到失败。学生会学习如何定位问题、记录现象、验证假设，并持续改进解决方案。"
  },
  {
    title: "团队协作",
    body: "学生将在机械结构、编程、传感器测试、算法优化、竞赛策略和项目展示等不同角色中协同工作。"
  },
  {
    title: "表达与展示",
    body: "学生将学习如何清晰说明他们解决了什么问题、机器人如何工作、做了哪些测试、哪里失败过，以及系统如何被优化。"
  }
];

const featuredLearningTopics = [
  {
    title: "智能体工作流设计",
    titleZh: "AI 自动化",
    category: "AI 与智能体",
    image: "/assets/talents/club/topics/agentic-workflow-zh.png",
    alt: "AI 智能体工作流界面，包含机器人助手和数字仪表盘",
    intro: "学习现代 AI 系统如何自主规划、推理并完成复杂任务。",
    body:
      "学生将探索先进 AI Agent 如何把目标拆解成更小的步骤、调用工具、获取信息并做出决策，从而完成真实世界中的复杂任务。",
    topics: [
      "任务拆解",
      "规划与推理",
      "工具使用与 API 集成",
      "记忆系统",
      "多步骤自动化",
      "智能体编排",
      "人机协作",
      "多智能体工作流"
    ],
    projects: [
      "AI 研究助手",
      "自动化商业流程",
      "个人效率智能体",
      "AI 客服系统",
      "多智能体协作项目",
      "自主机器人决策系统"
    ],
    outcome:
      "学生将学习前沿 AI 公司用于构建智能系统的核心概念，让系统能够在较少人工监督下完成任务。课程结束时，学生将能够设计并构建可以思考、规划、执行和协作的 AI Agent。"
  },
  {
    title: "人工智能与大语言模型",
    titleZh: "AI 与 LLM",
    category: "AI 基础",
    image: "/assets/talents/club/topics/ai-llm-zh.png",
    alt: "人工智能与大语言模型学习图示",
    intro: "探索 ChatGPT、Claude、Gemini 以及下一代 AI 系统背后的技术。",
    body:
      "学生将深入理解现代 AI 模型如何处理信息、生成回答、解决问题，并在不同行业中辅助人类工作。",
    topics: [
      "大语言模型（LLM）",
      "提示词工程",
      "AI 推理与决策",
      "模型能力与边界",
      "检索增强生成（RAG）",
      "AI 安全与伦理",
      "AI 在各行业的应用",
      "AI 未来趋势"
    ],
    projects: [
      "定制 AI 助手",
      "AI 辅导系统",
      "知识库聊天机器人",
      "研究助手",
      "行业 AI 解决方案",
      "AI 效率工具"
    ],
    outcome: "学生将学习如何作为创造者与 AI 协作，而不仅仅是使用 AI 工具。"
  },
  {
    title: "计算机视觉",
    titleZh: "视觉 AI",
    category: "计算机视觉",
    image: "/assets/talents/club/topics/computer-vision-zh.png",
    alt: "计算机视觉学习图示，包含检测与识别案例",
    intro: "教会计算机和机器人如何看见、理解并与世界互动。",
    body:
      "计算机视觉支撑自动驾驶、安防系统、医学影像、制造机器人以及下一代智能设备。",
    topics: [
      "图像识别",
      "目标检测",
      "人脸识别",
      "人体姿态估计",
      "深度感知",
      "场景理解",
      "跟踪与定位",
      "实时视觉 AI"
    ],
    projects: [
      "智能摄像头系统",
      "人体跟随机器人",
      "身高估算系统",
      "目标追踪应用",
      "AI 安防系统",
      "基于视觉交互的机器人"
    ],
    outcome: "学生将构建能够让机器人感知并理解周围环境的系统。"
  },
  {
    title: "机器人与具身智能",
    titleZh: "具身智能",
    category: "机器人",
    image: "/assets/talents/club/topics/robotics-embodied-ai-zh.png",
    alt: "机器人与具身智能图示，包含传感器、感知、执行器和移动能力",
    intro: "学习智能如何从软件进入真实物理世界。",
    body:
      "学生将直接接触先进机器人系统，理解硬件、软件、AI 和传感器如何协同工作。",
    topics: [
      "机器人架构",
      "传感器与执行器",
      "运动控制",
      "机器人感知",
      "自主行为",
      "人机协作",
      "机器人安全系统",
      "具身智能"
    ],
    projects: [
      "机器狗应用",
      "人形机器人演示",
      "交互式机器人助手",
      "自主任务执行系统",
      "服务机器人项目",
      "智能机器人行为"
    ],
    outcome: "学生将获得研究实验室和工业应用中常用机器人技术的实践经验。"
  },
  {
    title: "自主导航",
    titleZh: "自主移动",
    category: "机器人",
    image: "/assets/talents/club/topics/autonomous-navigation-zh.png",
    alt: "自主导航图示，包含机器人建图、定位与路径规划",
    intro: "探索机器人如何理解环境并独立移动。",
    body:
      "自主导航是自动驾驶车辆、仓储机器人、配送机器人和探索系统背后的核心技术之一。",
    topics: [
      "建图与定位",
      "路径规划",
      "障碍物避让",
      "环境感知",
      "导航算法",
      "基于传感器的运动",
      "路线优化",
      "自主探索"
    ],
    projects: [
      "自动驾驶机器人挑战",
      "室内导航系统",
      "建图竞赛",
      "探索任务",
      "自主配送模拟",
      "智能运动规划"
    ],
    outcome: "学生将学习机器在真实世界中移动时如何做出决策。"
  },
  {
    title: "多智能体系统与协作机器人",
    titleZh: "协作智能",
    category: "多智能体系统",
    image: "/assets/talents/club/topics/multi-agent-systems-zh.png",
    alt: "多智能体系统图示，展示协作 AI Agent 的协调方式",
    intro: "学习多个机器人和 AI 系统如何协同解决单个系统无法完成的大型问题。",
    body: "学生将探索分布式智能和协作自动化的未来。",
    topics: [
      "智能体通信",
      "团队协调",
      "分布式智能",
      "共享决策",
      "资源分配",
      "协作规划",
      "群体智能概念",
      "协作机器人"
    ],
    projects: [
      "多机器人竞赛",
      "搜索与救援模拟",
      "协作仓储系统",
      "自主配送网络",
      "AI 团队协调系统",
      "分布式机器人实验"
    ],
    outcome: "学生将理解未来智能系统如何在更大规模上协调与协作。"
  },
  {
    title: "产品开发与创业",
    titleZh: "创业构建",
    category: "创业与产品",
    image: "/assets/talents/club/topics/product-development-entrepreneurship-zh.png",
    alt: "产品开发与创业流程图，从想法到发布",
    intro: "学习想法如何成长为成功的产品、创业项目和科技公司。",
    body: "学生将培养创业者思维，理解创新如何创造真实世界的影响力。",
    topics: [
      "产品设计",
      "用户发现",
      "市场验证",
      "商业模式",
      "创业策略",
      "产品管理",
      "技术商业化",
      "创新框架"
    ],
    projects: [
      "AI 创业概念",
      "产品原型",
      "投资人路演展示",
      "市场研究项目",
      "科技商业计划",
      "创新竞赛"
    ],
    outcome: "学生将学习像创始人、创新者和未来行业领导者一样思考。"
  },
  {
    title: "硬件工程、CAD 与 3D 打印",
    titleZh: "创客工程",
    category: "硬件与创客",
    image: "/assets/talents/club/topics/hardware-cad-3d-printing-zh.png",
    alt: "硬件工程、CAD 设计、3D 打印、电子模块与机械零件图示",
    intro: "把数字想法转化为真实的物理发明。",
    body: "学生将设计、原型制作并制造定制硬件和机器人组件。",
    topics: [
      "电子基础",
      "传感器与电路",
      "嵌入式系统",
      "CAD 设计",
      "机械工程基础",
      "快速原型",
      "3D 打印技术",
      "硬件集成"
    ],
    projects: [
      "定制机器人配件",
      "传感器模块",
      "机器人附件",
      "机械原型",
      "功能性硬件系统",
      "产品开发原型"
    ],
    outcome: "学生将学习工程想法如何变成真实世界中的产品。"
  },
  {
    title: "科研、创新与科学发现",
    titleZh: "科学发现",
    category: "科研",
    image: "/assets/talents/club/topics/research-innovation-zh.png",
    alt: "科研、创新与科学发现图示，包含实验室机器人与数据分析",
    intro: "培养科学家、研究者和发明家使用的思维方式与方法论。",
    body: "学生将学习突破性技术如何被创造、测试和不断改进。",
    topics: [
      "研究方法",
      "实验设计",
      "假设检验",
      "数据分析",
      "技术文档",
      "文献阅读",
      "创新流程",
      "科学沟通"
    ],
    projects: [
      "独立研究项目",
      "技术调研",
      "科学实验",
      "研究论文",
      "竞赛提交材料",
      "创新展示项目"
    ],
    outcome: "学生将建立批判性思维能力，并学习如何产生新的知识。"
  },
  {
    title: "人形机器人与运动控制",
    titleZh: "运动控制",
    category: "人形机器人",
    image: "/assets/talents/club/topics/humanoid-robotics-motion-control-zh.png",
    alt: "人形机器人与运动控制图示，包含行走、平衡、手势和姿态控制",
    intro: "学习人形机器人如何站立、行走、保持平衡、做出手势并与物理世界互动。",
    body:
      "学生将探索让人形机器人实现类人运动的关键技术，包括稳定性、协调性和控制系统。",
    topics: [
      "机器人运动学",
      "关节控制系统",
      "平衡与稳定",
      "行走与移动",
      "运动规划",
      "全身协调",
      "姿态生成与控制",
      "人体动作模仿"
    ],
    projects: [
      "人形机器人行走演示",
      "手势与交互系统",
      "平衡恢复挑战",
      "动作序列编程",
      "人体姿态模仿系统",
      "自主运动流程"
    ],
    outcome:
      "学生将获得下一代人形机器人所需的软件与控制系统实践经验。通过理解机器人如何运动、平衡并协调复杂动作，学生将掌握与现代机器人研究和工业应用直接相关的技能。"
  },
  {
    title: "领导力、竞赛与作品集发展",
    titleZh: "作品集发展",
    category: "领导力",
    image: "/assets/talents/club/topics/leadership-portfolio-zh.png",
    alt: "领导力、竞赛与作品集发展图示，包含奖杯和作品集仪表盘",
    intro: "在科技领域取得成功，不只需要技术能力。",
    body: "学生将学习如何表达想法、带领团队，并展示自己的成果。",
    topics: [
      "领导力发展",
      "公众演讲",
      "技术展示",
      "团队管理",
      "竞赛策略",
      "项目文档",
      "个人品牌",
      "作品集创建"
    ],
    projects: [
      "竞赛参与",
      "团队领导角色",
      "公开演示",
      "项目展示",
      "技术演讲",
      "作品集网站开发"
    ],
    outcome: "每位学生都将带着一个作品集毕业，用来展示技术能力、领导经验、创新项目和真实世界成果。"
  }
];

function TopicList({
  title,
  items,
  variant,
  mobileLead,
  mobileFooter,
}: {
  title: string;
  items: readonly string[];
  variant: "topics" | "projects";
  mobileLead?: string;
  mobileFooter?: string;
}) {
  const renderItems = () => (
    <div className="topic-list-grid mt-3 grid gap-2 sm:grid-cols-2">
      {items.map((item) => (
        <div
          key={item}
          data-topic-list-item={variant}
          className="topic-list-item rounded-2xl border px-4 py-3 text-sm font-semibold leading-6"
        >
          {item}
        </div>
      ))}
    </div>
  );

  return (
    <div data-topic-list={variant} className="topic-list-group">
      <div data-club-desktop-topic-details>
        <div className="topic-list-heading flex items-center justify-between gap-3">
          <p className="topic-list-label text-xs font-bold uppercase tracking-[0.2em]">{title}</p>
          <span className="topic-list-kicker" aria-hidden="true">
            {variant === "topics" ? "Learn" : "Build"}
          </span>
        </div>
        {renderItems()}
      </div>
      <details data-club-mobile-topic-details>
        <summary className="topic-list-heading flex cursor-pointer list-none items-center justify-between gap-3 marker:hidden">
          <span className="topic-list-label text-xs font-bold uppercase tracking-[0.2em]">{title}</span>
          <span className="topic-list-kicker" aria-hidden="true">
            {variant === "topics" ? "学习 +" : "实践 +"}
          </span>
        </summary>
        {mobileLead ? <p className="mt-3 text-sm leading-6">{mobileLead}</p> : null}
        {renderItems()}
        {mobileFooter ? <p className="topic-outcome-accent mt-4 text-sm leading-6">{mobileFooter}</p> : null}
      </details>
    </div>
  );
}

const projectOutputs = [
  "工程笔记",
  "技术海报",
  "演示视频",
  "测试日志",
  "竞赛策略计划",
  "项目展示材料"
];

export default function AiRoboticsClubChinesePage() {
  return (
    <section
      data-club-page-theme="warm-off-white"
      className="min-h-screen bg-[#f5f4f1] px-6 py-16 text-[#0b1220] lg:px-8 lg:py-20"
    >
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/talents"
            className="talent-back-button inline-flex rounded-full border px-5 py-2.5 text-sm font-semibold transition"
          >
            返回 Agentech Talents
          </Link>
          <div data-club-surface data-club-language-switch className="inline-flex rounded-full border border-[#d9e1ea] bg-white p-1 text-sm font-bold shadow-[0_10px_28px_rgba(15,23,42,0.06)]">
            <Link href="/ai-robotics-club" className="rounded-full px-4 py-2 !text-[#0b1220] transition hover:bg-[#f1f5f9]">
              English
            </Link>
            <Link data-club-language-active href="/ai-robotics-club/zh" className="rounded-full bg-[#0b1220] px-4 py-2 text-white">
              中文
            </Link>
          </div>
        </div>

        <ClubSectionNavigation locale="zh" />
        <ClubMobileApply locale="zh" />

        <div className="mt-14 grid items-start gap-10 lg:grid-cols-[1fr_390px]">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.24em] !text-[#334155]">AI Robotics Club</p>
            <h1 className="font-display mt-5 max-w-5xl text-4xl font-semibold tracking-[0.04em] !text-black md:text-6xl">
              机器人竞赛与工程会员项目
            </h1>
            <p className="mt-6 max-w-3xl text-xl font-semibold leading-8 !text-[#111827]">
              加入真正的 AI 机器人工程团队。
            </p>
            <p className="mt-4 max-w-4xl text-base leading-8 !text-[#334155] md:text-lg">
              从机器人搭建到算法、测试和竞赛，学生将学习真实机器人如何工作。这不只是机器人兴趣课，而是一套长期工程训练项目。
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link data-club-primary-action href="#quick-apply" className="inline-flex rounded-full bg-[#111111] px-6 py-3 text-sm font-bold text-white transition hover:bg-[#33312d]">
                立即申请
              </Link>
              <Link data-club-secondary-action href="#program-details" className="inline-flex rounded-full border border-[#111111] bg-[#fbfaf7] px-6 py-3 text-sm font-bold !text-[#111111] transition hover:bg-[#111111] hover:!text-white">
                查看项目详情
              </Link>
            </div>
            <ClubHeroFacts locale="zh" />
          </div>

          <ClubQuickApplication locale="zh" />
        </div>

        <div data-club-hero-media className="mt-14 bg-[#f5f4f1]">
          <Image
            data-club-image-blend="hero"
            data-club-image-blend-shape="rectangular"
            src={clubImages[0]}
            alt="AI Robotics Club 项目预览"
            width={1800}
            height={1100}
            priority
            className="club-hero-image block h-auto w-full object-cover"
          />
        </div>

        <section id="program-details" className="mt-16 scroll-mt-32 grid gap-10 lg:grid-cols-[0.82fr_1.18fr]">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.24em] !text-[#475569]">项目介绍</p>
            <h2 className="font-display mt-4 text-3xl font-semibold tracking-tight !text-black md:text-5xl">
              学生将理解机器人为什么能工作、为什么会失败，以及如何持续改进。
            </h2>
          </div>
          <div className="space-y-6 text-base leading-8 !text-[#334155]">
            <p>
              很多机器人课程只是让学生照着说明搭建。在 AI Robotics Club，我们希望学生真正理解机器人如何感知环境、传感器数据代表什么、算法如何做出决策、机器人为什么会失败，以及测试和调试如何带来改进。
            </p>
            <p>
              每周学生都会围绕真实工程挑战推进学习。从基础机器人搭建开始，逐步进入传感器采样、自主避障、路径规划、算法测试、竞赛策略和项目展示。
            </p>
            <p className="font-semibold !text-[#0b1220]">
              项目结束时，学生不仅会完成机器人作品，更会建立可迁移的工程思维和长期问题解决能力。
            </p>
          </div>
        </section>

        <section id="skills" className="mt-16 scroll-mt-32 rounded-[30px] bg-[#0b1220] p-8 text-white md:p-10">
          <div className="grid gap-8 lg:grid-cols-[0.95fr_1.05fr]">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.24em] !text-[#cbd5e1]">学生成长与能力发展</p>
              <h2 className="font-display mt-4 text-3xl font-semibold tracking-tight !text-white md:text-5xl">
                学生将发展的六项核心能力。
              </h2>
              <p className="mt-5 text-base leading-8 !text-[#dbe4ef]">
                用机器人培养系统思维、数据素养与工程创造力。
              </p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {coreAbilities.map((ability) => (
                <article key={ability.title} className="rounded-2xl border border-white/10 bg-white/[0.06] p-4">
                  <h3 className="font-semibold !text-white">{ability.title}</h3>
                  <p className="mt-2 text-sm leading-6 !text-[#dbe4ef]">{ability.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="curriculum" className="mt-24 scroll-mt-32 md:mt-32">
          <div className="mx-auto max-w-4xl text-center">
            <p className="text-sm font-bold uppercase tracking-[0.24em] !text-[#475569]">核心学习主题</p>
            <h2 className="font-display mt-4 text-3xl font-semibold tracking-tight !text-black md:text-5xl">
              学生能够理解、构建并展示的 AI 能力。
            </h2>
          </div>

          <div className="mt-14 space-y-20 md:mt-20 md:space-y-28">
            {featuredLearningTopics.map((topic, index) => (
              <article
                key={topic.title}
                data-club-surface
                data-club-topic-layout="desktop-fit"
                className="topic-feature-row grid overflow-hidden rounded-[30px] border border-[#d9e1ea] bg-white shadow-[0_26px_70px_rgba(15,23,42,0.09)] lg:grid-cols-[1.05fr_0.95fr]"
              >
                <div
                  data-club-topic-image-stage="seamless"
                  className={`topic-image-panel relative isolate flex min-h-[360px] items-center justify-center overflow-hidden bg-[#020617] sm:min-h-[460px] lg:min-h-full ${index % 2 === 1 ? "lg:order-2" : ""}`}
                >
                  <Image
                    data-club-image-layer="backdrop"
                    src={topic.image}
                    alt=""
                    aria-hidden="true"
                    fill
                    sizes="(min-width: 1024px) 48vw, 100vw"
                    className="topic-image-backdrop pointer-events-none object-cover"
                  />
                  <Image
                    data-club-image-layer="foreground"
                    data-club-image-blend="topic"
                    data-club-image-blend-shape="rectangular"
                    src={topic.image}
                    alt={topic.alt}
                    width={1200}
                    height={1200}
                    sizes="(min-width: 1024px) 48vw, 100vw"
                    className="topic-image relative z-10 h-auto max-h-[760px] w-full object-contain"
                  />
                </div>
                <div className={`topic-feature-content flex flex-col justify-center p-7 md:p-10 ${index % 2 === 1 ? "lg:order-1" : ""}`}>
                  <p className="text-xs font-bold uppercase tracking-[0.22em] !text-[#475569]">{topic.category}</p>
                  <h3 className="font-display topic-feature-title mt-3 text-3xl font-semibold tracking-tight !text-black md:text-4xl">
                    {topic.title}
                  </h3>
                  <p className="topic-feature-subtitle mt-2 text-lg font-semibold !text-[#334155]">{topic.titleZh}</p>
                  <p className="topic-feature-intro mt-5 text-xl font-semibold leading-8 !text-[#0b1220]">{topic.intro}</p>
                  <p data-club-desktop-topic-details className="topic-feature-copy mt-4 text-base leading-8 !text-[#334155]">{topic.body}</p>
                  <div className="topic-list-stack mt-6 space-y-6">
                    <TopicList title="学习内容" items={topic.topics} variant="topics" mobileLead={topic.body} />
                    <TopicList title="项目实践" items={topic.projects} variant="projects" mobileFooter={topic.outcome} />
                  </div>
                  <p
                    data-club-desktop-topic-details
                    data-topic-outcome-accent="blue-gold"
                    className="topic-feature-outcome topic-outcome-accent mt-6 text-base leading-8 !text-[#334155]"
                  >
                    {topic.outcome}
                  </p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <ClubFaq locale="zh" />

        <section className="mt-14 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
          <div data-club-surface className="rounded-[28px] border border-[#d9e1ea] bg-white p-8 shadow-[0_14px_34px_rgba(15,23,42,0.06)]">
            <p className="text-sm font-bold uppercase tracking-[0.24em] !text-[#475569]">工程文档</p>
            <h2 className="font-display mt-4 text-3xl font-semibold tracking-tight !text-black">项目会成为可展示的作品集成果。</h2>
            <p className="mt-5 text-base leading-8 !text-[#334155]">
              学生将持续记录设计、测试结果、失败原因、改进方案和数据分析。最终成果可以用于竞赛、面试、科学展示和未来学术机会。
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {projectOutputs.map((item) => (
              <div data-club-surface key={item} className="rounded-2xl border border-[#d9e1ea] bg-[#f8fafc] px-5 py-4 text-sm font-bold !text-[#0b1220]">
                {item}
              </div>
            ))}
          </div>
        </section>

        <section data-club-surface className="mt-14 rounded-[30px] border border-[#d9e1ea] bg-white p-8 shadow-[0_20px_55px_rgba(15,23,42,0.08)] md:p-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.24em] !text-[#475569]">行动召唤</p>
              <h2 className="font-display mt-4 text-3xl font-semibold tracking-tight !text-black md:text-4xl">
                帮助孩子用 AI 建设未来。
              </h2>
              <p className="mt-5 max-w-3xl text-base leading-8 !text-[#334155]">
                学生每周推进真实工程挑战，完成阶段性成果，并逐步建立可以展示、升级和用于竞赛准备的机器人项目。
              </p>
            </div>
            <div className="flex items-center lg:justify-end">
              <Link
                data-club-secondary-action
                href="/ai-robotics-club/apply"
                className="inline-flex w-full justify-center rounded-full border border-[#0b1220] bg-white px-8 py-4 text-base font-bold !text-black transition hover:bg-black hover:!text-white lg:w-auto"
              >
                立即申请
              </Link>
            </div>
          </div>
        </section>
      </div>
    </section>
  );
}

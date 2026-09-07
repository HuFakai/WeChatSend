import '../src/load-env';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const variations = {
  activity: [
    '想和你分享一个近期比较适合入手的活动', '我们最近整理了一份活动方案，第一时间想到你', '这周有一项针对老客户的专属活动', '如果你最近正好有相关计划，可以看看这次活动', '我们把活动规则和服务内容重新梳理了一遍',
    '近期有一项新活动上线，想先给你留个信息', '这次活动更适合有明确需求的朋友，我先发你了解', '我们准备了一个轻量的体验活动，时间安排比较灵活', '如果你对这类产品感兴趣，这次活动可能会有帮助', '活动名额和时间有限，我先把重点信息发给你',
  ],
  holiday: [
    '节日快到了，提前向你问候一声', '借着节日的机会，感谢你一直以来的信任', '新的一年到了，愿你工作顺利、生活如意', '节日临近，愿你和家人平安喜乐', '天气渐渐变化，也别忘了照顾好自己',
    '很久没有联系了，趁节日向你送上一份问候', '愿这个节日给你带来轻松和好心情', '感谢你过去一年的支持，祝你节日愉快', '节日不只是提醒，也是我们保持联系的理由', '祝你假期安排顺利，和家人度过一段舒服的时光',
  ],
  price: [
    '近期产品价格和活动政策有调整，我把重点整理给你', '你之前关注的方案最近有新的优惠空间', '我们正在做一轮阶段性价格调整，想提前通知你', '如果你还在比较方案，现在可以重新看一下最新政策', '之前给你的报价有新的变化，我建议你以这版信息为准',
    '最近有一项更适合预算安排的方案上线', '如果你的计划还没有确定，这次价格调整可以作为参考', '我们把优惠条件和服务范围重新确认过了', '本次调整主要针对近期有计划的客户，先发你了解', '你关心的产品近期有价格活动，我把简要信息发给你',
  ],
} as const;

const industries = [
  { category: '通用销售', focus: '产品和客户方案' },
  { category: '零售门店', focus: '到店体验和门店活动' },
  { category: '家居建材', focus: '装修方案和到店量房' },
  { category: '汽车销售与售后', focus: '购车、保养和售后服务' },
] as const;

const scenarios = [
  { key: 'activity', label: '产品活动通知' },
  { key: 'holiday', label: '节日问候' },
  { key: 'price', label: '降价通知' },
] as const;

async function main() {
  let created = 0;
  for (const industry of industries) {
    for (const scenario of scenarios) {
      for (let index = 0; index < 10; index += 1) {
        const title = `${industry.category} · ${scenario.label} · ${String(index + 1).padStart(2, '0')}`;
        const line = variations[scenario.key][index];
        const content = `{{friend_name}}，${line}。本次内容围绕${industry.focus}展开，具体安排可以按你的实际情况确认。${scenario.key === 'holiday' ? '愿你一切顺意。' : '如果你愿意，我可以把详细信息发给你。'}`;
        const existing = await prisma.messageTemplate.findFirst({ where: { scope: 'PLATFORM', title } });
        if (!existing) { await prisma.messageTemplate.create({ data: { scope: 'PLATFORM', title, content, category: industry.category, isActive: true } }); created += 1; }
      }
    }
  }
  console.log(`行业模板种子完成：新增 ${created} 条，目标总量 ${industries.length * scenarios.length * 10} 条`);
}

void main().finally(() => prisma.$disconnect());

import { Body, Controller, NotFoundException, Post } from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from './prisma.service';
import { ZodPipe } from './zod.pipe';

const feedbackSchema = z.object({
  task_id: z.string().uuid(),
  status: z.enum(['success', 'failed']).default('success'),
  error: z.string().trim().max(500).optional(),
});

@Controller('feedback')
export class FeedbackController {
  constructor(private readonly prisma: PrismaService) {}

  @Post()
  async receive(@Body(new ZodPipe(feedbackSchema)) body: z.infer<typeof feedbackSchema>) {
    return this.prisma.resilient(async () => {
      const message = await this.prisma.taskMessage.findUnique({
        where: { messageId: body.task_id },
        select: { id: true, feedbackStatus: true, feedbackReceivedAt: true },
      });
      if (!message) throw new NotFoundException('反馈任务不存在');

      const receivedAt = new Date();
      const status = body.status === 'success' ? 'SUCCESS' : 'FAILED';
      const result = await this.prisma.taskMessage.updateMany({
        where: { id: message.id, feedbackReceivedAt: null },
        data: {
          feedbackStatus: status,
          feedbackReceivedAt: receivedAt,
          feedbackError: status === 'FAILED' ? body.error || '快捷指令报告发送失败' : null,
        },
      });

      const current = result.count
        ? { feedbackStatus: status, feedbackReceivedAt: receivedAt }
        : message;
      return {
        ok: true,
        duplicate: result.count === 0,
        task_id: body.task_id,
        status: current.feedbackStatus?.toLowerCase(),
        received_at: current.feedbackReceivedAt?.toISOString(),
      };
    });
  }
}

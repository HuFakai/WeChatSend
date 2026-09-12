import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AuthGuard, type AuthRequest } from './auth';
import {
  createTaskSchema,
  previewTaskSchema,
  resendSchema,
  taskListQuerySchema,
  TasksService,
} from './tasks';
import { ZodPipe } from './zod.pipe';

@Controller('tasks')
@UseGuards(AuthGuard)
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  @Get()
  list(@Req() request: AuthRequest) {
    return this.tasks.list(request.user.id);
  }

  @Get('page')
  listPage(
    @Req() request: AuthRequest,
    @Query(new ZodPipe(taskListQuerySchema)) query: z.infer<typeof taskListQuerySchema>,
  ) {
    return this.tasks.listPage(request.user.id, query);
  }

  @Get('summary')
  summary(@Req() request: AuthRequest) {
    return this.tasks.summary(request.user.id);
  }

  @Get(':id')
  detail(@Req() request: AuthRequest, @Param('id') id: string) {
    return this.tasks.detail(request.user.id, id);
  }

  @Post('preview')
  preview(
    @Req() request: AuthRequest,
    @Body(new ZodPipe(previewTaskSchema)) body: z.infer<typeof previewTaskSchema>,
  ) {
    return this.tasks.preview(request.user.id, body);
  }

  @Post()
  create(
    @Req() request: AuthRequest,
    @Body(new ZodPipe(createTaskSchema)) body: z.infer<typeof createTaskSchema>,
  ) {
    return this.tasks.create(request.user.id, body);
  }

  @Post(':id/copy')
  copy(@Req() request: AuthRequest, @Param('id') id: string) {
    return this.tasks.copy(request.user.id, id);
  }

  @Post(':id/cancel')
  cancel(@Req() request: AuthRequest, @Param('id') id: string) {
    return this.tasks.cancel(request.user.id, id);
  }

  @Post(':id/messages/:messageId/resend')
  resend(
    @Req() request: AuthRequest,
    @Param('id') taskId: string,
    @Param('messageId') messageId: string,
    @Body(new ZodPipe(resendSchema)) body: z.infer<typeof resendSchema>,
  ) {
    return this.tasks.resend(request.user.id, taskId, messageId, body);
  }
}

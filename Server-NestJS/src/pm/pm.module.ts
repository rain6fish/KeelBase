import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PmController } from './pm.controller';
import { PmService } from './pm.service';
import { PmProject } from './pm-project.entity';
import { PmMember } from './pm-member.entity';
import { PmMilestone } from './pm-milestone.entity';
import { PmTask } from './pm-task.entity';
import { PmRisk } from './pm-risk.entity';

/** AI Project Management 旗舰应用模块（业务样例，capabilities 可开关） */
@Module({
  imports: [
    TypeOrmModule.forFeature([PmProject, PmMember, PmMilestone, PmTask, PmRisk]),
  ],
  controllers: [PmController],
  providers: [PmService],
  exports: [PmService],
})
export class PmModule {}

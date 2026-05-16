import { Module } from '@nestjs/common';
import { SupabaseStorageModule } from '../../common/supabase/supabase-storage.module';
import { TripoHttpService } from './tripo-http.service';
import { TripoStsUploadService } from './tripo-sts-upload.service';
import { TripoMultiviewPipelineService } from './tripo-multiview-pipeline.service';

@Module({
  imports: [SupabaseStorageModule],
  providers: [TripoHttpService, TripoStsUploadService, TripoMultiviewPipelineService],
  exports: [TripoHttpService, TripoStsUploadService, TripoMultiviewPipelineService],
})
export class Tripo3dModule {}

import { Module } from '@nestjs/common';
import { SupabaseStorageModule } from '../../common/supabase/supabase-storage.module';
import { TripoHttpService } from './tripo-http.service';
import { TripoStsUploadService } from './tripo-sts-upload.service';
import { TripoMultiviewPipelineService } from './tripo-multiview-pipeline.service';
import { GlbPivotNormalizerService } from './glb-pivot-normalizer.service';

@Module({
  imports: [SupabaseStorageModule],
  providers: [
    TripoHttpService,
    TripoStsUploadService,
    TripoMultiviewPipelineService,
    GlbPivotNormalizerService,
  ],
  exports: [
    TripoHttpService,
    TripoStsUploadService,
    TripoMultiviewPipelineService,
    GlbPivotNormalizerService,
  ],
})
export class Tripo3dModule {}

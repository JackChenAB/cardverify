import { Global, Module } from '@nestjs/common';
import { CryptoService } from './crypto.service';
import { SignatureGuard } from './signature.guard';
import { ResponseSignInterceptor } from './response-sign.interceptor';

@Global()
@Module({
  providers: [CryptoService, SignatureGuard, ResponseSignInterceptor],
  exports: [CryptoService, SignatureGuard, ResponseSignInterceptor],
})
export class CryptoModule {}

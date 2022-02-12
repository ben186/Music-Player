import { CacheInterceptor, CacheModule, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import process from 'process';
import { AppController } from './app.controller';
import { AppService } from './app.service';

@Module({
    imports: [
        CacheModule.register(),
        ServeStaticModule.forRoot({
            rootPath: join(process.cwd(), 'yt-music-client'),
            exclude: ['/api*']
        }),
    ],
    controllers: [AppController],
    providers: [
        AppService,
        {
            provide: APP_INTERCEPTOR,
            useClass: CacheInterceptor,
        },
    ],
})
export class AppModule {}

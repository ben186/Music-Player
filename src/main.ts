import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from './app.module';
import fs from 'fs';

// Cache only works in GET and using @Res() is not allowed
const httpsOptions = {
    key: fs.readFileSync('./secrets/private.key'),
    cert: fs.readFileSync('./secrets/certificate.crt'),
};
async function bootstrap() {
    const app = await NestFactory.create<NestFastifyApplication>(
        AppModule, 
        new FastifyAdapter({ https: httpsOptions })
    );
    
    // May need to remove later
    // app.enableCors({
    //     allowedHeaders: 'Range',
    //     exposedHeaders: ['Accept-Ranges', 'Content-Type', 'Content-Length', 'Content-Range']
    // });

    app.setGlobalPrefix('/api');
    app.useGlobalPipes(new ValidationPipe());
    await app.listen(8080, '0.0.0.0');
}
bootstrap();

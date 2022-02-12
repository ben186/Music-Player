import {
    CacheInterceptor,
    Controller,
    Get,
    Head,
    Header,
    Headers,
    HttpCode,
    HttpException,
    HttpStatus,
    Query,
    Render,
    Req,
    Res,
    Response,
    UseInterceptors,
} from '@nestjs/common';
import { AppService } from './app.service';

import fs from 'fs';
import ffmpeg from 'ffmpeg';
import { promises as fsp } from 'fs';
import { StreamQuery } from './dto/stream-query.dto';
import ytdl from 'ytdl-core';
import yts from 'yt-search';
import { FastifyReply } from '@nestjs/platform-fastify/node_modules/fastify';

@Controller()
export class AppController {
    private currentJobs: Set<string> = new Set();

    constructor(private readonly appService: AppService) {}

    parseRange(range: string): { start?: number; end?: number } {
        const bytesPrefix = 'bytes=';
        let result: { start?: number; end?: number } = {
            start: undefined,
            end: undefined,
        };

        if (range === undefined) {
            return result;
        }

        if (range.startsWith(bytesPrefix)) {
            const bytesRange = range.substring(bytesPrefix.length);
            const parts = bytesRange.split('-');

            if (parts.length === 2) {
                const rangeStart = parts[0] && parts[0].trim();
                if (rangeStart && rangeStart.length > 0) {
                    result.start = parseInt(rangeStart);
                }
                const rangeEnd = parts[1] && parts[1].trim();
                if (rangeEnd && rangeEnd.length > 0) {
                    result.end = parseInt(rangeEnd);
                }

                return result;
            }
        }

        return result;
    }

    // TODO: Add time limit
    downloadFromYt(audioPath: string, id: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const tempFilePath = './audio/' + id + '.temp';

            ytdl('https://www.youtube.com/watch?v=' + id)
                .pipe(fs.createWriteStream(tempFilePath, { flags: 'w' }))
                .on('error', (err) => reject(err))
                .on('close', async () => {
                    try {
                        let video = await new ffmpeg(tempFilePath);
                        video = video.setAudioCodec('mp3');
                        await video.save(audioPath);
                        await fsp.unlink(tempFilePath);
                        resolve();
                    } catch (err) {
                        reject(err);
                    }
                });
        });
    }

    @Get('search')
    async searchAudio(@Query('query') query: string) {
        if (query === undefined) {
            throw new HttpException('Invalid search', HttpStatus.BAD_REQUEST);
        }

        const results = await yts.search(query);
        let videoResults = results.all.filter(result => result.type === 'video');

        videoResults.forEach(videoResult => {
            const regexResult = new RegExp(/(.*?)(^|\/|v=)([a-z0-9_-]{11})(.*)?/gim);
            const results = regexResult.exec(videoResult.url);

            if (results === null || results === undefined) {
                throw new HttpException('Internal Server Error', HttpStatus.INTERNAL_SERVER_ERROR);
            }

            videoResult.url = results[3];
        });
        
        return videoResults.map(result => {return { title: result.title, thumbnail: result.thumbnail, id: result.url }});
    }

    @Get('/stream')
    async streamAudio(@Query() query: StreamQuery, @Headers('Range') rangeHeader: string, @Res() response: FastifyReply) {
        const audioPath = './audio/' + query.id + '.mp3';
        if (!fs.existsSync(audioPath) && !this.currentJobs.has(query.id)) {
            try {
                this.currentJobs.add(query.id);
                await this.downloadFromYt(audioPath, query.id);
            } catch (error) {
                console.error(error);
                throw new HttpException(error, HttpStatus.INTERNAL_SERVER_ERROR);
            } finally {
                this.currentJobs.delete(query.id);
            }
        }

        const fileInfo = await fsp.stat(audioPath);
        const fileSize = fileInfo.size.toString();

        const range = this.parseRange(rangeHeader);

        // Check if request full size of partial
        response.code(range.start !== undefined || range.end !== undefined ? 206 : 200);

        // Set default value
        // TODO: case for -500 which is last 500 bytes
        range.start = range.start ?? 0;
        range.end = range.end ?? parseInt(fileSize) - 1;
        const rangeSize = range.end - range.start + 1;

        response.header('Content-Type', 'audio/mp3');
        response.header('Content-Length', rangeSize.toString());
        response.header('Content-Range', 'bytes ' + range.start + '-' + range.end + '/' + fileSize);
        response.header('Accept-Ranges', 'bytes');

        const stream = fs.createReadStream(audioPath, {
            start: range.start,
            end: range.end,
        });

        stream.on('error', (error) => {
            throw new HttpException(error, HttpStatus.INTERNAL_SERVER_ERROR);
        });

        response.send(stream);
    }
}

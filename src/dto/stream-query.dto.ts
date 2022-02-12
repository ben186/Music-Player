import { IsNotEmpty } from 'class-validator';

export class StreamQuery {
    @IsNotEmpty()
    id: string;
}

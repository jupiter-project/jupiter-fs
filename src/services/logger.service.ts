import { Logger as TsLogger } from 'tslog';
import { ApiConfig } from '../api.config';

export class Logger extends TsLogger {
    constructor(options: object) {
        super(options);
    }
}

export const logger = new Logger({
    name: 'JIM',
    prefix: [],
    minLevel: ApiConfig.loggerLevel
});

import { ErrorCode } from '../enums/error-code.enum';

export class CustomError extends Error {
    message: string;
    code: number;

    private constructor(message: string, code: ErrorCode) {
        super();

        this.message = message;
        this.code = code;
    }

    static create(message: string, code: ErrorCode = ErrorCode.GENERAL): CustomError {
        return new CustomError(message, code);
    }
}

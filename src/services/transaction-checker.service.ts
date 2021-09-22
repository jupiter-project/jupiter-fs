import { Inject } from 'typescript-ioc';
import { Logger } from './logger.service';
import assert from 'assert';
import { CustomError } from '../utils/custom.error';
import { ErrorCode } from '../enums/error-code.enum';
import { Transaction } from '../interfaces/transaction';
import axios from 'axios';
import { ApiConfig } from '../api.config';
import { sleep } from '../utils/utils';


/**
 *
 */
export class TransactionChecker {
    private logger: Logger;

    /**
     *
     * @param logger
     */
    constructor(@Inject logger: Logger) {
        this.logger = logger;
    }

    /**
     *
     * @param transactionId
     * @param totalAllowedBackoffTries
     * @param backoffAttempt
     */
    async waitForConfirmation(transactionId: string, totalAllowedBackoffTries = 10, backoffAttempt = 1): Promise<Transaction> {
        assert(transactionId, CustomError.create('Transaction ID is required and must be a string', ErrorCode.INTERNAL_ERROR));
        assert(backoffAttempt <= totalAllowedBackoffTries, CustomError.create('Cannot confirm the transaction', ErrorCode.INTERNAL_ERROR));

        const backoffSecondsToWait = 2 + Math.pow(backoffAttempt, 2);
        this.logger.silly(`Waiting ${backoffSecondsToWait} seconds for confirming the transaction ${transactionId}`);
        await sleep(backoffSecondsToWait * 1000);

        const params = {requestType: 'getTransaction', transaction: transactionId};
        const res = await axios.get<Transaction>(`${ApiConfig.mainAccount.server}/nxt`, {params});

        return res.data.confirmations === undefined ?
            this.waitForConfirmation(transactionId, totalAllowedBackoffTries, backoffAttempt + 1) :
            res.data;
    }
}

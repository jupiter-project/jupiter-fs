export interface Transaction {
    signature: string;
    transactionIndex: number;
    type: number;
    phased: boolean;
    ecBlockId: string;
    signatureHash: string;
    attachment: unknown;
    senderRS: string;
    subtype: number;
    amountNQT: string;
    recipientRS: string;
    block: string;
    blockTimestamp: number;
    deadline: number;
    timestamp: number;
    height: number;
    senderPublicKey: string;
    feeNQT: string;
    requestProcessingTime: number;
    confirmations: number;
    fullHash: string;
    version: number;
    sender: string;
    recipient: string;
    ecBlockHeight: number;
    transaction: string;
}

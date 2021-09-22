import { ApiConfig } from '../api.config';

export function calculateMessageFee(encryptedMessageLength: number): number {
    let fee = ApiConfig.baseFEE;
    if (!encryptedMessageLength)
        return fee
    if (encryptedMessageLength <= 5000) {
        fee = 800000
    }
    else if (encryptedMessageLength <= 10000) {
        fee = 1600000
    }
    else if (encryptedMessageLength <= 15000) {
        fee = 2300000
    }
    else if (encryptedMessageLength <= 20000) {
        fee = 3100000
    }
    else if (encryptedMessageLength <= 25000) {
        fee = 3900000
    }
    else if (encryptedMessageLength <= 30000) {
        fee = 4700000
    }
    else if (encryptedMessageLength <= 35000) {
        fee = 5500000
    }
    else if (encryptedMessageLength <= 40000) {
        fee = 6300000
    }
    else {
        fee = 6500000
    }
    return fee
}

export function calculateExpectedFees(data: Array<string>): number {
    let expectedFees = 0;
    data.forEach((data) => expectedFees += calculateMessageFee(data.length));
    return expectedFees*1.03;
}


export async function sleep(milliseconds = 1000) {
    return await new Promise((resolve) => setTimeout(resolve, milliseconds))
}

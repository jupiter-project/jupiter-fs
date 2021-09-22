import assert from 'assert'
import BigNumber from 'bignumber.js'
import { Readable } from 'stream'
import { v1 as uuidv1 } from 'uuid'
import JupiterClient, { generatePassphrase } from 'jupiter-node-sdk'
import zlib from 'zlib'
import { Container } from 'typescript-ioc';
import {TransactionChecker} from './services/transaction-checker.service';

const transactionChecker = Container.get(TransactionChecker);

export default function JupiterFs({
                                    server,
                                    address,
                                    passphrase,
                                    encryptSecret,
                                    feeNQT,
                                    minimumFndrAccountBalance,
                                    minimumUserAccountBalance,
                                    fundingAmount,
                                    publicKey,
                                  }: any): any {

  assert(fundingAmount, `[JupiterFS]: The funding amount in missing`)
  assert(server, `[JupiterFs]: The server is missing`)
  assert(address, `[JupiterFs]: The address is missing`)
  assert(passphrase, `[JupiterFs]: The passphrase is missing`)
  assert(encryptSecret, `[JupiterFs]: The password is missing`)
  assert(feeNQT, `[JupiterFs]: The feeNQT is missing`)
  assert(minimumFndrAccountBalance, `[JupiterFs]: The minimumFndrAccountBalance is missing`)
  assert(minimumUserAccountBalance, `[JupiterFs]: The minimumUserAccountBalance is missing`)

  console.log('#################################################')
  console.log('## JupiterFs() ')
  console.log(`  server= ${server}`)
  console.log(`  address= ${address}`)
  console.log(`  passphrase= ****`);
  console.log(`  encryptSecret= ****`);
  console.log(`  feeNQT= ${feeNQT}`);
  console.log(`  minimumFndrAccountBalance= ${minimumFndrAccountBalance}`);
  console.log(`  minimumUserAccountBalance= ${minimumUserAccountBalance}`);
  console.log(`  fundingAmount= ${fundingAmount}`);
  console.log(`  publicKey= ${publicKey}`);


  // Quantity to found the binary client when doesnt have enought founds
  // minimumFndrAccountBalance = minimumFndrAccountBalance || 300000000
  // minimumUserAccountBalance = minimumUserAccountBalance || 500000000

  // Chunk size to split the file to upload
  // Max lengh in Jupiter is 43008 bytes per encrypted message
  const CHUNK_SIZE_PATTERN = /.{1,40000}/g;
  const MAX_ALLOWED_SIZE = 3 * 1024 * 1024;
  const SUBTYPE_MESSAGING_METIS_DATA = 16;
  const SUBTYPE_MESSAGING_METIS_METADATA = 17;

  const jupiterClientOptions = {
    server,
    address,   // user's storage address
    passphrase,
    encryptSecret,
    feeNQT,
    minimumFndrAccountBalance,
    minimumUserAccountBalance,
    fundingAmount,
    publicKey
  }
  const jupiterClient = JupiterClient(jupiterClientOptions);

  return {
    key: `jupiter-fs`,
    metaDataKey: `jupiter-fs-meta`,
    client: jupiterClient,
    binaryClient: null,

    async getOrCreateBinaryAddress() {
      console.log('######################################')
      console.log(`## getOrCreateBinaryAddress()`)

      if (this.binaryClient) {
        console.log('binaryClient already loaded!')
        return {
          [this.key]: true,
          [this.metaDataKey]: true,
          server: this.binaryClient.server,
          address: this.binaryClient.address,
          publicKey: this.binaryClient.publicKey,
          account: this.binaryClient.account,
          passphrase: this.binaryClient.passphrase,
          encryptSecret: this.binaryClient.encryptSecret,
          feeNQT,
          minimumFndrAccountBalance: this.binaryClient.minimumFndrAccountBalance,
          minimumUserAccountBalance: this.binaryClient.minimumUserAccountBalance
        }
      }

      console.log(`getting binary address belonging to ${this.client.address}`);
      let binaryAccountInfo = await this.getBinaryAddress()
      console.log(`got binary address from jupiter.`);

      if (!binaryAccountInfo) {
        console.log(`No binary account found in Jupiter. Creating a new binary account`)
        const {
          address,
          publicKey,
          account,
          passphrase,
        } = await this.newBinaryAddress()

        const newAddyInfo = {
          [this.key]: true,
          [this.metaDataKey]: true,
          server,
          address,
          publicKey,
          account,
          passphrase,
          encryptSecret,
          feeNQT,
        }


        console.log(`sending a record to `, this.client.address);
        await this.client.storeRecord(newAddyInfo, SUBTYPE_MESSAGING_METIS_METADATA)
        console.log(`record sent `);
        binaryAccountInfo = newAddyInfo
      }

      // console.log(`funding the account `, binaryAccountInfo.address , minimumFndrAccountBalance)
      // console.log('funder=',  this.jupiterClientOptions.address   )
      console.log(`jupiterfs().getOrCreateBinaryAddress().checkAndFundAccount(binaryAddress=${binaryAccountInfo.address}, minBalance=${minimumFndrAccountBalance},fundingAmount=${fundingAmount})`)
      await this.checkAndFundAccount(binaryAccountInfo.address, minimumFndrAccountBalance, fundingAmount)
      // console.log(`checkAndFundAccount DONE`);


      this.binaryClient = JupiterClient({ ...binaryAccountInfo,
        server,
        feeNQT,
        minimumFndrAccountBalance,
        minimumUserAccountBalance })
      return binaryAccountInfo
    },

    /**
     *
     * @param targetAddress  ie Binary Account
     * @param minimumTargetBalance
     */
    async checkAndFundAccount(targetAddress: string, minimumTargetBalance: number, fundingAmount: number) {
      console.log('######################################')
      console.log(`## jupiterFS.checkAndFundAccount(targetAddress: ${targetAddress}, minBalance: ${minimumTargetBalance}, fundingAmount: ${fundingAmount})`);
      console.log('##')
      // const minBalanceBI = minimumTargetBalance
      console.log('Client Information')
      console.log('------------------------------------')
      console.log(' address:', this.client.address);
      console.log(' passphrase: ***');
      console.log(' minimumFndrAccountBalance:', this.client.minimumFndrAccountBalance)
      console.log(' minimumUserAccountBalance:', this.client.minimumUserAccountBalance)
      console.log(' minimumTargetBalance: ', minimumTargetBalance)
      console.log(' fundingAmount:', fundingAmount);

      // Get balance for binary client
      const targetJupBalanceResponse = await this.client.getBalance(targetAddress)
      console.log(' targetJupBalanceResponse: ', targetJupBalanceResponse);
      const targetBalance = +targetJupBalanceResponse.unconfirmedBalanceNQT; // converted to number

      if(targetBalance < minimumTargetBalance ) {
        const amountToSendTarget = fundingAmount - targetBalance
        const clientJupBalanceResponse = await this.client.getBalance()
        const clientBalance = +clientJupBalanceResponse.unconfirmedBalanceNQT;

        if( clientBalance < amountToSendTarget ) {
            throw new Error(`The client does not have enough funds to give. client balance: ${clientBalance}. jups to transfer: ${amountToSendTarget}`)
        }

        console.log(`Sending Money`)
        console.log('----------------------------')
        console.log(`amount to send:`, amountToSendTarget)
        const { transaction } = await this.client.sendMoney(targetAddress, amountToSendTarget)
        console.log('sent Money');

        console.log('Waiting for confirmation');
        await transactionChecker.waitForConfirmation(transaction)
      }
    },

    /**
     * Get the address for the binary account used to upload files
     * @returns
     */
    async getBinaryAddress() {
      console.log('################################');
      console.log('## getBinaryAddress()  ');
      console.log('## ');
      console.log(`  get binary address belonging to ${this.client.address}`);

      // Get all the transactions for the main jupiter account
      const allTxns = await this.client.getAllMatadataTransactions()
      console.log('  TransactionCount=', allTxns.length)


      // for each transaction, check if contains the jupiter-fs metaDataKey and
      // decrypt the chuncked transactions
      const binaryAccountInfo: any = (
        await Promise.all(
          allTxns.map(async (txn: any) => {
            try {
              const decryptedMessage = await this.client.decryptRecord(
                txn.attachment.encryptedMessage
              )
              let data = JSON.parse(await this.client.decrypt(decryptedMessage))

              // tx with jupiter-fs-meta:true contains info related to the binary client
              if (!data[this.metaDataKey]) return false
              return { transaction: txn.transaction, ...data }
            } catch (err) {
              return false
            }
          })
        )
      )
        .filter((transactions) => !!transactions)
        .reduce(
          (reduced: any, transaction: any) => ({
            ...reduced,
            [transaction.id]: { ...reduced[transaction.id], ...transaction },
          }),
          {}
        )

      return Object.values(binaryAccountInfo).find((r: any) => !r.isDeleted)
    },

    async ls() {
      const allTxns = await this.client.getAllMatadataTransactions()
      const allFilesObj: any = (
        await Promise.all(
          allTxns.map(async (txn: any) => {
            try {
              const decryptedMessage = await this.client.decryptRecord(
                txn.attachment.encryptedMessage
              )
              let data = JSON.parse(await this.client.decrypt(decryptedMessage))
              if (!data[this.key]) return false

              return { transaction: txn.transaction, ...data }
            } catch (err) {
              return false
            }
          })
        )
      )
        .filter((r: any) => r && !r[this.metaDataKey])
        .reduce(
          (obj: any, file: any) => ({
            ...obj,
            [file.id]: { ...obj[file.id], ...file },
          }),
          {}
        )
      return Object.values(allFilesObj).filter((r: any) => !r.isDeleted)
    },

    /**
     * Push a file into the Jupiter blockchain
     * The file is splitted into chunks of CHUNK_SIZE_PATTERN
     * and pushed by the binary client
     * @param name
     * @param data
     * @param errorCallback
     * @returns
     */
    async writeFile(
      name: string,
      data: Buffer,
      errorCallback?: (err: Error) => {}
    ) {

      if (data.length > MAX_ALLOWED_SIZE) {
        if (errorCallback){
          errorCallback(new Error("File size not allowed"));
          return;
        } else {
          throw new Error("File size not allowed");
        }
      }

      await this.getOrCreateBinaryAddress()

      // compress the binary data before to convert to base64
      const encodedFileData = zlib.deflateSync(Buffer.from(data)).toString('base64')
      const chunks = encodedFileData.match(CHUNK_SIZE_PATTERN)

      const expectedFees = this.binaryClient.calculateExpectedFees(chunks);


      console.log(`writeFile().checkAndFundAccount(address: ${this.binaryClient.address}, expectedFees: ${expectedFees})`)
      // await this.checkAndFundAccount(this.binaryClient.address, expectedFees)

      assert(chunks, `we couldn't split the data into chunks`)

      console.log('Processing file in JupiterFS');
      let currentChunk = 0;


      const dataTxns: string[] = await Promise.all(
        chunks.map(async (str) => {
          const { transaction } = await exponentialBackoff(async () => {

            return await this.binaryClient.storeRecord({
              data: str
            }, SUBTYPE_MESSAGING_METIS_DATA)
          }, errorCallback)


          currentChunk++;
          console.log(`Processed ${currentChunk} of ${chunks.length}...`);

          return transaction
        })
      )

      const masterRecord = {
        [this.key]: true,
        id: uuidv1(),
        fileName: name,
        fileSize: data.length,
        txns: await this.client.encrypt(JSON.stringify(dataTxns)),
      }


      console.log('storing master record')
      console.log(masterRecord)


      await this.client.storeRecord(masterRecord, SUBTYPE_MESSAGING_METIS_METADATA)
      return masterRecord
    },

    async deleteFile(id: string): Promise<boolean> {
      await this.client.storeRecord({ id, isDeleted: true }, SUBTYPE_MESSAGING_METIS_METADATA)
      return true
    },

    /**
     *
     * @param { name, id }: Either the name of a file or an ID to fetch file data.
     * If a file name is provided, it will find the first file it can with the name. Therefore, if you have
     * multiple files with the same name you should use the id field to get the file.
     * @returns Buffer of raw file data
     */
    async getFile(
      { name, id }: any,
      isReadStream: boolean = false
    ): Promise<Buffer | Readable> {

      const binaryAccountInfo = await this.getBinaryAddress();
      assert(binaryAccountInfo, 'Binary Account is missing');

      const binaryClient = JupiterClient({ ...binaryAccountInfo,
        server,
        feeNQT,
        minimumFndrAccountBalance,
        minimumUserAccountBalance })

      // await this.getOrCreateBinaryAddress()

      // search first in the unconfirmed transactions
      let txns = await binaryClient.getAllUnconfirmedTransactions()
      const files = await this.ls()
      let targetFile = files.find(
        (t: any) => id ? id === t.id : t.fileName === name
      )

      if (!targetFile){
        // if not found, search in the confirmed transactions
        const files = await this.ls()
        targetFile = files.find(
          (t: any) => id ? id === t.id : t.fileName === name
        )
      }

      assert(targetFile, 'target file was not found')
      console.log('Loading file in JupiterFS');
      let currentChunk = 0;

      // decrypt the transactions info with the list of txIds where is stored the file

      const decryptedDataTxns = await this.client.decrypt(targetFile.txns);
      console.log('dataTransactions', decryptedDataTxns);
      const dataTxns = JSON.parse(decryptedDataTxns)
      console.log(dataTxns);
      const readable = new Readable()

      /**
       * Get the base64 chunks of the image
       * @param readableStream
       * @returns
       */
      const getBase64Strings = async (
        readableStream?: Readable
      ): Promise<string[]> => {
        // Decrypt the message and parse the json chunk
        const getBase64Chunk = async (decryptedMessage: string) => {
          const jsonWithData = await binaryClient.decrypt(decryptedMessage)
          console.log('getBase64Strings().getBase64Chunc()');
          // console.log('jsonWithData= ', jsonWithData);
          const base64Chunk = JSON.parse(jsonWithData).data
          if (readableStream)
            readableStream.push(Buffer.from(base64Chunk, 'base64'))
          return base64Chunk
        }

        // Get the transaction info for each txId of the file
        const allBase64Strings: string[] = await Promise.all(
          dataTxns.map(async (txnId: string) => {
            try {
              console.log('transactionId::',txnId )
              console.log('requesting for data');
              const { data } = await binaryClient.request('post', '/nxt', {
                params: {
                  requestType: 'readMessage',
                  secretPhrase: binaryClient.passphrase,
                  transaction: txnId,
                },
              })
              console.log('data retrieved');
              // console.log(data);

              if (data.errorCode > 0){
                console.error('getBase64Strings().getBase64Chunc().dataTxns.map() data error')
                throw new Error(JSON.stringify(data))
              }

              currentChunk++;
              console.log(`Processed ${currentChunk} of ${dataTxns.length}...`);

              // decrypt and decode the chunk
              return await getBase64Chunk(data.decryptedMessage)
            } catch (err) {
              throw new Error(`target file was not found ` + JSON.stringify(err))
            }
          })
        )
        if (readableStream) readableStream.push(null)
        return allBase64Strings
      }

      if (isReadStream) {
        readable._read = async () => {
          await getBase64Strings(readable)
        }
        return readable
      }

      const base64Strings = await getBase64Strings()
      return zlib.inflateSync(Buffer.from(base64Strings.join(''), 'base64'))
    },

    async getFileStream({ name, id }: any): Promise<Readable> {
      return await this.getFile({ name, id }, true)
    },

    async newBinaryAddress() {
      console.log('############################')
      console.log(`## newBinaryAddress()`)
      console.log('##')
      const passphrase = generatePassphrase()
      console.log('jupiter-node.getAddressFromPassphrase(passphrase)')
      const data = await this.client.getAddressFromPassphrase(passphrase) // function will generate a new account if non is found with passphrase

      return {
        ...data,
        passphrase,
      }
    },
  }
}

/**
 * Function to create a exponential backoff
 * if there is an error, it wait for some time and if the problems contine
 * the time to wait is increased in a exponentional way
 * @param promiseFunction
 * @param failureFunction
 * @param err
 * @param totalAllowedBackoffTries
 * @param backoffAttempt
 * @returns
 */
async function exponentialBackoff(
  promiseFunction: any,
  failureFunction: any = () => {},
  err = null,
  totalAllowedBackoffTries = 2,
  backoffAttempt = 1
): Promise<any> {
  const backoffSecondsToWait = 2 + Math.pow(backoffAttempt, 2)

  if (backoffAttempt > totalAllowedBackoffTries) throw err

  try {
    const result = await promiseFunction()
    return result
  } catch (err) {
    failureFunction(err, backoffAttempt)
    await sleep(backoffSecondsToWait * 1000)
    return await exponentialBackoff(
      promiseFunction,
      failureFunction,
      err,
      totalAllowedBackoffTries,
      backoffAttempt + 1
    )
  }
}

async function sleep(milliseconds = 1000) {
  return await new Promise((resolve) => setTimeout(resolve, milliseconds))
}

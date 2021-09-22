import assert from 'assert'
import BigNumber from 'bignumber.js'
import { Readable } from 'stream'
import { v1 as uuidv1 } from 'uuid'
import JupiterClient, { generatePassphrase } from 'jupiter-node-sdk'
import zlib from 'zlib'
import { create } from 'ipfs-http-client'
import { concat } from 'uint8arrays/concat'
import all from 'it-all'
import { IPFSPath } from 'ipfs-core-types/src/utils'


export default function JupiterFs({
  server,
  address,
  passphrase,
  encryptSecret,
  feeNQT,
  minimumFndrAccountBalance,
  minimumUserAccountBalance,
  dataPvider,
  ipfsS
}: any): any {
  // const jupServer = server || 'https://fs.jup.io'
  const jupServer = server || ''
  const ipfsServer = ipfsS || 'https://ipfs.jup.io'

  feeNQT = feeNQT || 5000
  // Quantity to found the binary client when doesnt have enought founds
  minimumFndrAccountBalance = minimumFndrAccountBalance || 300000000 
  minimumUserAccountBalance = minimumUserAccountBalance || 500000000

  // Chunk size to split the file to upload
  // Max lengh in Jupiter is 43008 bytes per encrypted message
  const CHUNK_SIZE_PATTERN = /.{1,40000}/g;
  const MAX_JUPITER_ALLOWED_SIZE = 1 * 1024 * 1024;
  const MAX_IPFS_ALLOWED_SIZE = 100 * 1024 * 1024;

  const SUBTYPE_MESSAGING_METIS_DATA = 16;
  const SUBTYPE_MESSAGING_METIS_METADATA = 17;

  const JUPITER_DATA_PROVIDER = "JUPITER";
  const IPFS_DATA_PROVIDER = "IPFS";

  //connect to ipfs node
  const ipfsClient = create({
    url: ipfsServer+'/api/v0'
  })

  return {
    key: `jupiter-fs`,
    metaDataKey: `jupiter-fs-meta`,
    client: JupiterClient({
      server: jupServer,
      address,
      passphrase,
      encryptSecret,
      feeNQT,
      minimumFndrAccountBalance,
      minimumUserAccountBalance
    }),
    ipfsClient: ipfsClient,
    binaryClient: null,

    async getOrCreateBinaryAddress() {
      if (this.binaryClient) {
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

      let addy = await this.getBinaryAddress()
      if (!addy) {
        const {
          address,
          publicKey,
          account,
          passphrase,
        } = await this.newBinaryAddress()

        const newAddyInfo = {
          [this.key]: true,
          [this.metaDataKey]: true,
          server: jupServer,
          address,
          publicKey,
          account,
          passphrase,
          encryptSecret,
          feeNQT,
        }
        await this.client.storeRecord(newAddyInfo, SUBTYPE_MESSAGING_METIS_METADATA)
        addy = newAddyInfo
      }
      await this.checkAndFundAccount(addy.address, minimumFndrAccountBalance)
      this.binaryClient = JupiterClient({ ...addy, 
        server: jupServer, 
        feeNQT, 
        minimumFndrAccountBalance, 
        minimumUserAccountBalance })
      return addy
    },

    async checkAndFundAccount(targetAddress: string, minBalance: number) {
      const minBalanceBI = new BigNumber(minBalance)

      // Get balance for binary client
      const balanceJup = await this.client.getBalance(targetAddress)
      let remainingBalanceBI = new BigNumber(balanceJup.unconfirmedBalanceNQT).minus(minBalance)

      if (
        // if binary client doesnt have money or is less than minimumFndrAccountBalance
        // then send money to support file upload 
        !balanceJup ||
        new BigNumber(balanceJup.unconfirmedBalanceNQT).lt(minBalanceBI) || 
        remainingBalanceBI.lt(minimumFndrAccountBalance)
      ) {
        
        // send money to the binary client to pay fees for transactions
        let amountJupToSend = (minBalance > minimumFndrAccountBalance) ? minBalance : minimumFndrAccountBalance
        await this.client.sendMoney(targetAddress, amountJupToSend)
      }
    },

    /**
     * Get the address for the binary account used to upload files
     * @returns 
     */
    async getBinaryAddress() {
      // Get all the transactions for the main jupiter account
      const allTxns = await this.client.getAllMatadataTransactions()
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
        .filter((r) => !!r)
        .reduce(
          (obj: any, file: any) => ({
            ...obj,
            [file.id]: { ...obj[file.id], ...file },
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
      dataProvider: string,
      errorCallback?: (err: Error) => {}
    ) {

      if (dataProvider === undefined || typeof dataProvider === 'function'){
        // define dataProvider base on size
        if (data.length > MAX_JUPITER_ALLOWED_SIZE){
          dataProvider = IPFS_DATA_PROVIDER
        } else {
          dataProvider = JUPITER_DATA_PROVIDER
        }
      }

      if (dataProvider !== JUPITER_DATA_PROVIDER && 
          dataProvider !== IPFS_DATA_PROVIDER) {
          if (errorCallback){
            errorCallback(new Error("Invalid Data Provider"));
            return;
          } else {
            throw new Error("Invalid Data Provider");
          }
      }

      if ((data.length > MAX_IPFS_ALLOWED_SIZE) ||
          (dataProvider === JUPITER_DATA_PROVIDER && data.length > MAX_JUPITER_ALLOWED_SIZE)) {
        if (errorCallback){
          errorCallback(new Error("File size not allowed"));
          return;
        } else {
          throw new Error("File size not allowed");
        }
      }

      await this.getOrCreateBinaryAddress()  

      if (dataProvider === IPFS_DATA_PROVIDER){
        return this.writeFileIntoIPFS(name, data)

      } else {
        // compress the binary data before to convert to base64
        const encodedFileData = zlib.deflateSync(Buffer.from(data)).toString('base64')
        return this.writeFileIntoJupiter(name, encodedFileData)

      }
    },

    async writeFileIntoJupiter(
      name: string,
      encodedFileData: string,
      errorCallback?: (err: Error) => {}
    ) {
    
      let masterRecord = {
        [this.key]: true,
        id: uuidv1(),
        fileName: name,
        fileSize: encodedFileData.length,
        txns: [],
        dataProvider: JUPITER_DATA_PROVIDER
      }

      const chunks = encodedFileData.match(CHUNK_SIZE_PATTERN)
      const expectedFees = this.binaryClient.calculateExpectedFees(chunks);
      await this.checkAndFundAccount(this.binaryClient.address, expectedFees)
      
      assert(chunks, `we couldn't split the data into chunks`)

      const dataTxns: string[] = await Promise.all(
        chunks.map(async (str) => {
          const { transaction } = await exponentialBackoff(async () => {
            return await this.binaryClient.storeRecord({
              data: str
            }, SUBTYPE_MESSAGING_METIS_DATA)
          }, errorCallback)
          return transaction
        })
      )

      masterRecord.txns = await this.client.encrypt(JSON.stringify(dataTxns))

      await this.client.storeRecord(masterRecord, SUBTYPE_MESSAGING_METIS_METADATA)
      return masterRecord
    },

    async writeFileIntoIPFS(
      name: string,
      data: Buffer,
      errorCallback?: (err: Error) => {}
    ) {
      if(!ipfsClient) return {};
      
      const encodedEncryptedData = await this.client.encrypt(data)

      //calculate base stimated fee 
      //const expectedFees = constantFee + ((size / unitSize) * feePerSize);
      const expectedFees = 7000 + ((encodedEncryptedData.length / 32) * 5000);
      await this.checkAndFundAccount(this.binaryClient.address, expectedFees)

      let masterRecord = {
        [this.key]: true,
        id: uuidv1(),
        fileName: name,
        fileSize: encodedEncryptedData.length,
        cid: '',
        dataProvider: IPFS_DATA_PROVIDER
      }

      const response = await ipfsClient.add({
        content: encodedEncryptedData
      })
      masterRecord.cid = await this.client.encrypt(response.cid.toString())

      await this.client.storeRecord(masterRecord, SUBTYPE_MESSAGING_METIS_METADATA, expectedFees)
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
      { name, id }: any
    ): Promise<Buffer> {
      await this.getOrCreateBinaryAddress()

      // search first in the unconfirmed transactions
      let txns = await this.binaryClient.getAllUnconfirmedTransactions()
      const files = await this.ls()
      const targetFile = files.find(
        (t: any) => (id && id === t.id) || t.fileName === name
      )

      if (!targetFile){
        // if not found, search in the confirmed transactions
        const files = await this.ls()
        const targetFile = files.find(
          (t: any) => (id && id === t.id) || t.fileName === name
        )
      }

      assert(targetFile, 'target file was not found')

      if (targetFile.dataProvider && targetFile.dataProvider === IPFS_DATA_PROVIDER){
        return this.getFileFromIPFS(targetFile);
      } else {
        return this.getFileFromJupiter(targetFile);
      }
    },

    async getFileFromJupiter( targetFile : any ): Promise<Buffer> {
      // decrypt the transactions info with the list of txIds where is stored the file
      const dataTxns = JSON.parse(await this.client.decrypt(targetFile.txns))

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
          const jsonWithData = await this.binaryClient.decrypt(decryptedMessage)
          const base64Chunk = JSON.parse(jsonWithData).data
          if (readableStream)
            readableStream.push(Buffer.from(base64Chunk, 'base64'))
          return base64Chunk
        }

        // Get the transaction info for each txId of the file
        const allBase64Strings: string[] = await Promise.all(
          dataTxns.map(async (txnId: string) => {
            try {
              const { data } = await this.binaryClient.request('post', '/nxt', {
                params: {
                  requestType: 'readMessage',
                  secretPhrase: encryptSecret || this.binaryClient.passphrase,
                  transaction: txnId,
                },
              })
              if (data.errorCode > 0){
                throw new Error(JSON.stringify(data))
              } 

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

      const base64Strings = await getBase64Strings()
      return zlib.inflateSync(Buffer.from(base64Strings.join(''), 'base64'))
    },


    async getFileFromIPFS( targetFile : any ): Promise<Buffer> {
      const cid = await this.client.decrypt(targetFile.cid);
      
      return await this.getFileFromIPFSAndCID(cid);
    },

    async getFileFromIPFSAndCID( CID: IPFSPath, encrypted?: boolean ): Promise<Buffer> {
      if(!ipfsClient) return Buffer.alloc(0);

      const fileDataFromIPFSEncrypted = concat(await all(ipfsClient.cat(CID)))
      if (!fileDataFromIPFSEncrypted) return Buffer.alloc(0);

      const fileDataFromIPFS = await this.client.decrypt(new TextDecoder().decode(fileDataFromIPFSEncrypted))
      const buff = Buffer.from(fileDataFromIPFS, 'base64')

      return buff;
    },

    async getFileStream({ name, id }: any): Promise<Readable> {
      return await this.getFile({ name, id }, true)
    },

    async newBinaryAddress() {
      const passphrase = generatePassphrase()
      const data = await this.client.getAddressFromPassphrase(passphrase)
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

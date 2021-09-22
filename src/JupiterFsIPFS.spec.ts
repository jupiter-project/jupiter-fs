import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { v1 as uuidv1 } from 'uuid'
import JupiterFs from './JupiterFs'
import axios from "axios"

/**
 * TODO TODO TODO TODO TODO TODO
 * need to run tests against locally spun up node/testnet so we're not
 * polluting accounts and data on mainnet
 */
describe('JupiterFs IPFS provider', function() {
  this.timeout(40000)

  /**assert(process.env.JUPITER_ADDRESS, 'JUPITER_ADDRESS env variable is not set')
  assert(
    process.env.JUPITER_PASSPHRASE,
    'JUPITER_PASSPHRASE env variable is not set'
  )

  // const fs = JupiterFs({ server: 'http://localhost:6876' })
  const jupFs = JupiterFs({
    server: process.env.JUPITER_SERVER || 'http://104.131.166.136:6876/test',
    address: process.env.JUPITER_ADDRESS,
    passphrase: process.env.JUPITER_PASSPHRASE,
  })*/

  // const fs = JupiterFs({ server: 'http://localhost:7876' })
 const jupFs = JupiterFs({
  server: 'http://104.131.166.136:6876',
  address: 'JUP-XTAE-VA6X-4SRT-AU89L',
  passphrase: 'b',
  dataPvider: 'IPFS'
});

  const testFilename1 = `${uuidv1()}JUP.js`
  const testFilename2 = `${uuidv1()}IPFS.js`
  const IMAGE_TO_TEST = 'huge.jpg';

 describe('#writeFileIFPSWithoutDP()', function() {
    it(`should write a file in IPFS to a jupiter account without error`, async () => {
      const origFileData = await fs.promises.readFile(
        path.join(__dirname, '../testFiles/10mb.jpg'),
        { encoding: null }
      )
      const res = await jupFs.writeFile(testFilename2, origFileData, function(errorr: any){
        console.log("erorrrrrrrrrrrrr" + errorr)
      })
      assert.strictEqual(res.fileName, testFilename2)
      assert.strictEqual(res.cid != undefined && res.cid !== '', true)
      assert.strictEqual(res.dataProvider, "IPFS")

      // decrypt the cid
      const cid = await jupFs.client.decrypt(res.cid);
      const buff = await jupFs.getFileFromIPFSAndCID(cid)
      
      assert.strictEqual(buff.length > 0, true)
      assert.strictEqual(buff.length, origFileData.length)
      assert.strictEqual(buff.length, origFileData.length)

      const fileDataObtained = await jupFs.getFile({ name: testFilename2 })
      assert.strictEqual(fileDataObtained instanceof Buffer, true)
      assert.strictEqual(fileDataObtained.length > 0, true)
      assert.strictEqual(origFileData.length, fileDataObtained.length)
    })
  })

  xdescribe('#writeFileIFPSWithoutDpSmallFile()', function() {
    it(`should write a small file in JUP to a jupiter account without error`, async () => {
      const origFileData = await fs.promises.readFile(
        path.join(__dirname, '../testFiles/small.jpg'),
        { encoding: null }
      )
      const res = await jupFs.writeFile(testFilename1, origFileData, function(errorr: any){
        console.log("erorrrrrrrrrrrrr" + errorr)
      })

      assert.strictEqual(res.fileName, testFilename1)
      assert.strictEqual(res.txns.length > 0, true)
      assert.strictEqual(res.dataProvider, "JUPITER")

      const fileDataObtained = await jupFs.getFile({ name: testFilename1 })

      assert.strictEqual(fileDataObtained instanceof Buffer, true)
      assert.strictEqual(fileDataObtained.length > 0, true)
      assert.strictEqual(origFileData.length, fileDataObtained.length)
    })
  })
})
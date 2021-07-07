import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { v1 as uuidv1 } from 'uuid'
import JupiterFs from './JupiterFs'

/**
 * TODO TODO TODO TODO TODO TODO
 * need to run tests against locally spun up node/testnet so we're not
 * polluting accounts and data on mainnet
 */
describe('JupiterFs', function() {
  assert(process.env.JUPITER_ADDRESS, 'JUPITER_ADDRESS env variable is not set')
  assert(
    process.env.JUPITER_PASSPHRASE,
    'JUPITER_PASSPHRASE env variable is not set'
  )

  // const fs = JupiterFs({ server: 'http://localhost:6876' })
  const jupFs = JupiterFs({
    server: process.env.JUPITER_SERVER || 'http://104.131.166.136:6876/test',
    address: process.env.JUPITER_ADDRESS,
    passphrase: process.env.JUPITER_PASSPHRASE,
  })
  const testFilename = `${uuidv1()}.js`

  describe('#newBinaryAddress()', function() {
    it(`should get a new JUP address from a passphrase`, async () => {
      const info = await jupFs.newBinaryAddress()
      assert.strictEqual(info.address.slice(0, 4), 'JUP-')
    })
  })

  describe('#getOrCreateBinaryAddress()', function() {
    it(`should get the binary address info to store file data`, async function() {
      const addy = await jupFs.getOrCreateBinaryAddress()
      assert.strictEqual(typeof addy.address === 'string', true)
    })
  })

  xdescribe('#ls()', function() {
    it(`should fetch a list of files for a jupiter account`, async () => {
      const files = await jupFs.ls()
      assert.strictEqual(files instanceof Array, true)
    })
  })

  describe('#writeFile()', function() {
    it(`should write a file to a jupiter account without error`, async () => {
      const fileData = await fs.promises.readFile(
        path.join(__dirname, '../testFiles/medium.jpg'),
        { encoding: null }
      )
      console.log("filename " + testFilename);
      const res = await jupFs.writeFile(testFilename, fileData, assert.fail)
      assert.strictEqual(res.fileName, testFilename)
      assert.strictEqual(res.txns.length > 0, true)
    })
  })

  describe('#getFile()', function() {
    it(`should get the binary data for a file specified`, async () => {
      console.log("filename " + testFilename);
      const fileData = await jupFs.getFile({ name: testFilename })
      const origFileData = await fs.promises.readFile(
        path.join(__dirname, '../testFiles/medium.jpg'),
        'utf-8'
      )
      assert.strictEqual(fileData instanceof Buffer, true)
      assert.strictEqual(fileData.length > 0, true)
      assert.strictEqual(origFileData, fileData.toString('utf-8'))
    })
  })
})

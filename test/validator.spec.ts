/* eslint-env mocha */

import { randomBytes } from '@libp2p/crypto'
import { generateKeyPair } from '@libp2p/crypto/keys'
import { peerIdFromKeys } from '@libp2p/peer-id'
import { expect } from 'aegir/chai'
import { base58btc } from 'multiformats/bases/base58'
import { concat as uint8ArrayConcat } from 'uint8arrays/concat'
import { fromString as uint8ArrayFromString } from 'uint8arrays/from-string'
import { toString as uint8ArrayToString } from 'uint8arrays/to-string'
import * as ERRORS from '../src/errors.js'
import * as ipns from '../src/index.js'
import { marshal, peerIdToRoutingKey } from '../src/utils.js'
import { ipnsValidator } from '../src/validator.js'
import type { PeerId } from '@libp2p/interface/peer-id'

describe('validator', function () {
  this.timeout(20 * 1000)

  const contentPath = '/ipfs/bafkqae3imvwgy3zamzzg63janjzs22lqnzzqu'
  let peerId1: PeerId
  let peerId2: PeerId

  before(async () => {
    const rsa = await generateKeyPair('RSA', 2048)
    peerId1 = await peerIdFromKeys(rsa.public.bytes, rsa.bytes)

    const rsa2 = await generateKeyPair('RSA', 2048)
    peerId2 = await peerIdFromKeys(rsa2.public.bytes, rsa2.bytes)
  })

  it('should validate a (V2) record', async () => {
    const sequence = 0
    const validity = 1000000

    const record = await ipns.create(peerId1, contentPath, sequence, validity, { v1Compatible: false })
    const marshalledData = marshal(record)

    const keyBytes = base58btc.decode(`z${peerId1.toString()}`)
    const key = uint8ArrayConcat([uint8ArrayFromString('/ipns/'), keyBytes])

    await ipnsValidator(key, marshalledData)
  })

  it('should validate a (V1+V2) record', async () => {
    const sequence = 0
    const validity = 1000000

    const record = await ipns.create(peerId1, contentPath, sequence, validity, { v1Compatible: true })
    const marshalledData = marshal(record)

    const keyBytes = base58btc.decode(`z${peerId1.toString()}`)
    const key = uint8ArrayConcat([uint8ArrayFromString('/ipns/'), keyBytes])

    await ipnsValidator(key, marshalledData)
  })

  it('should use validator.validate to verify that a record is not valid', async () => {
    const sequence = 0
    const validity = 1000000

    const record = await ipns.create(peerId1, contentPath, sequence, validity)

    // corrupt the record by changing the value to random bytes
    record.value = uint8ArrayToString(randomBytes(record.value?.length ?? 0))
    const marshalledData = marshal(record)

    const key = peerIdToRoutingKey(peerId1)

    await expect(ipnsValidator(key, marshalledData)).to.eventually.be.rejected().with.property('code', ERRORS.ERR_SIGNATURE_VERIFICATION)
  })

  it('should use validator.validate to verify that a record is not valid when it is passed with the wrong IPNS key', async () => {
    const sequence = 0
    const validity = 1000000

    const record = await ipns.create(peerId1, contentPath, sequence, validity)
    const marshalledData = marshal(record)

    const key = peerIdToRoutingKey(peerId2)

    await expect(ipnsValidator(key, marshalledData)).to.eventually.be.rejected().with.property('code', ERRORS.ERR_INVALID_EMBEDDED_KEY)
  })

  it('should use validator.validate to verify that a record is not valid when the wrong key is embedded', async () => {
    const sequence = 0
    const validity = 1000000

    const record = await ipns.create(peerId1, contentPath, sequence, validity)
    record.pubKey = peerId2.publicKey
    const marshalledData = marshal(record)

    const key = peerIdToRoutingKey(peerId1)

    await expect(ipnsValidator(key, marshalledData)).to.eventually.be.rejected().with.property('code', ERRORS.ERR_INVALID_EMBEDDED_KEY)
  })

  it('should limit the size of incoming records', async () => {
    const marshalledData = new Uint8Array(1024 * 1024)
    const key = new Uint8Array()

    await expect(ipnsValidator(key, marshalledData)).to.eventually.be.rejected().with.property('code', ERRORS.ERR_RECORD_TOO_LARGE)
  })
})

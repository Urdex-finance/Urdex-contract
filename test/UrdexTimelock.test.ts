import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers'
import { time } from '@nomicfoundation/hardhat-network-helpers'
import { expect } from 'chai'
import { ethers } from 'hardhat'
import Web3 from 'web3'

describe('UrdexTimelock', function () {
  let accounts: SignerWithAddress[]
  let admin: SignerWithAddress
  let user1: SignerWithAddress

  let UrdToken: any
  let UrdexTimelock: any

  before(async function () {
    accounts = await ethers.getSigners()

    admin = accounts[0]
    user1 = accounts[1]

    UrdToken = await ethers.getContractFactory('UrdToken', admin)
    UrdToken = await UrdToken.deploy()

    UrdexTimelock = await ethers.getContractFactory('UrdexTimelock', admin)
    UrdexTimelock = await UrdexTimelock.deploy(admin.address, 12 * 60 * 60)

    await UrdToken.connect(admin).transfer(
      UrdexTimelock.address,
      ethers.utils.parseEther('100'),
    )
  })

  it('UrdexTimelock balance = 100', async () => {
    expect(String(await UrdToken.balanceOf(UrdexTimelock.address))).to.equals(
      String(ethers.utils.parseEther('100')),
    )
    expect(String(await UrdToken.balanceOf(user1.address))).to.equals('0')
  })

  it('QueueTransaction without signature and execute', async () => {
    let sig = ''
    let data = UrdToken.interface.encodeFunctionData('transfer', [
      user1.address,
      ethers.utils.parseEther('100'),
    ])
    const eta = (await ethers.provider.getBlock('latest')).timestamp + 86400 * 2
    let queueTransaction = await UrdexTimelock.connect(admin).queueTransaction(
      UrdToken.address,
      0,
      sig,
      data,
      eta,
    )
    await queueTransaction.wait()

    await expect(
      UrdexTimelock.executeTransaction(UrdToken.address, 0, sig, data, eta),
    ).to.revertedWithCustomError(UrdexTimelock, `TransactionLocked`)

    await time.increase(86400 * 2)

    await expect(
      UrdexTimelock.executeTransaction(UrdToken.address, 0, sig, data, eta),
    ).to.emit(UrdexTimelock, 'ExecuteTransaction')

    expect(String(await UrdToken.balanceOf(UrdexTimelock.address))).to.equals(
      '0',
    )
    expect(String(await UrdToken.balanceOf(user1.address))).to.equals(
      ethers.utils.parseEther('100'),
    )
  })

  it('QueueTransaction with signature and execute setPendingAdmin = user1 ', async () => {
    let sig = 'setPendingAdmin(address)'
    let data = new ethers.utils.AbiCoder().encode(['address'], [user1.address])

    const eta = (await ethers.provider.getBlock('latest')).timestamp + 86400 * 2

    let queueTransaction = await UrdexTimelock.connect(admin).queueTransaction(
      UrdexTimelock.address,
      0,
      sig,
      data,
      eta,
    )
    await queueTransaction.wait()

    await expect(
      UrdexTimelock.executeTransaction(
        UrdexTimelock.address,
        0,
        sig,
        data,
        eta,
      ),
    ).to.revertedWithCustomError(UrdexTimelock, `TransactionLocked`)

    await time.increase(86400 * 2)

    await expect(
      UrdexTimelock.executeTransaction(
        UrdexTimelock.address,
        0,
        sig,
        data,
        eta,
      ),
    ).to.emit(UrdexTimelock, 'ExecuteTransaction')

    await UrdexTimelock.connect(user1).acceptAdmin()
    expect(String(await UrdexTimelock.admin())).to.equals(user1.address)
  })
})

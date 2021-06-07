const { assert } = require('chai');
const { ZERO_ADDRESS } = require('./helpers/constants');

const { utils, BigNumber } = ethers;

describe('MintingManager', () => {
  const DomainNamePrefix = 'udtestdev-';
  const cryptoRoot = BigNumber.from('0x0f4a10a4f46c288cea365fcf45cccf0e9d901b945b9829ccdb54c10dc3cb7a6f');
  const walletRoot = BigNumber.from('0x1e3f482b3363eb4710dae2cb2183128e272eafbe137f686851c1caea32502230');

  let Registry, CryptoRegistry, CryptoResolver, CryptoMintingController, MintingManager;
  let registry, cryptoRegistry, cryptoResolver, cryptoMintingController, mintingManager;
  let signers, domainSuffix;

  const sign = async (data, address, signer) => {
    return signer.signMessage(
      utils.arrayify(
        utils.solidityKeccak256(
          [ 'bytes32', 'address' ],
          [ utils.keccak256(data), address ]
        )
      )
    )
  }

  before(async () => {
    signers = await ethers.getSigners();
    [coinbase] = signers;

    Registry = await ethers.getContractFactory('contracts/Registry.sol:Registry');
    CryptoRegistry = await ethers.getContractFactory('contracts/cns/CryptoRegistry.sol:CryptoRegistry');
    CryptoResolver = await ethers.getContractFactory('contracts/cns/CryptoResolver.sol:CryptoResolver');
    CryptoMintingController = await ethers.getContractFactory('contracts/cns/CryptoMintingController.sol:CryptoMintingController');
    MintingManager = await ethers.getContractFactory('contracts/MintingManager.sol:MintingManager');
  })

  describe('MinterRole', () => {
    before(async () => {
      [, faucet, receiver] = signers;
    })

    beforeEach(async () => {
      registry = await Registry.deploy();
      mintingManager = await MintingManager.deploy();
      await mintingManager.initialize(registry.address, ZERO_ADDRESS, ZERO_ADDRESS);
      await mintingManager.addMinter(coinbase.address);

      await registry.initialize(mintingManager.address);
      await registry.setTokenURIPrefix('/');
    })

    describe('close minter account', () => {
      it('revert when closing by non-minter account', async () => {
        await expect(
          mintingManager.connect(receiver).closeMinter(receiver.address)
        ).to.be.revertedWith('MinterRole: CALLER_IS_NOT_MINTER');
      })

      it('revert when zero account', async () => {
        await expect(
          mintingManager.closeMinter(ZERO_ADDRESS)
        ).to.be.revertedWith('MinterRole: RECEIVER_IS_EMPTY');
      })

      it('close minter without forwarding funds', async () => {
        const initBalance = await faucet.getBalance();
        await mintingManager.closeMinter(faucet.address, { value: 0 });

        await expect(
          mintingManager['safeMintSLD(address,uint256,string)'](coinbase.address, walletRoot, 'label')
        ).to.be.revertedWith('MinterRole: CALLER_IS_NOT_MINTER');

        const actualBalance = await faucet.getBalance();
        assert.equal(actualBalance, initBalance.toString());
      })

      it('close minter with forwarding funds', async () => {
        const value = 1
        const initBalance = await faucet.getBalance()

        await mintingManager.closeMinter(faucet.address, { value })

        await expect(
          mintingManager['safeMintSLD(address,uint256,string)'](coinbase.address, walletRoot, 'label')
        ).to.be.revertedWith('MinterRole: CALLER_IS_NOT_MINTER');

        const actualBalance = await faucet.getBalance()
        const expectedBalance = BigNumber.from(initBalance).add(value)
        assert.equal(actualBalance, expectedBalance.toString())
      })
    })

    describe('rotate minter account', () => {
      it('revert when rotateing by non-minter account', async () => {
        await expect(
          mintingManager.connect(receiver).rotateMinter(receiver.address)
        ).to.be.revertedWith('MinterRole: CALLER_IS_NOT_MINTER');
      })

      it('revert when zero account', async () => {
        await expect(
          mintingManager.rotateMinter(ZERO_ADDRESS)
        ).to.be.revertedWith('MinterRole: RECEIVER_IS_EMPTY');
      })

      it('rotate minter without defining value', async () => {
        const initBalance = await receiver.getBalance()

        await mintingManager.rotateMinter(receiver.address)

        await expect(
          mintingManager['safeMintSLD(address,uint256,string)'](coinbase.address, walletRoot, 'label')
        ).to.be.revertedWith('MinterRole: CALLER_IS_NOT_MINTER');

        const actualBalance = await receiver.getBalance()
        assert.equal(actualBalance, initBalance.toString())
      })

      it('rotate minter without forwarding funds', async () => {
        const initBalance = await receiver.getBalance()

        await mintingManager.rotateMinter(receiver.address, { value: 0 })

        await expect(
          mintingManager['safeMintSLD(address,uint256,string)'](coinbase.address, walletRoot, 'label')
        ).to.be.revertedWith('MinterRole: CALLER_IS_NOT_MINTER');
  
        const actualBalance = await receiver.getBalance()
        assert.equal(actualBalance, initBalance.toString())
      })

      it('rotate minter with forwarding funds', async () => {
        const value = 3
        const initBalance = await receiver.getBalance()

        await mintingManager.rotateMinter(receiver.address, { value })

        await expect(
          mintingManager['safeMintSLD(address,uint256,string)'](coinbase.address, walletRoot, 'label')
        ).to.be.revertedWith('MinterRole: CALLER_IS_NOT_MINTER');
  
        const actualBalance = await receiver.getBalance()
        const expectedBalance = BigNumber.from(initBalance).add(value)
        assert.equal(actualBalance, expectedBalance.toString())
      })
    })
  })

  describe('IClaimer', () => {
    before(async () => {
      [, developer, receiver] = signers;

      registry = await Registry.deploy();
      mintingManager = await MintingManager.deploy();
      await mintingManager.initialize(registry.address, ZERO_ADDRESS, ZERO_ADDRESS);
      await registry.initialize(mintingManager.address);
      await registry.setTokenURIPrefix('/');
    })

    beforeEach(() => {
      domainSuffix = `prefixed-domain-${Math.random() * 1000}`;
    })

    describe('claim(uint256,string)', () => {
      it('should mint prefixed domain', async () => {
        await mintingManager.connect(developer).functions['claim(uint256,string)'](walletRoot, domainSuffix)
        const tokenId = await registry.childIdOf(walletRoot, `${DomainNamePrefix}${domainSuffix}`)
        const tokenUri = await registry.tokenURI(tokenId)
        assert.equal(tokenUri, `/${tokenId}`)
      })

      it('should send domain to requester', async () => {
        await mintingManager.connect(developer).functions['claim(uint256,string)'](walletRoot, domainSuffix)
        const tokenId = await registry.childIdOf(walletRoot, `${DomainNamePrefix}${domainSuffix}`)
        const owner = await registry.ownerOf(tokenId)
        assert.equal(owner, developer.address)
      })

      it('should not allow to mint the same domain twice', async () => {
        const minter = mintingManager.connect(developer);
        await minter.functions['claim(uint256,string)'](walletRoot, domainSuffix);

        await expect(
          minter.functions['claim(uint256,string)'](walletRoot, domainSuffix)
        ).to.be.revertedWith('ERC721: token already minted');
      })
    })

    describe('claimTo(address,uint256,string)', () => {
      it('should mint domain to receiver', async () => {
        await mintingManager.connect(developer).functions['claimTo(address,uint256,string)'](receiver.address, walletRoot, domainSuffix)
        const tokenId = await registry.childIdOf(walletRoot, `${DomainNamePrefix}${domainSuffix}`)
        const owner = await registry.ownerOf(tokenId)
        assert.equal(owner, receiver.address)
      })
    })

    describe('claimToWithRecords(address,uint256,string,string[],string[])', () => {
      const funcSig = 'claimToWithRecords(address,uint256,string,string[],string[])';

      it('should mint domain to receiver with predefined keys', async () => {
        const minter = mintingManager.connect(developer);
        await minter.functions[funcSig](receiver.address, walletRoot, domainSuffix, ['key'], ['value'])
        const tokenId = await registry.childIdOf(walletRoot, `${DomainNamePrefix}${domainSuffix}`)
        const owner = await registry.ownerOf(tokenId)
        const values = await registry.getMany(['key'], tokenId)
        assert.equal(owner, receiver.address)
        assert.deepEqual(values, ['value'])
      })

      it('should mint domain with empty keys', async () => {
        const minter = mintingManager.connect(developer);
        await minter.functions[funcSig](receiver.address, walletRoot, domainSuffix, [], []);
        const tokenId = await registry.childIdOf(walletRoot, `${DomainNamePrefix}${domainSuffix}`)
        const owner = await registry.ownerOf(tokenId)
        const values = await registry.getMany(['key1', 'key2'], tokenId)
        assert.equal(owner, receiver.address)
        assert.deepEqual(values, ['', ''])
      })
    })
  })

  describe('SLDMinter', () => {
    before(async () => {
      [, faucet, receiver, spender] = signers;
    })

    beforeEach(async () => {
      registry = await Registry.deploy();
      mintingManager = await MintingManager.deploy();
      await mintingManager.initialize(registry.address, ZERO_ADDRESS, ZERO_ADDRESS);
      await mintingManager.addMinter(coinbase.address);

      await registry.initialize(mintingManager.address);
      await registry.setTokenURIPrefix('/');
    })

    describe('mint second level domain', () => {
      it('revert minting when account is not minter', async () => {
        await expect(
          mintingManager.connect(receiver).mintSLD(coinbase.address, walletRoot, 'test-1ka')
        ).to.be.revertedWith('MinterRole: CALLER_IS_NOT_MINTER');
      })

      it('revert minting when tld is invalid', async () => {
        await expect(
          mintingManager.mintSLD(coinbase.address, 0, 'test-1ka3')
        ).to.be.revertedWith('MintingManager: TLD_NOT_VALID');
      })

      it('mint domain', async () => {
        await mintingManager.mintSLD(coinbase.address, walletRoot, 'test-1dp')
        const tokenId = await registry.childIdOf(walletRoot, 'test-1dp')
        assert.equal(await registry.ownerOf(tokenId), coinbase.address)
      })
    })

    describe('safe mint second level domain', () => {
      const funcSig = 'safeMintSLD(address,uint256,string)';

      it('revert safe minting when account is not minter', async () => {
        await expect(
          mintingManager.connect(receiver)[funcSig](coinbase.address, walletRoot, 'test-2oa')
        ).to.be.revertedWith('MinterRole: CALLER_IS_NOT_MINTER');
      })

      it('revert safe minting when tld is invalid', async () => {
        await expect(
          mintingManager.mintSLD(coinbase.address, 0, 'test-2oa32')
        ).to.be.revertedWith('MintingManager: TLD_NOT_VALID');
      })

      it('safe mint domain', async () => {
        await mintingManager[funcSig](coinbase.address, walletRoot, 'test-2oa')
        const tokenId = await registry.childIdOf(walletRoot, 'test-2oa')
        assert.equal(await registry.ownerOf(tokenId), coinbase.address)
      })
    })

    describe('safe mint(data) second level domain', () => {
      const funcSig = 'safeMintSLD(address,uint256,string,bytes)';

      it('revert safe minting when account is not minter', async () => {
        await expect(
          mintingManager.connect(receiver)[funcSig](coinbase.address, walletRoot, 'test-3oa', '0x')
        ).to.be.revertedWith('MinterRole: CALLER_IS_NOT_MINTER');
      })

      it('revert safe minting when tld is invalid', async () => {
        await expect(
          mintingManager[funcSig](coinbase.address, 0, 'test-3oa23', '0x')
        ).to.be.revertedWith('MintingManager: TLD_NOT_VALID');
      })

      it('safe mint domain', async () => {
        await mintingManager[funcSig](coinbase.address, walletRoot, 'test-3oa', '0x')

        const tokenId = await registry.childIdOf(walletRoot, 'test-3oa')
        assert.equal(await registry.ownerOf(tokenId), coinbase.address)
      })
    })

    describe('relay', () => {
      it('revert relay meta-mint when signer is not minter', async () => {
        const data = mintingManager.interface.encodeFunctionData(
          'mintSLD(address,uint256,string)',
          [receiver.address, walletRoot, 'test-p1-revert']
        );
        const signature = sign(data, faucet.address, coinbase);

        await expect(
          mintingManager.connect(receiver).relay(data, signature)
        ).to.be.revertedWith('MintingManager: SIGNER_IS_NOT_MINTER');
      })

      it('revert relay meta-mint when signature is empty', async () => {
        const data = mintingManager.interface.encodeFunctionData(
          'mintSLD(address,uint256,string)',
          [receiver.address, walletRoot, 'test-p1-revert']
        );

        await expect(
          mintingManager.connect(receiver).relay(data, '0x')
        ).to.be.revertedWith('ECDSA: invalid signature length');
      })

      it('relay meta-safe mint', async () => {
        const data = mintingManager.interface.encodeFunctionData(
          'safeMintSLD(address,uint256,string)',
          [receiver.address, walletRoot, 'test-p1-p1sapr']
        );
        const signature = sign(data, mintingManager.address, coinbase);

        await expect(mintingManager.connect(spender).relay(data, signature))
          .to.emit(mintingManager, 'Relayed')
          .withArgs(spender.address, coinbase.address, '0x4c1819e0', utils.keccak256(data));

        const tokenId = await registry.childIdOf(walletRoot, 'test-p1-p1sapr')
        assert.equal(await registry.ownerOf(tokenId), receiver.address);
      })

      it('relay meta-safe mint with data', async () => {
        const data = mintingManager.interface.encodeFunctionData(
          'safeMintSLD(address,uint256,string,bytes)',
          [receiver.address, walletRoot, 'test-p1-p1saor', '0x']
        );
        const signature = sign(data, mintingManager.address, coinbase);

        await expect(mintingManager.connect(spender).relay(data, signature))
          .to.emit(mintingManager, 'Relayed')
          .withArgs(spender.address, coinbase.address, '0x58839d6b', utils.keccak256(data));
  
        const tokenId = await registry.childIdOf(walletRoot, 'test-p1-p1saor')
        assert.equal(await registry.ownerOf(tokenId), receiver.address)
      })

      it('relay meta-mint with records', async () => {
        const data = mintingManager.interface.encodeFunctionData(
          'mintSLDWithRecords(address,uint256,string,string[],string[])',
          [receiver.address, walletRoot, 'test-p1-p1adr', [], []]
        );
        const signature = sign(data, mintingManager.address, coinbase);

        await expect(mintingManager.connect(spender).relay(data, signature))
          .to.emit(mintingManager, 'Relayed')
          .withArgs(spender.address, coinbase.address, '0x39ccf4d0', utils.keccak256(data));
  
        const tokenId = await registry.childIdOf(walletRoot, 'test-p1-p1adr')
        assert.equal(await registry.ownerOf(tokenId), receiver.address)
      })
    })

    describe('Gas consumption', () => {
      function percDiff(a, b) {
        return -((a - b) / a) * 100
      }

      const getCases = () => {
        return [
          {
            func: 'mintSLD',
            funcSig: 'mintSLD(address,uint256,string)',
            params: [receiver.address, walletRoot, 't1-w1-'],
          },
          {
            func: 'safeMintSLD',
            funcSig: 'safeMintSLD(address,uint256,string)',
            params: [receiver.address, walletRoot, 't1-m1-'],
          },
          {
            func: 'safeMintSLD',
            funcSig: 'safeMintSLD(address,uint256,string,bytes)',
            params: [receiver.address, walletRoot, 't1-y1-', '0x'],
          },
        ]
      }

      it('Consumption', async () => {
        const result = []

        const cases = getCases()
        for (let i = 0; i < cases.length; i++) {
          const {funcSig, params} = cases[i]
          const [acc, root, token, ...rest] = params
          const relayParams = [acc, root, token + 'r', ...rest]
  
          const callData = mintingManager.interface.encodeFunctionData(funcSig, relayParams);
          const signature = sign(callData, mintingManager.address, coinbase);
          const relayTx = await mintingManager.connect(spender).relay(callData, signature)
          relayTx.receipt = await relayTx.wait();

          const tx = await mintingManager[funcSig](...params);
          tx.receipt = await tx.wait();

          result.push({
            funcSig,
            records: Array.isArray(params[2]) ? params[2].length : '-',
            send: tx.receipt.gasUsed.toString(),
            relay: relayTx.receipt.gasUsed.toString(),
            increase:
              percDiff(tx.receipt.gasUsed, relayTx.receipt.gasUsed).toFixed(2) +
              ' %',
          })
        }
        console.table(result)
      })
    })
  })

  describe('Tld-based claiming', () => {
    beforeEach(async () => {
      registry = await Registry.deploy();

      cryptoRegistry = await CryptoRegistry.deploy();
      cryptoMintingController = await CryptoMintingController.deploy(cryptoRegistry.address);
      await cryptoRegistry.addController(cryptoMintingController.address);
      cryptoResolver = await CryptoResolver.deploy(cryptoRegistry.address, cryptoMintingController.address);

      mintingManager = await MintingManager.deploy();
      await mintingManager.initialize(registry.address, cryptoMintingController.address, cryptoResolver.address);
      await mintingManager.addMinter(coinbase.address);

      await registry.initialize(mintingManager.address);
      await registry.setTokenURIPrefix('/');

      await cryptoMintingController.addMinter(mintingManager.address);
    })

    describe('claim(uint256,string)', () => {
      it('should claim .crypto domain in CNS registry', async () => {
        await mintingManager['claim(uint256,string)'](cryptoRoot, 'test-c221');

        const tokenId = await cryptoRegistry.childIdOf(cryptoRoot, `${DomainNamePrefix}test-c221`);
        expect(await cryptoRegistry.ownerOf(tokenId)).to.be.eql(coinbase.address);
        await expect(registry.ownerOf(tokenId)).to.be.revertedWith('ERC721: owner query for nonexistent token');
      })

      it('should claim .wallet domain in UNS registry', async () => {
        await mintingManager['claim(uint256,string)'](walletRoot, 'test-c029');

        const tokenId = await cryptoRegistry.childIdOf(walletRoot, `${DomainNamePrefix}test-c029`);
        assert.equal(await registry.ownerOf(tokenId), coinbase.address);
        await expect(cryptoRegistry.ownerOf(tokenId)).to.be.revertedWith('ERC721: owner query for nonexistent token');
      })
    })

    describe('claimTo(address,uint256,string)', () => {
      it('should claim .crypto domain in CNS registry', async () => {
        await mintingManager['claimTo(address,uint256,string)'](coinbase.address, cryptoRoot, 'test-c221');

        const tokenId = await cryptoRegistry.childIdOf(cryptoRoot, `${DomainNamePrefix}test-c221`);
        expect(await cryptoRegistry.ownerOf(tokenId)).to.be.eql(coinbase.address);
        await expect(registry.ownerOf(tokenId)).to.be.revertedWith('ERC721: owner query for nonexistent token');
      })

      it('should claim .wallet domain in UNS registry', async () => {
        await mintingManager['claimTo(address,uint256,string)'](coinbase.address, walletRoot, 'test-c029');

        const tokenId = await cryptoRegistry.childIdOf(walletRoot, `${DomainNamePrefix}test-c029`);
        assert.equal(await registry.ownerOf(tokenId), coinbase.address);
        await expect(cryptoRegistry.ownerOf(tokenId)).to.be.revertedWith('ERC721: owner query for nonexistent token');
      })
    })

    describe('claimToWithRecords(address,uint256,string,string[],string[])', () => {
      it('should mint with records .crypto domain in CNS registry', async () => {
        await mintingManager['claimToWithRecords(address,uint256,string,string[],string[])']
          (coinbase.address, cryptoRoot, 'test-c039', ['key1'], ['value3']);

        const tokenId = await cryptoRegistry.childIdOf(cryptoRoot, `${DomainNamePrefix}test-c039`);
        expect(await cryptoRegistry.ownerOf(tokenId)).to.be.eql(coinbase.address);
        await expect(registry.ownerOf(tokenId)).to.be.revertedWith('ERC721: owner query for nonexistent token');

        expect(await cryptoResolver.get('key1', tokenId)).to.be.eql('value3');
      })

      it('should claim with records .wallet domain in UNS registry', async () => {
        await mintingManager['claimToWithRecords(address,uint256,string,string[],string[])']
          (coinbase.address, walletRoot, 'test-c846', ['key9'], ['value2']);

        const tokenId = await cryptoRegistry.childIdOf(walletRoot, `${DomainNamePrefix}test-c846`);
        assert.equal(await registry.ownerOf(tokenId), coinbase.address);
        await expect(cryptoRegistry.ownerOf(tokenId)).to.be.revertedWith('ERC721: owner query for nonexistent token');

        expect(await registry.get('key9', tokenId)).to.be.eql('value2');
      })
    })
  })

  describe('Tld-based minting', () => {
    beforeEach(async () => {
      registry = await Registry.deploy();

      cryptoRegistry = await CryptoRegistry.deploy();
      cryptoMintingController = await CryptoMintingController.deploy(cryptoRegistry.address);
      await cryptoRegistry.addController(cryptoMintingController.address);
      cryptoResolver = await CryptoResolver.deploy(cryptoRegistry.address, cryptoMintingController.address);

      mintingManager = await MintingManager.deploy();
      await mintingManager.initialize(registry.address, cryptoMintingController.address, cryptoResolver.address);
      await mintingManager.addMinter(coinbase.address);

      await registry.initialize(mintingManager.address);
      await registry.setTokenURIPrefix('/');

      await cryptoMintingController.addMinter(mintingManager.address);
    })

    describe('mintSLD(address,uint256,string)', () => {
      it('should mint .crypto domain in CNS registry', async () => {
        await mintingManager['mintSLD(address,uint256,string)'](coinbase.address, cryptoRoot, 'test-m12');

        const tokenId = await cryptoRegistry.childIdOf(cryptoRoot, 'test-m12');
        expect(await cryptoRegistry.ownerOf(tokenId)).to.be.eql(coinbase.address);
        await expect(registry.ownerOf(tokenId)).to.be.revertedWith('ERC721: owner query for nonexistent token');
      })

      it('should mint .wallet domain in UNS registry', async () => {
        await mintingManager['mintSLD(address,uint256,string)'](coinbase.address, walletRoot, 'test-m241');

        const tokenId = await cryptoRegistry.childIdOf(walletRoot, 'test-m241');
        assert.equal(await registry.ownerOf(tokenId), coinbase.address);
        await expect(cryptoRegistry.ownerOf(tokenId)).to.be.revertedWith('ERC721: owner query for nonexistent token');
      })
    })

    describe('safeMintSLD(address,uint256,string)', () => {
      it('should safe-mint .crypto domain in CNS registry', async () => {
        await mintingManager['safeMintSLD(address,uint256,string)'](coinbase.address, cryptoRoot, 'test-m986');

        const tokenId = await cryptoRegistry.childIdOf(cryptoRoot, 'test-m986');
        expect(await cryptoRegistry.ownerOf(tokenId)).to.be.eql(coinbase.address);
        await expect(registry.ownerOf(tokenId)).to.be.revertedWith('ERC721: owner query for nonexistent token');
      })

      it('should safe-mint .wallet domain in UNS registry', async () => {
        await mintingManager['safeMintSLD(address,uint256,string)'](coinbase.address, walletRoot, 'test-m675');

        const tokenId = await cryptoRegistry.childIdOf(walletRoot, 'test-m675');
        assert.equal(await registry.ownerOf(tokenId), coinbase.address);
        await expect(cryptoRegistry.ownerOf(tokenId)).to.be.revertedWith('ERC721: owner query for nonexistent token');
      })
    })

    describe('safeMintSLD(address,uint256,string,bytes)', () => {
      it('should safe-mint .crypto domain in CNS registry', async () => {
        await mintingManager['safeMintSLD(address,uint256,string,bytes)'](coinbase.address, cryptoRoot, 'test-m636', '0x');

        const tokenId = await cryptoRegistry.childIdOf(cryptoRoot, 'test-m636');
        expect(await cryptoRegistry.ownerOf(tokenId)).to.be.eql(coinbase.address);
        await expect(registry.ownerOf(tokenId)).to.be.revertedWith('ERC721: owner query for nonexistent token');
      })

      it('should safe-mint .wallet domain in UNS registry', async () => {
        await mintingManager['safeMintSLD(address,uint256,string,bytes)'](coinbase.address, walletRoot, 'test-m999', '0x');

        const tokenId = await cryptoRegistry.childIdOf(walletRoot, 'test-m999');
        assert.equal(await registry.ownerOf(tokenId), coinbase.address);
        await expect(cryptoRegistry.ownerOf(tokenId)).to.be.revertedWith('ERC721: owner query for nonexistent token');
      })
    })

    describe('mintSLDWithRecords(address,uint256,string,string[],string[])', () => {
      it('should mint with records .crypto domain in CNS registry', async () => {
        await mintingManager['mintSLDWithRecords(address,uint256,string,string[],string[])']
          (coinbase.address, cryptoRoot, 'test-m110', ['key1'], ['value1']);

        const tokenId = await cryptoRegistry.childIdOf(cryptoRoot, 'test-m110');
        expect(await cryptoRegistry.ownerOf(tokenId)).to.be.eql(coinbase.address);
        await expect(registry.ownerOf(tokenId)).to.be.revertedWith('ERC721: owner query for nonexistent token');

        expect(await cryptoResolver.get('key1', tokenId)).to.be.eql('value1');
      })

      it('should mint with records .wallet domain in UNS registry', async () => {
        await mintingManager['mintSLDWithRecords(address,uint256,string,string[],string[])']
          (coinbase.address, walletRoot, 'test-m771', ['key1'], ['value1']);

        const tokenId = await cryptoRegistry.childIdOf(walletRoot, 'test-m771');
        assert.equal(await registry.ownerOf(tokenId), coinbase.address);
        await expect(cryptoRegistry.ownerOf(tokenId)).to.be.revertedWith('ERC721: owner query for nonexistent token');

        expect(await registry.get('key1', tokenId)).to.be.eql('value1');
      })
    })
  })

  describe('CryptoResolver management', () => {
    beforeEach(async () => {
      mintingManager = await MintingManager.deploy();
      await mintingManager.initialize(ZERO_ADDRESS, ZERO_ADDRESS, ZERO_ADDRESS);
    })

    it('should return zero resolver when initialized by zero address', async () => {
      assert.equal(await mintingManager.CryptoResolver(), ZERO_ADDRESS);
    })

    it('should update resolver', async () => {
      cryptoMintingController = await CryptoMintingController.deploy(ZERO_ADDRESS);
      cryptoResolver = await CryptoResolver.deploy(ZERO_ADDRESS, cryptoMintingController.address);
      await mintingManager.setResolver(cryptoResolver.address);

      assert.equal(await mintingManager.CryptoResolver(), cryptoResolver.address);
    })

    it('should revert update resolver when call by non-owner', async () => {
      cryptoMintingController = await CryptoMintingController.deploy(ZERO_ADDRESS);
      cryptoResolver = await CryptoResolver.deploy(ZERO_ADDRESS, cryptoMintingController.address);
      
      await expect(
        mintingManager.connect(signers[5]).setResolver(cryptoResolver.address)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    })
  })

  describe('Upgradable', () => {
    beforeEach(async () => {
      registry = await Registry.deploy();

      mintingManager = await upgrades.deployProxy(
        MintingManager,
        [registry.address, ZERO_ADDRESS, ZERO_ADDRESS],
        { initializer: 'initialize' }
      );
      await mintingManager.addMinter(coinbase.address);

      await registry.initialize(mintingManager.address);
      await registry.setTokenURIPrefix('/');
    })

    it('should persist state after proxy upgrade', async () => {
      cryptoMintingController = await CryptoMintingController.deploy(ZERO_ADDRESS);
      cryptoResolver = await CryptoResolver.deploy(ZERO_ADDRESS, cryptoMintingController.address);
      await mintingManager.setResolver(cryptoResolver.address);

      await upgrades.upgradeProxy(
        mintingManager.address,
        MintingManager,
        [registry.address, ZERO_ADDRESS, ZERO_ADDRESS],
        { initializer: 'initialize' }
      );

      assert.equal(await mintingManager.CryptoResolver(), cryptoResolver.address);
    })

    it('should be possible to set resolver after proxy upgrade', async () => {
      assert.equal(await mintingManager.CryptoResolver(), ZERO_ADDRESS);

      await upgrades.upgradeProxy(
        mintingManager.address,
        MintingManager,
        [registry.address, ZERO_ADDRESS, ZERO_ADDRESS],
        { initializer: 'initialize' }
      );
      
      cryptoMintingController = await CryptoMintingController.deploy(ZERO_ADDRESS);
      cryptoResolver = await CryptoResolver.deploy(ZERO_ADDRESS, cryptoMintingController.address);
      await mintingManager.setResolver(cryptoResolver.address);

      assert.equal(await mintingManager.CryptoResolver(), cryptoResolver.address);
    })
  })
})
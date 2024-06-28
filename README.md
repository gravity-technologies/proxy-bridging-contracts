# GRVT Proxy Bridging Contracts

This project contains proxy bridging contracts for GRVT.

## Project Structure

- `contracts/`: Smart contracts written in Solidity.
- `ignition/`: Ignition scripts for contract deployment.
- `test/`: Test files for the smart contracts.

## Setup
```shell
yarn
```

## Run tests
```shell
yarn test
REPORT_GAS=true yarn test
```

## Deploy
This project is deployed with [Hardhat Ignition](https://hardhat.org/ignition). 
### Localhost
```shell
yarn deploy --parameters ignition/local.dev.parameters.json --network localhost
```

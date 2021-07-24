# Changelog
All notable changes to this project will be documented in this file.

## [Unreleased]

## [0.2.0] - 2020-07-25
### Added
- Use jupiter-fs metadata subtype to filter all the metadata transactions

### Changed
- Update jupiter-node-sdk version to 0.4.0 increasing fee for binary transactions

## [0.1.1] - 2020-07-20
### Added
- Update jupiter-node-sdk version supporting jupiter subtypes for metis

### Changed
- Using SUBTYPE_MESSAGING_METIS_DATA subtype to filter request by the sutbypte

## [0.1.0] - 2020-07-07
### Added
- Compress binary data before to upload to Jupiter


### Changed
- Update metadata after fork from [moontography github](https://github.com/moontography/jupiter-fs)
- Increased minimumFndrAccountBalance and minimumUserAccountBalance by default
- Increased chunk sized to 40000 from 1000, avoiding lots of txs involved for a single file

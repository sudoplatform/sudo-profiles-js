# Sudo Profiles SDK for Web

## Project Setup

**Cloning this repo**

To clone this repo along with the submodule linkage execute this command:

`git clone --recurse-submodules git@gitlab.tools.anonyome.com:platform/identity/sudo-profiles-web.git`

**Getting the latest**

`git pull --recurse-submodules`

**Installing Dependencies**

`yarn install`

**Build Solution**

`yarn build`

## Setup integration tests

Visit the [Sudos section](https://sudoplatform.com/docs) of the Sudo Platform Developer Docs for SDK integration instructions.

## Running Unit and Integration tests

`yarn test`

## Release Procedure

**Publish Internal**

For new releases that contain new functionality we should publish internally first before publishing to Github.

To publish a new version of Sudo Profiles SDK for Web for internal consumption:

 - Create a new tag from master branch with the following naming `/alpha$/`

**Publish External**

For new releases that contain bug fixes or that have been through a `publish internal` procedure and have been signed off.

To publish a new version of Sudo Profiles SDK for Web to Github for external consumption:

 - Create a new tag from master with the release version. ie `1.0.0`

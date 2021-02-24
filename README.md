# ampnet-ae-middleware
[![CircleCI](https://circleci.com/gh/AMPnet/ampnet-ae-middleware/tree/master.svg?style=svg&circle-token=35f14133a9f2b81b248435d0a33f8a1a2953274a)](https://circleci.com/gh/AMPnet/ampnet-ae-middleware/tree/master) [![Codacy Badge](https://api.codacy.com/project/badge/Grade/fed96a11da7448b4b4245a39ce1c9871)](https://www.codacy.com/manual/AMPnet/ampnet-ae-middleware?utm_source=github.com&amp;utm_medium=referral&amp;utm_content=AMPnet/ampnet-ae-middleware&amp;utm_campaign=Badge_Grade) [![Language grade: JavaScript](https://img.shields.io/lgtm/grade/javascript/g/AMPnet/ampnet-ae-middleware.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/AMPnet/ampnet-ae-middleware/context:javascript) [![Total alerts](https://img.shields.io/lgtm/alerts/g/AMPnet/ampnet-ae-middleware.svg?logo=lgtm&logoWidth=18)](https://lgtm.com/projects/g/AMPnet/ampnet-ae-middleware/alerts/) [![FOSSA Status](https://app.fossa.com/api/projects/git%2Bgithub.com%2FAMPnet%2Fampnet-ae-middleware.svg?type=shield)](https://app.fossa.com/projects/git%2Bgithub.com%2FAMPnet%2Fampnet-ae-middleware?ref=badge_shield)

Middlware layer for communication with Aeternity Blockchain.

## Running tests

### All the tests:

```shell
docker-compose up -d
npm test
```

### Single-test:

```shell
docker-compose up -d
npm test --file ./test/global-setup.js ./test/happypath.test.js
```

## License
[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2FAMPnet%2Fampnet-ae-middleware.svg?type=large)](https://app.fossa.io/projects/git%2Bgithub.com%2FAMPnet%2Fampnet-ae-middleware?ref=badge_large)

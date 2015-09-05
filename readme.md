# Seguir - Restify Client / Server

[http://cliftonc.github.io/seguir/server](http://cliftonc.github.io/seguir)

[Pronounced: seh-geer]

[![Server API](https://img.shields.io/badge/documentation-server-green.svg)](http://cliftonc.github.io/seguir-server/server) [![Client API](https://img.shields.io/badge/documentation-client-green.svg)](http://cliftonc.github.io/seguir-server/client) [![Build Status](https://travis-ci.org/cliftonc/seguir.svg?style=flat)](https://travis-ci.org/cliftonc/seguir-server) [![bitHound Score](https://www.bithound.io/github/cliftonc/seguir/badges/score.svg)](https://www.bithound.io/github/cliftonc/seguir-server) [![js-semistandard-style](https://img.shields.io/badge/code%20style-semistandard-brightgreen.svg?style=flat-square)](https://github.com/Flet/semistandard)

## Contributing & Developing

I'm always looking for people to help out, regardless of what you think you can contribute - please reach out, and for high level contribution guidelines please read:

[Contribution Guide](https://github.com/cliftonc/seguir/blob/master/CONTRIBUTING.md)

### Docs

```shell
npm run docs
```

This will create API documents in /docs.

```shell
git subtree push --prefix doc origin gh-pages
```

This will push any documentation changes to gh-pages.

## Requires

This uses Node, Restify for the API server with Cassandra as a backend, and if using background workers requires Redis to manage the worker scheduling.
